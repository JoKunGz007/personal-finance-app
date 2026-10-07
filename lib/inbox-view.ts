/**
 * How the Inbox "Waiting" queue is laid out on this device: a table (default) or cards. The choice is
 * a display preference only, kept in localStorage; every access is guarded, so a browser that refuses
 * storage or holds anything unexpected simply shows the table.
 */
export type InboxView = "table" | "cards";

export const INBOX_VIEW_KEY = "inbox-queue-view";

type ViewStorage = Pick<Storage, "getItem" | "setItem">;

export function parseInboxView(raw: string | null | undefined): InboxView {
  return raw === "cards" ? "cards" : "table";
}

/** The saved view, or "table" when nothing is saved or storage cannot be read. */
export function loadInboxView(storage?: ViewStorage): InboxView {
  try {
    return parseInboxView((storage ?? globalThis.localStorage).getItem(INBOX_VIEW_KEY));
  } catch {
    return "table";
  }
}

export function saveInboxView(view: InboxView, storage?: ViewStorage): void {
  try {
    (storage ?? globalThis.localStorage).setItem(INBOX_VIEW_KEY, view);
  } catch {
    // Not remembering the choice is harmless.
  }
}

/** The plain type word shown for a queued object, from `kindOfObject`'s answer. */
export function kindLabel(kind: "image" | "pdf" | null): "Image" | "PDF" | "File" {
  return kind === "pdf" ? "PDF" : kind === "image" ? "Image" : "File";
}
