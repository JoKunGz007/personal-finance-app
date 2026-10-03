import { describe, expect, it, vi } from "vitest";
import { uploadNamedToInbox } from "@/lib/browser/inbox-storage";
import { moveLineImages } from "@/lib/browser/line-inbox";
import { lineObjectName } from "@/lib/inbox-queue";

// Moving held LINE images into the bucket queue (D-241), with a mocked client. Every value is invented.
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]).toString("base64");
const RECEIVED = "2026-09-30T10:00:00.000Z";
const row = (id: number, messageId = String(100000 + id)) => ({
  id, line_message_id: messageId, content_type: "image/png", byte_size: 5, received_at: RECEIVED
});

function client(options: {
  rows?: ReturnType<typeof row>[];
  readError?: number;
  upload?: (path: string) => { message: string; statusCode?: string } | null;
  deleteError?: number;
}) {
  const calls = { uploads: [] as string[], deleted: [] as number[] };
  const supabase = {
    rpc: vi.fn(async (name: string, args?: { p_id?: number }) => {
      if (name === "list_line_inbox") return { data: options.rows ?? [], error: null };
      if (name === "read_line_inbox_item") {
        return args?.p_id === options.readError ? { data: null, error: { message: "x" } } : { data: PNG_B64, error: null };
      }
      if (name === "delete_line_inbox_item") {
        if (args?.p_id === options.deleteError) return { data: null, error: { message: "x" } };
        calls.deleted.push(args!.p_id!);
        return { data: true, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    }),
    storage: { from: (bucket: string) => ({
      upload: async (path: string) => {
        expect(bucket).toBe("inbox");
        calls.uploads.push(path);
        return { error: options.upload?.(path) ?? null };
      }
    }) }
  };
  return { supabase: supabase as never, calls };
}

describe("moveLineImages", () => {
  it("uploads under the LINE name, then deletes the held row", async () => {
    const { supabase, calls } = client({ rows: [row(1), row(2)] });
    expect(await moveLineImages(supabase, "uid")).toEqual({ moved: 2, failed: 0 });
    expect(calls.uploads).toEqual([
      `uid/${lineObjectName(RECEIVED, "100001", "image/png")}`, `uid/${lineObjectName(RECEIVED, "100002", "image/png")}`
    ]);
    expect(calls.deleted).toEqual([1, 2]);
  });
  it("keeps the row when the upload fails and carries on", async () => {
    const { supabase, calls } = client({ rows: [row(1), row(2)], upload: (path) => (path.includes("100001") ? { message: "network" } : null) });
    expect(await moveLineImages(supabase, "uid")).toEqual({ moved: 1, failed: 1 });
    expect(calls.deleted).toEqual([2]);
  });
  it("counts a failed delete without throwing", async () => {
    const { supabase } = client({ rows: [row(1)], deleteError: 1 });
    expect(await moveLineImages(supabase, "uid")).toEqual({ moved: 0, failed: 1 });
  });
  it("continues after a failed read, and uploads nothing for it", async () => {
    const { supabase, calls } = client({ rows: [row(1), row(2)], readError: 1 });
    expect(await moveLineImages(supabase, "uid")).toEqual({ moved: 1, failed: 1 });
    expect(calls.uploads).toHaveLength(1);
    expect(calls.deleted).toEqual([2]);
  });
  it("treats an already-existing object as stored and deletes the row", async () => {
    const { supabase, calls } = client({ rows: [row(1)], upload: () => ({ message: "The resource already exists", statusCode: "409" }) });
    expect(await moveLineImages(supabase, "uid")).toEqual({ moved: 1, failed: 0 });
    expect(calls.deleted).toEqual([1]);
  });
  it("does not read a message that merely mentions 409 as already stored", async () => {
    const { supabase, calls } = client({ rows: [row(1)], upload: () => ({ message: "upstream 409 gateway trouble", statusCode: "500" }) });
    expect(await moveLineImages(supabase, "uid")).toEqual({ moved: 0, failed: 1 });
    expect(calls.deleted).toEqual([]);
  });
  it("counts an unusable row as failed, and never throws on a broken client", async () => {
    const { supabase } = client({ rows: [{ ...row(1), line_message_id: "../x" }] });
    expect(await moveLineImages(supabase, "uid")).toEqual({ moved: 0, failed: 1 });
    const broken = { rpc: async () => { throw new Error("down"); } } as never;
    await expect(moveLineImages(broken, "uid")).resolves.toEqual({ moved: 0, failed: 1 });
  });
});

describe("uploadNamedToInbox", () => {
  it("refuses a name that is not a LINE queue name, without calling Storage", async () => {
    const { supabase, calls } = client({});
    for (const name of ["a.png", "../line-1790762400000-1.png", "line-1-1.png"]) {
      expect((await uploadNamedToInbox(supabase, "uid", name, new Blob(["x"]), "image/png")).ok).toBe(false);
    }
    expect(calls.uploads).toEqual([]);
  });
  it("never overwrites: upsert is false", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const supabase = { storage: { from: () => ({ upload }) } } as never;
    await uploadNamedToInbox(supabase, "uid", "line-1790762400000-1.png", new Blob(["x"]), "image/png");
    expect(upload).toHaveBeenCalledWith("uid/line-1790762400000-1.png", expect.anything(), { contentType: "image/png", upsert: false });
  });
});
