import type { browserSupabase } from "@/lib/browser/supabase";
import { uploadNamedToInbox } from "@/lib/browser/inbox-storage";
import { lineObjectName } from "@/lib/inbox-queue";

/**
 * Moves images the LINE bot is holding into the /inbox bucket queue (D-241).
 *
 * **The browser calls the RPCs directly, not an /api/v1 route.** An image can be 10 MB and a Vercel
 * function response is capped at 4.5 MB, so the bytes cannot pass through the server. The owner's
 * aal2 session calls `list_line_inbox`, `read_line_inbox_item` and `delete_line_inbox_item` (each
 * checks strong owner access itself); the CSP already allows the Supabase origin.
 *
 * A held image is deleted only after Storage confirmed the copy. One failing row is counted and kept
 * for next time; nothing here throws or logs.
 */

type Client = NonNullable<ReturnType<typeof browserSupabase>>;

type HeldRow = { id: number; line_message_id: string; content_type: string; received_at: string };

function toBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

export async function moveLineImages(supabase: Client, uid: string): Promise<{ moved: number; failed: number }> {
  let moved = 0;
  let failed = 0;
  try {
    const listed = await supabase.rpc("list_line_inbox");
    if (listed.error || !Array.isArray(listed.data)) return { moved, failed };
    for (const row of listed.data as HeldRow[]) {
      try {
        const contentType = row.content_type;
        if (contentType !== "image/jpeg" && contentType !== "image/png") { failed += 1; continue; }
        const name = lineObjectName(row.received_at, row.line_message_id, contentType);
        if (!name) { failed += 1; continue; }
        const read = await supabase.rpc("read_line_inbox_item", { p_id: row.id });
        if (read.error || typeof read.data !== "string") { failed += 1; continue; }
        const uploaded = await uploadNamedToInbox(supabase, uid, name, toBlob(read.data, contentType), contentType);
        if (!uploaded.ok) { failed += 1; continue; }
        const removed = await supabase.rpc("delete_line_inbox_item", { p_id: row.id });
        if (removed.error) { failed += 1; continue; }
        moved += 1;
      } catch {
        failed += 1;
      }
    }
  } catch {
    failed += 1;
  }
  return { moved, failed };
}
