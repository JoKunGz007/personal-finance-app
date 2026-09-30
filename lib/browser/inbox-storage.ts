import type { browserSupabase } from "@/lib/browser/supabase";
import {
  expiredObjects, inboxPath, type InboxContentType, type InboxExtension, type InboxObject
} from "@/lib/inbox-queue";

/**
 * The Inbox queue's Storage calls (D-235), and the **only** module in the app allowed to touch
 * Storage: `tests/privacy.test.ts` fails if any other file does, or if this one names a bucket other
 * than `inbox`. It reverses D-050 for that one private bucket and nothing else. Capture schemas
 * still carry no image field.
 *
 * Every path is `<ownerUid>/<random id>.<extension>`, which is what the bucket's policies (migration
 * 042) require. Deletes go through the Storage API, because a SQL delete is refused by a trigger.
 */

type Client = NonNullable<ReturnType<typeof browserSupabase>>;

const BUCKET = "inbox";

/** A listed file, with the size Storage reports. */
export type WaitingFile = InboxObject & { readonly size: number | null };

export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly why: string };

const SIGN_IN = "Sign in and finish two-step verification to use the inbox.";
const UNREACHABLE = "The inbox could not be reached. Try again.";

/** The signed-in owner's id, which is the first path segment of everything they may store. */
export async function ownerUid(supabase: Client): Promise<Outcome<string>> {
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { ok: true, value: user.id } : { ok: false, why: SIGN_IN };
}

/** Uploads one file to a fresh random path; never overwrites. */
export async function uploadToInbox(
  supabase: Client, uid: string, body: Blob, contentType: InboxContentType, extension: InboxExtension
): Promise<Outcome<string>> {
  const path = inboxPath(uid, crypto.randomUUID(), extension);
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType, upsert: false });
  if (!error) return { ok: true, value: path };
  // A policy refusal means the session is not the strong owner one; anything else is the network.
  return { ok: false, why: /row-level security|unauthorized|403/iu.test(error.message) ? SIGN_IN : UNREACHABLE };
}

/** The owner's waiting files, oldest first. Folders and placeholders are not files. */
export async function listWaiting(supabase: Client, uid: string): Promise<Outcome<WaitingFile[]>> {
  const { data, error } = await supabase.storage.from(BUCKET).list(uid, {
    limit: 1000, sortBy: { column: "created_at", order: "asc" }
  });
  if (error || !data) return { ok: false, why: UNREACHABLE };
  const files = data
    .filter((entry) => entry.id !== null)
    .map((entry) => ({
      name: entry.name,
      created_at: entry.created_at ?? null,
      size: typeof entry.metadata?.size === "number" ? entry.metadata.size : null
    }));
  return { ok: true, value: files };
}

/** Removes files by name within the owner's folder, through the Storage API. */
export async function removeFromInbox(supabase: Client, uid: string, names: readonly string[]): Promise<Outcome<number>> {
  if (names.length === 0) return { ok: true, value: 0 };
  const { data, error } = await supabase.storage.from(BUCKET).remove(names.map((name) => `${uid}/${name}`));
  return error || !data ? { ok: false, why: UNREACHABLE } : { ok: true, value: data.length };
}

/** Removes every file added more than seven days ago and says how many went. */
export async function removeExpired(supabase: Client, uid: string, now: Date): Promise<Outcome<number>> {
  const listed = await listWaiting(supabase, uid);
  if (!listed.ok) return listed;
  return removeFromInbox(supabase, uid, expiredObjects(listed.value, now).map((object) => object.name));
}
