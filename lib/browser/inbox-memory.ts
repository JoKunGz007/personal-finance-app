import { parseRemembered, pruneRemembered, REMEMBERED_KEY, type RememberedKind } from "@/lib/inbox-drain";

/**
 * The one thing the Inbox remembers on this device (D-235): which queued files were already settled
 * as "not recognised" or "slip needing checking", so a later drain skips their Vision read. Only the
 * queue's random object names (and which of the two) are kept, never a file's content, and every
 * access is guarded: a browser that refuses storage (or holds garbage) just means the files are read
 * again.
 */

export function loadRemembered(): Map<string, RememberedKind> {
  try {
    return parseRemembered(globalThis.localStorage.getItem(REMEMBERED_KEY));
  } catch {
    return new Map();
  }
}

/** Stores the remembered names that are still in the queue. */
export function saveRemembered(remembered: ReadonlyMap<string, RememberedKind>, inQueue: readonly string[]): void {
  try {
    globalThis.localStorage.setItem(REMEMBERED_KEY, JSON.stringify(pruneRemembered(remembered, inQueue)));
  } catch {
    // Not remembering is harmless.
  }
}
