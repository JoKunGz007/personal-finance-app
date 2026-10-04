import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The pure half of the LINE webhook (D-241): signature check, which events
 * to act on, and which replies to send. No I/O, so every rule here is unit-testable. LINE's JSON is
 * never trusted: each field is checked before use.
 */

/** base64(HMAC-SHA256(channelSecret, raw body)), compared in constant time. */
export function verifyLineSignature(rawBody: string, signatureHeader: string | null, channelSecret: string): boolean {
  if (!signatureHeader || !channelSecret) return false;
  const expected = Buffer.from(createHmac("sha256", channelSecret).update(rawBody, "utf8").digest("base64"), "utf8");
  const given = Buffer.from(signatureHeader, "utf8");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

export type LineImageSet = { id: string; index: number; total: number };
export type PlannedImage = { messageId: string; replyToken: string; imageSet?: LineImageSet; isRedelivery: boolean };
export type PlannedNonImage = { replyToken: string };
export type LinePlan = { images: PlannedImage[]; nonImages: PlannedNonImage[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readImageSet(value: unknown): LineImageSet | undefined {
  if (!isRecord(value)) return undefined;
  const { id, index, total } = value;
  if (typeof id !== "string") return undefined;
  if (!Number.isInteger(index) || !Number.isInteger(total)) return undefined;
  const i = index as number;
  const t = total as number;
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(id)) return undefined;
  if (t < 1 || t > 20 || i < 1 || i > t) return undefined;
  return { id, index: i, total: t };
}

export function planLineEvents(body: unknown, ownerUserId: string): LinePlan {
  const plan: LinePlan = { images: [], nonImages: [] };
  if (!ownerUserId || !isRecord(body) || !Array.isArray(body.events)) return plan;
  for (const event of body.events.slice(0, 100)) {
    if (!isRecord(event) || event.type !== "message") continue;
    const source = event.source;
    if (!isRecord(source) || source.type !== "user" || source.userId !== ownerUserId) continue;
    const replyToken = event.replyToken;
    if (typeof replyToken !== "string" || replyToken.length === 0 || replyToken.length > 256) continue;
    const message = event.message;
    if (!isRecord(message)) continue;
    if (message.type !== "image") {
      plan.nonImages.push({ replyToken });
      continue;
    }
    const provider = message.contentProvider;
    if (!isRecord(provider) || provider.type !== "line") continue;
    if (typeof message.id !== "string" || !/^[0-9]{1,32}$/u.test(message.id)) continue;
    const delivery = event.deliveryContext;
    const image: PlannedImage = {
      messageId: message.id,
      replyToken,
      isRedelivery: isRecord(delivery) && delivery.isRedelivery === true
    };
    const imageSet = readImageSet(message.imageSet);
    if (imageSet) image.imageSet = imageSet;
    plan.images.push(image);
  }
  return plan;
}

export type ImageOutcome = "stored" | "duplicate" | "failed";
export type Reply = { replyToken: string; text: string };

const noun = (count: number) => (count === 1 ? "image" : "images");

export function planLineReplies(
  images: Array<PlannedImage & { outcome: ImageOutcome; setStored?: number | null }>,
  nonImages: PlannedNonImage[],
  origin: string
): Reply[] {
  const link = `${origin}/inbox`;
  const replies: Reply[] = [];
  const failed = images.filter((image) => image.outcome === "failed");
  if (failed.length > 0) {
    replies.push({ replyToken: failed[0]!.replyToken, text: `Couldn't save ${failed.length} ${noun(failed.length)}. Open /inbox, then send again: ${link}` });
  }
  for (const image of images) {
    // A set is confirmed by the event whose own store made the database count reach the total. A
    // duplicate confirms only when LINE says it is a redelivery (the first reply may have been lost).
    if (image.outcome === "failed") continue;
    if (image.outcome === "duplicate" && !image.isRedelivery) continue;
    if (image.setStored !== (image.imageSet ? image.imageSet.total : 1)) continue;
    const count = image.imageSet ? image.imageSet.total : 1;
    replies.push({ replyToken: image.replyToken, text: `Got ${count} ${noun(count)}. Open /inbox: ${link}` });
  }
  for (const item of nonImages) {
    replies.push({ replyToken: item.replyToken, text: `I only take images. Send PDFs through Add files on /inbox: ${link}` });
  }
  const seen = new Set<string>();
  return replies.filter((reply) => (seen.has(reply.replyToken) ? false : (seen.add(reply.replyToken), true)));
}
