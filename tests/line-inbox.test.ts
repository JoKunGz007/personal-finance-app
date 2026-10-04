import { describe, expect, it, vi } from "vitest";
import { uploadNamedToInbox } from "@/lib/browser/inbox-storage";
import { discardLineImage, FAILURE_SPACING_MS, moveLineImages, type Failure, type FailureStore } from "@/lib/browser/line-inbox";
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

// A clock that moves an hour on every read, so each run's failure counts.
function hourly(): () => number {
  let t = 0;
  return () => (t += FAILURE_SPACING_MS);
}

// An in-memory failure memory, so the tests need no browser storage.
function memory(): FailureStore {
  let counts: Record<string, Failure> = {};
  return { load: () => ({ ...counts }), save: (next) => { counts = { ...next }; } };
}

describe("moveLineImages", () => {
  it("uploads under the LINE name, then deletes the held row", async () => {
    const { supabase, calls } = client({ rows: [row(1), row(2)] });
    expect(await moveLineImages(supabase, "uid", memory())).toMatchObject({ moved: 2, failed: 0 });
    expect(calls.uploads).toEqual([
      `uid/${lineObjectName(RECEIVED, "100001", "image/png")}`, `uid/${lineObjectName(RECEIVED, "100002", "image/png")}`
    ]);
    expect(calls.deleted).toEqual([1, 2]);
  });
  it("uploads in the order the database lists, so a set's pages go up in index order", async () => {
    // Page 1 arrived last (later received_at) but the database lists it first.
    const page1 = { ...row(3, "100003"), received_at: "2026-09-30T10:00:02.000Z" };
    const page2 = { ...row(1, "100001"), received_at: "2026-09-30T10:00:00.000Z" };
    const page3 = { ...row(2, "100002"), received_at: "2026-09-30T10:00:01.000Z" };
    const { supabase, calls } = client({ rows: [page1, page2, page3] });
    await moveLineImages(supabase, "uid", memory());
    expect(calls.uploads.map((path) => /-(\d{6})\./u.exec(path)![1])).toEqual(["100003", "100001", "100002"]);
    expect(calls.deleted).toEqual([3, 1, 2]);
  });
  it("keeps the row when the upload fails and carries on", async () => {
    const { supabase, calls } = client({ rows: [row(1), row(2)], upload: (path) => (path.includes("100001") ? { message: "network" } : null) });
    expect(await moveLineImages(supabase, "uid", memory())).toMatchObject({ moved: 1, failed: 1 });
    expect(calls.deleted).toEqual([2]);
  });
  it("counts a failed delete without throwing", async () => {
    const { supabase } = client({ rows: [row(1)], deleteError: 1 });
    expect(await moveLineImages(supabase, "uid", memory())).toMatchObject({ moved: 0, failed: 1 });
  });
  it("continues after a failed read, and uploads nothing for it", async () => {
    const { supabase, calls } = client({ rows: [row(1), row(2)], readError: 1 });
    expect(await moveLineImages(supabase, "uid", memory())).toMatchObject({ moved: 1, failed: 1 });
    expect(calls.uploads).toHaveLength(1);
    expect(calls.deleted).toEqual([2]);
  });
  it("treats an already-existing object as stored and deletes the row", async () => {
    const { supabase, calls } = client({ rows: [row(1)], upload: () => ({ message: "The resource already exists", statusCode: "409" }) });
    expect(await moveLineImages(supabase, "uid", memory())).toMatchObject({ moved: 1, failed: 0 });
    expect(calls.deleted).toEqual([1]);
  });
  it("does not read a message that merely mentions 409 as already stored", async () => {
    const { supabase, calls } = client({ rows: [row(1)], upload: () => ({ message: "upstream 409 gateway trouble", statusCode: "500" }) });
    expect(await moveLineImages(supabase, "uid", memory())).toMatchObject({ moved: 0, failed: 1 });
    expect(calls.deleted).toEqual([]);
  });
  it("counts an unusable row as failed, and never throws on a broken client", async () => {
    const { supabase } = client({ rows: [{ ...row(1), line_message_id: "../x" }] });
    expect(await moveLineImages(supabase, "uid", memory())).toMatchObject({ moved: 0, failed: 1 });
    const broken = { rpc: async () => { throw new Error("down"); } } as never;
    await expect(moveLineImages(broken, "uid", memory())).resolves.toMatchObject({ moved: 0, failed: 1 });
  });
});

describe("a LINE image that cannot be moved", () => {
  it("is plain failure twice, then stuck from the third failure and reported once, never deleted", async () => {
    const { supabase, calls } = client({ rows: [row(1)], upload: () => ({ message: "network" }) });
    const store = memory();
    const clock = hourly();
    expect(await moveLineImages(supabase, "uid", store, clock)).toEqual({ moved: 0, failed: 1, stuck: [] });
    expect(await moveLineImages(supabase, "uid", store, clock)).toEqual({ moved: 0, failed: 1, stuck: [] });
    expect(await moveLineImages(supabase, "uid", store, clock)).toEqual({ moved: 0, failed: 0, stuck: [{ id: 1, messageId: "100001" }] });
    expect(calls.deleted).toEqual([]);
  });
  it("counts failures less than an hour apart once, so reloads during one outage never make it stuck", async () => {
    const { supabase } = client({ rows: [row(1)], upload: () => ({ message: "network" }) });
    const store = memory();
    const at = () => 1_000;
    for (let i = 0; i < 5; i += 1) {
      expect(await moveLineImages(supabase, "uid", store, at)).toEqual({ moved: 0, failed: 1, stuck: [] });
    }
    expect(store.load()).toEqual({ "100001": { n: 1, at: 1_000 } });
  });
  it("forgets the count once the image moves", async () => {
    const flaky = client({ rows: [row(1)], upload: () => ({ message: "network" }) });
    const store = memory();
    await moveLineImages(flaky.supabase, "uid", store);
    await moveLineImages(flaky.supabase, "uid", store);
    const fine = client({ rows: [row(1)] });
    expect(await moveLineImages(fine.supabase, "uid", store)).toMatchObject({ moved: 1, stuck: [] });
    expect(await moveLineImages(flaky.supabase, "uid", store)).toMatchObject({ failed: 1, stuck: [] });
  });
  it("Discard calls delete_line_inbox_item and clears its count", async () => {
    const { supabase, calls } = client({ rows: [row(1)], upload: () => ({ message: "network" }) });
    const store = memory();
    const clock = hourly();
    for (let i = 0; i < 3; i += 1) await moveLineImages(supabase, "uid", store, clock);
    expect(await discardLineImage(supabase, { id: 1, messageId: "100001" }, store)).toBe(true);
    expect(calls.deleted).toEqual([1]);
    expect(store.load()).toEqual({});
  });
  it("Discard reports a refused delete as not discarded", async () => {
    const { supabase } = client({ rows: [row(1)], deleteError: 1 });
    expect(await discardLineImage(supabase, { id: 1, messageId: "100001" }, memory())).toBe(false);
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
