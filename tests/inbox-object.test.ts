import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { INBOX_MAX_BYTES } from "@/lib/inbox-queue";
import { downloadInboxObject } from "@/lib/server/inbox-object";

function client(info: { data: { size?: number } | null; error: unknown }, blob = { size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as unknown as Blob) {
  const download = vi.fn(async () => ({ data: blob, error: null }));
  const infoFn = vi.fn(async () => info);
  const fake = { storage: { from: () => ({ info: infoFn, download }) } } as unknown as SupabaseClient;
  return { fake, download };
}

describe("downloadInboxObject", () => {
  it("refuses an object over the cap from its metadata, without downloading", async () => {
    const { fake, download } = client({ data: { size: INBOX_MAX_BYTES + 1 }, error: null });
    expect(await downloadInboxObject(fake, "u", "a.pdf")).toEqual({ ok: false, code: "TOO_LARGE" });
    expect(download).not.toHaveBeenCalled();
  });

  it("answers NOT_FOUND when the metadata is missing, without downloading", async () => {
    const { fake, download } = client({ data: null, error: { message: "x" } });
    expect(await downloadInboxObject(fake, "u", "a.pdf")).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(download).not.toHaveBeenCalled();
  });

  it("downloads an object within the cap", async () => {
    const { fake } = client({ data: { size: 3 }, error: null });
    const out = await downloadInboxObject(fake, "u", "a.pdf");
    expect(out.ok).toBe(true);
  });
});
