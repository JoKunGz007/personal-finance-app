import { browserSupabase } from "@/lib/browser/supabase";
import { downloadFromInbox, ownerUid, removeFromInbox, type Outcome } from "@/lib/browser/inbox-storage";
import { isInboxImageName } from "@/lib/inbox-queue";

/**
 * A queued slip opened on the Slips page (`/slips?inbox=<name>`, D-261): its bytes come from the
 * owner's own Inbox folder and go into the same single-slip flow a picked file takes. The queued
 * file leaves the Inbox **only after the capture answered captured or already-stored**; a removal
 * that fails never undoes the capture. Every Storage call is `lib/browser/inbox-storage.ts`'s.
 */

export const INBOX_SLIP_BAD_NAME = "That Inbox link is not a queued image's name.";
export const INBOX_SLIP_GONE =
  "This slip is no longer in the Inbox (it was removed, or is older than seven days), or the Inbox could not be reached.";
export const INBOX_SLIP_REMOVED = "It was removed from the Inbox.";
export const INBOX_SLIP_NOT_REMOVED = "The slip is saved, but it could not be removed from the Inbox; remove it there.";

const TYPE_BY_EXTENSION: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

/** The opened queued image, or why it could not be opened. Refuses a bad name before any Storage call. */
export async function openInboxSlip(name: string): Promise<Outcome<File>> {
  if (!isInboxImageName(name)) return { ok: false, why: INBOX_SLIP_BAD_NAME };
  try {
    const supabase = browserSupabase();
    if (!supabase) return { ok: false, why: INBOX_SLIP_GONE };
    const uid = await ownerUid(supabase);
    if (!uid.ok) return uid;
    const downloaded = await downloadFromInbox(supabase, uid.value, name);
    if (!downloaded.ok) return { ok: false, why: INBOX_SLIP_GONE };
    const extension = name.slice(name.lastIndexOf(".") + 1);
    const type = downloaded.value.type || TYPE_BY_EXTENSION[extension] || "image/png";
    return { ok: true, value: new File([downloaded.value], name, { type }) };
  } catch {
    return { ok: false, why: INBOX_SLIP_GONE };
  }
}

/** Removes a captured slip's queued file and says in words whether that worked. */
export async function releaseInboxSlip(name: string): Promise<{ readonly ok: boolean; readonly text: string }> {
  try {
    const supabase = browserSupabase();
    const uid = supabase ? await ownerUid(supabase) : null;
    const removed = supabase && uid?.ok ? await removeFromInbox(supabase, uid.value, [name]) : null;
    if (removed?.ok && removed.value === 1) return { ok: true, text: INBOX_SLIP_REMOVED };
  } catch {
    // Falls through to the same sentence: the capture itself already succeeded.
  }
  return { ok: false, text: INBOX_SLIP_NOT_REMOVED };
}
