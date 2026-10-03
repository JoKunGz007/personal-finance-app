import type { SupabaseClient } from "@supabase/supabase-js";
import { INBOX_MAX_BYTES } from "@/lib/inbox-queue";

// The one server module that touches Supabase Storage. It downloads a single object from the
// owner's folder of the private `inbox` bucket, through the owner's own client, so the bucket's
// policies still decide. Only a code comes back on failure, never the Storage message.

const BUCKET = "inbox";

export type InboxDownload =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; code: "NOT_FOUND" | "TOO_LARGE" };

export async function downloadInboxObject(client: SupabaseClient, uid: string, objectName: string): Promise<InboxDownload> {
  // The size from Storage's metadata first, so an oversized object is never pulled into memory.
  const path = `${uid}/${objectName}`;
  const bucket = client.storage.from(BUCKET);
  const info = await bucket.info(path);
  if (info.error || !info.data) return { ok: false, code: "NOT_FOUND" };
  if (typeof info.data.size === "number" && info.data.size > INBOX_MAX_BYTES) return { ok: false, code: "TOO_LARGE" };
  // The check after the download stays as a backstop for metadata that carries no size.
  const { data, error } = await bucket.download(path);
  if (error || !data) return { ok: false, code: "NOT_FOUND" };
  if (data.size > INBOX_MAX_BYTES) return { ok: false, code: "TOO_LARGE" };
  return { ok: true, bytes: new Uint8Array(await data.arrayBuffer()) };
}
