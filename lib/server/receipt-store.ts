import { captureReceiptRequest, receiptCaptureSchema } from "@/lib/receipts";
import type { strongOwnerClient } from "@/lib/server/supabase";

type OwnerClient = Extract<Awaited<ReturnType<typeof strongOwnerClient>>, { ok: true }>["supabase"];

export type ReceiptCaptureResult =
  | { ok: true; data: { captured: boolean } & Record<string, unknown> }
  | { ok: false; reason: "invalid"; message: string; details: unknown }
  | { ok: false; reason: "disagrees" | "refused" };

/**
 * One receipt through `capture_receipt`, under the owner's own session: the page's upload and
 * mailbox Sync (D-232) both come through here, so both are held to the same schema and refusals.
 * An error's message is read only to tell a disagreement apart and is never passed on — it can
 * name a stored value.
 */
export async function captureReceipt(supabase: OwnerClient, body: unknown): Promise<ReceiptCaptureResult> {
  const parsed = receiptCaptureSchema.safeParse(body);
  // The first issue's message is static text from `lib/receipts.ts`, never a value.
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: parsed.error.issues[0]?.message ?? "unknown field", details: parsed.error.flatten() };
  }
  const { data, error } = await supabase.rpc("capture_receipt", { p_request: captureReceiptRequest(parsed.data) });
  if (error) return { ok: false, reason: error.message.includes("disagrees with the stored value") ? "disagrees" : "refused" };
  return { ok: true, data: data as { captured: boolean } & Record<string, unknown> };
}
