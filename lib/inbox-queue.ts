/**
 * The Inbox's queue of dropped files, without the browser or the network (D-235).
 *
 * Files wait in the private `inbox` bucket until they are imported, and at most seven days. What
 * belongs here is every decision that needs no Storage call, so it is testable: what a picked file
 * is, whether it must be re-encoded first, where it is stored, and when it has expired. The
 * Storage calls themselves live in `lib/browser/inbox-storage.ts`.
 */

/** The bucket's own limit (migration 042); a bigger file would be refused after the upload began. */
export const INBOX_MAX_BYTES = 40 * 1024 * 1024;

/** The name the queue gives a statement: a random uuid and `.pdf`. No slash or dot-dot can match. */
export const INBOX_STATEMENT_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/u;

/** A queued file is removed this many days after it was added if nothing imported it. */
export const INBOX_KEEP_DAYS = 7;

export type InboxKind = "image" | "pdf";
export type InboxExtension = "png" | "jpg" | "webp" | "pdf";

export type InboxContentType = "image/png" | "image/jpeg" | "image/webp" | "application/pdf";

/** What to do with a picked file. `reencode` means decode it in the browser and upload a PNG. */
export type InboxPlan =
  | { readonly action: "upload"; readonly contentType: InboxContentType; readonly extension: InboxExtension }
  | { readonly action: "reencode"; readonly contentType: "image/png"; readonly extension: "png" }
  | { readonly action: "refuse"; readonly reason: string };

const DIRECT_BY_TYPE: Record<string, { contentType: InboxContentType; extension: InboxExtension }> = {
  "image/png": { contentType: "image/png", extension: "png" },
  "image/jpeg": { contentType: "image/jpeg", extension: "jpg" },
  "image/webp": { contentType: "image/webp", extension: "webp" },
  "application/pdf": { contentType: "application/pdf", extension: "pdf" }
};

const TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", pdf: "application/pdf"
};

/** Image extensions a browser may hand over with an empty type (HEIC on some phones). */
const OTHER_IMAGE_EXTENSIONS = new Set(["heic", "heif", "gif", "bmp", "avif", "tif", "tiff"]);

const extensionOf = (name: string): string => /\.([A-Za-z0-9]+)$/u.exec(name)?.[1]?.toLowerCase() ?? "";

/**
 * The plan for one picked file. The declared type decides; the extension is used only when the
 * browser gave no type at all. The original name is never used for anything else.
 */
export function planFile(file: { readonly name: string; readonly type: string; readonly size: number }): InboxPlan {
  if (file.size === 0) return { action: "refuse", reason: "The file is empty." };
  const extension = extensionOf(file.name);
  const type = file.type.toLowerCase() || TYPE_BY_EXTENSION[extension] || "";
  const direct = DIRECT_BY_TYPE[type];
  if (direct) {
    if (file.size > INBOX_MAX_BYTES) return { action: "refuse", reason: "The file is larger than 40 MB." };
    return { action: "upload", ...direct };
  }
  if (type.startsWith("image/") || (!file.type && OTHER_IMAGE_EXTENSIONS.has(extension))) {
    return { action: "reencode", contentType: "image/png", extension: "png" };
  }
  return { action: "refuse", reason: "Only images and PDFs can be added." };
}

/** `<ownerUid>/<id>.<extension>`, never the original file name. */
export function inboxPath(ownerUid: string, id: string, extension: InboxExtension): string {
  return `${ownerUid}/${id}.${extension}`;
}

/** The kind of a stored object, from its extension; `null` for anything the queue does not hold. */
export function kindOfObject(name: string): InboxKind | null {
  const extension = extensionOf(name);
  if (extension === "pdf") return "pdf";
  return extension === "png" || extension === "jpg" || extension === "webp" ? "image" : null;
}

/** A listed object, reduced to what the queue reads. `created_at` is Storage's own timestamp. */
export type InboxObject = { readonly name: string; readonly created_at: string | null };

/**
 * The objects added more than `INBOX_KEEP_DAYS` days before `now`. An object whose time is missing
 * or unreadable is kept: not knowing its age is no reason to delete it.
 */
export function expiredObjects<T extends InboxObject>(objects: readonly T[], now: Date): T[] {
  const cutoff = now.getTime() - INBOX_KEEP_DAYS * 24 * 60 * 60 * 1000;
  return objects.filter((object) => {
    if (!object.created_at) return false;
    const added = Date.parse(object.created_at);
    return Number.isFinite(added) && added < cutoff;
  });
}

/** "12 KB", "3.4 MB": whole kilobytes below a megabyte, one decimal above. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago"; an unreadable time says so. */
export function addedLabel(createdAt: string | null, now: Date): string {
  const added = createdAt ? Date.parse(createdAt) : Number.NaN;
  if (!Number.isFinite(added)) return "time unknown";
  const minutes = Math.floor((now.getTime() - added) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
