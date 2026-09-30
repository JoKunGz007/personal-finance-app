import { parseRemembered, pruneRemembered, UNRECOGNISED_KEY } from "@/lib/inbox-drain";

/**
 * The one thing the Inbox remembers on this device (D-235): which queued files were already found
 * "not recognised", so a later drain skips their Vision read. Only the queue's random object names
 * are kept, never a file's content, and every access is guarded: a browser that refuses storage (or
 * holds garbage) just means the files are read again.
 */

export function loadUnrecognised(): Set<string> {
  try {
    return parseRemembered(globalThis.localStorage.getItem(UNRECOGNISED_KEY));
  } catch {
    return new Set();
  }
}

/** Stores the remembered names that are still in the queue. */
export function saveUnrecognised(remembered: ReadonlySet<string>, inQueue: readonly string[]): void {
  try {
    globalThis.localStorage.setItem(UNRECOGNISED_KEY, JSON.stringify(pruneRemembered(remembered, inQueue)));
  } catch {
    // Not remembering is harmless.
  }
}
