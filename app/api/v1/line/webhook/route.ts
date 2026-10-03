import {
  planLineEvents, planLineReplies, verifyLineSignature, type ImageOutcome, type PlannedImage
} from "@/lib/line-webhook";
import { anonServerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The LINE bot's webhook: the owner sends images to the bot, they are held for /inbox (D-241).
 *
 * **Deliberately not `strongOwnerClient`.** LINE's servers call this route; there is no browser, no
 * cookie and no second factor, so no owner session can exist here, and a deployment with a
 * service-role key was rejected (D-141: it opens the whole database). Authority comes from two
 * things instead. First, LINE's HMAC-SHA256 signature over the raw body, checked before anything is
 * parsed. Second, `LINE_INBOX_SECRET`, its own random value (not derived from the channel secret, so a
 * leaked channel secret does not give direct access to the enqueue function and the owner-ID check
 * cannot be bypassed that way), which the database checks inside `line_inbox_enqueue`, whose only power is to append one JPEG or PNG to a private
 * holding table under row and size caps (migration 043). A caller who defeats both can fill that
 * table; they cannot read anything or reach the ledger.
 *
 * Only the owner's own image messages are acted on (sender checked against `LINE_OWNER_USER_ID`).
 * Everything else is dropped without a reply, so the bot tells a stranger nothing.
 *
 * **Nothing here logs** an image, a user ID, a token or a message: the route handles all four.
 *
 * Once the signature verifies the answer is always 200, even if storing failed: the owner is told
 * by the reply, and a non-200 would only make LINE redeliver. Redeliveries are safe because LINE's
 * message ID is the idempotency key in the database.
 */

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png"]);

const empty = () => Response.json({}, { status: 200, headers: { "Cache-Control": "no-store" } });
const refuse = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

type Enqueue = (secret: string, messageId: string, contentType: string, base64: string) => Promise<ImageOutcome>;

async function fetchImage(messageId: string, token: string): Promise<{ contentType: string; base64: string } | null> {
  try {
    const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) return null;
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!ACCEPTED_TYPES.has(contentType)) return null;
    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return { contentType, base64: bytes.toString("base64") };
  } catch {
    return null;
  }
}

async function storeOne(image: PlannedImage, token: string, secret: string, enqueue: Enqueue): Promise<ImageOutcome> {
  const fetched = await fetchImage(image.messageId, token);
  if (!fetched) return "failed";
  try {
    return await enqueue(secret, image.messageId, fetched.contentType, fetched.base64);
  } catch {
    return "failed";
  }
}

export async function POST(request: Request) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  const ownerUserId = process.env.LINE_OWNER_USER_ID ?? "";
  const secret = process.env.LINE_INBOX_SECRET ?? "";
  if (!channelSecret || !accessToken || !ownerUserId || secret.length < 32) return refuse(503);

  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return refuse(413);
  const rawBody = await request.text().catch(() => null);
  if (rawBody === null) return refuse(400);
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) return refuse(413);

  if (!verifyLineSignature(rawBody, request.headers.get("x-line-signature"), channelSecret)) return refuse(401);

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return refuse(400);
  }

  const plan = planLineEvents(body, ownerUserId);
  if (plan.images.length === 0 && plan.nonImages.length === 0) return empty();

  const client = anonServerClient();
  const enqueue: Enqueue = async (inboxSecret, messageId, contentType, base64) => {
    if (!client) return "failed";
    const { data, error } = await client.rpc("line_inbox_enqueue", {
      p_secret: inboxSecret, p_message_id: messageId, p_content_type: contentType, p_content_base64: base64
    });
    if (error || (data !== "stored" && data !== "duplicate")) return "failed";
    return data;
  };

  // Sequential: a burst of photos must not hold many 10 MB buffers at once.
  const outcomes: Array<PlannedImage & { outcome: ImageOutcome }> = [];
  for (const image of plan.images) {
    outcomes.push({ ...image, outcome: await storeOne(image, accessToken, secret, enqueue) });
  }

  const origin = new URL(request.url).origin;
  for (const reply of planLineReplies(outcomes, plan.nonImages, origin)) {
    try {
      await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ replyToken: reply.replyToken, messages: [{ type: "text", text: reply.text }] }),
        signal: AbortSignal.timeout(5_000)
      });
    } catch {
      // A reply that does not arrive costs the owner a confirmation, nothing more.
    }
  }
  return empty();
}
