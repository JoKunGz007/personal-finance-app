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
 *
 * **A row that keeps failing is counted per message ID on this device** and, from its third failure,
 * reported as stuck (once, not as a failure) so /inbox can offer to discard it. Nothing is deleted
 * automatically: the bytes go only after Storage confirmed the copy, or when the owner discards.
 */

type Client = NonNullable<ReturnType<typeof browserSupabase>>;

type HeldRow = { id: number; line_message_id: string; content_type: string; received_at: string };

function toBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

export const STUCK_AFTER = 3;
/** Failures closer together than this count once, so reloads during one outage can't mark an image stuck. */
export const FAILURE_SPACING_MS = 60 * 60 * 1000;
const FAILURES_KEY = "inbox:line-failures:v2";

/** Failures counted for one message, and when the last counted one happened. */
export type Failure = { n: number; at: number };

/** Where failure counts are kept; the browser's localStorage unless a test passes its own. */
export type FailureStore = { load(): Record<string, Failure>; save(counts: Record<string, Failure>): void };

export const browserFailureStore: FailureStore = {
  load() {
    try {
      const parsed: unknown = JSON.parse(globalThis.localStorage.getItem(FAILURES_KEY) ?? "{}");
      const counts: Record<string, Failure> = {};
      if (parsed && typeof parsed === "object") {
        for (const [key, value] of Object.entries(parsed)) {
          const { n, at } = (value ?? {}) as Partial<Failure>;
          if (/^[0-9]{1,32}$/u.test(key) && Number.isInteger(n) && (n as number) > 0 && Number.isFinite(at)) {
            counts[key] = { n: n as number, at: at as number };
          }
        }
      }
      return counts;
    } catch {
      return {};
    }
  },
  save(counts) {
    try {
      globalThis.localStorage.setItem(FAILURES_KEY, JSON.stringify(counts));
    } catch {
      // Not counting only means the plain message stays.
    }
  }
};

export type StuckImage = { id: number; messageId: string };

export async function moveLineImages(
  supabase: Client, uid: string, store: FailureStore = browserFailureStore, now: () => number = Date.now
): Promise<{ moved: number; failed: number; stuck: StuckImage[] }> {
  let moved = 0;
  let failed = 0;
  const stuck: StuckImage[] = [];
  try {
    const listed = await supabase.rpc("list_line_inbox");
    if (listed.error || !Array.isArray(listed.data)) return { moved, failed, stuck };
    const before = store.load();
    const after: Record<string, Failure> = {};
    for (const row of listed.data as HeldRow[]) {
      const key = String(row.line_message_id);
      let ok = false;
      try {
        ok = await moveOne(supabase, uid, row);
      } catch {
        ok = false;
      }
      if (ok) { moved += 1; continue; }
      const prior = before[key];
      const at = now();
      const entry = !prior ? { n: 1, at } : at - prior.at >= FAILURE_SPACING_MS ? { n: prior.n + 1, at } : prior;
      after[key] = entry;
      if (entry.n >= STUCK_AFTER) stuck.push({ id: row.id, messageId: key });
      else failed += 1;
    }
    store.save(after);
  } catch {
    failed += 1;
  }
  return { moved, failed, stuck };
}

async function moveOne(supabase: Client, uid: string, row: HeldRow): Promise<boolean> {
  const contentType = row.content_type;
  if (contentType !== "image/jpeg" && contentType !== "image/png") return false;
  const name = lineObjectName(row.received_at, row.line_message_id, contentType);
  if (!name) return false;
  const read = await supabase.rpc("read_line_inbox_item", { p_id: row.id });
  if (read.error || typeof read.data !== "string") return false;
  const uploaded = await uploadNamedToInbox(supabase, uid, name, toBlob(read.data, contentType), contentType);
  if (!uploaded.ok) return false;
  const removed = await supabase.rpc("delete_line_inbox_item", { p_id: row.id });
  return !removed.error;
}

/** The owner's explicit discard of a stuck image: drops its bytes, keeps the redelivery marker. */
export async function discardLineImage(supabase: Client, stuck: StuckImage, store: FailureStore = browserFailureStore): Promise<boolean> {
  try {
    const removed = await supabase.rpc("delete_line_inbox_item", { p_id: stuck.id });
    if (removed.error) return false;
    const counts = store.load();
    delete counts[stuck.messageId];
    store.save(counts);
    return true;
  } catch {
    return false;
  }
}

/** Whether the bot is connected, and since when when that is known; null when it could not be read. */
export async function lineBotStatus(supabase: Client): Promise<{ connected: boolean; connectedAt: string | null } | null> {
  try {
    const { data, error } = await supabase.rpc("line_bot_status");
    const row: unknown = Array.isArray(data) ? data[0] : data;
    if (error || !row || typeof row !== "object") return null;
    const { connected, connected_at: at } = row as { connected?: unknown; connected_at?: unknown };
    if (typeof connected !== "boolean") return null;
    return { connected, connectedAt: typeof at === "string" ? at : null };
  } catch {
    return null;
  }
}
