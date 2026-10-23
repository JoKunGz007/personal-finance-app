import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256HexBytes } from "@/lib/canonical";
import { readStatementPdf, type WorkerReply } from "@/lib/browser/statement-reader";

/** A stand-in for the real worker: records what is posted, and lets a test play the worker's side. */
function fakeWorker() {
  const worker = {
    posted: [] as Array<{ message: unknown; transfer: unknown }>,
    terminate: vi.fn(),
    postMessage: vi.fn((message: unknown, transfer: unknown) => { worker.posted.push({ message, transfer }); }),
    onmessage: null as ((event: MessageEvent<WorkerReply>) => void) | null,
    onerror: null as (() => void) | null,
    onmessageerror: null as (() => void) | null
  };
  return worker;
}

function invented() {
  return new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
}

const parsed: WorkerReply = {
  type: "parsed",
  frame: { bankCode: "KTB", accountLastFour: "0000", periodStart: "2026-01-01", periodEnd: "2026-01-31", crossChecked: true } as never,
  rows: [],
  pageCount: 1
};

// The handshake is awaited past the digest, so a test lets that settle before it plays the worker.
async function settle(worker: ReturnType<typeof fakeWorker>) {
  await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("readStatementPdf", () => {
  it("resolves ok with the digest of the bytes as given, and posts the password only to the worker", async () => {
    const bytes = invented();
    const expected = await sha256HexBytes(bytes.slice(0));
    const worker = fakeWorker();
    const pending = readStatementPdf(bytes, "invented-password", { createWorker: () => worker as unknown as Worker });
    await settle(worker);
    expect(worker.posted[0]!.message).toMatchObject({ type: "parse", password: "invented-password" });
    expect(worker.posted[0]!.transfer).toEqual([bytes]);
    worker.onmessage!({ data: parsed } as MessageEvent<WorkerReply>);
    const read = await pending;
    expect(read).toEqual({ ok: true, digest: expected, reply: parsed });
    expect(JSON.stringify(read)).not.toContain("invented-password");
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("resolves a refusal as ok:false and carries the reply", async () => {
    const worker = fakeWorker();
    const refusal: WorkerReply = { type: "error", code: "UNSUPPORTED_LAYOUT", message: "Not a statement.", structure: ["a"] };
    const pending = readStatementPdf(invented(), "x", { createWorker: () => worker as unknown as Worker });
    await settle(worker);
    worker.onmessage!({ data: refusal } as MessageEvent<WorkerReply>);
    const read = await pending;
    expect(read).toMatchObject({ ok: false, failure: "refusal", reply: refusal, message: "Not a statement." });
    expect(read.ok === false && read.failure === "refusal" && read.digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("treats a reply of neither shape as a stopped worker, not a refusal", async () => {
    const worker = fakeWorker();
    const pending = readStatementPdf(invented(), "x", { createWorker: () => worker as unknown as Worker });
    await settle(worker);
    worker.onmessage!({ data: { type: "progress" } } as unknown as MessageEvent<WorkerReply>);
    const read = await pending;
    expect(read).toMatchObject({ ok: false, failure: "worker" });
    expect(read.ok === false && read.message).toBeTruthy();
  });

  it("resolves a worker error as ok:false", async () => {
    const worker = fakeWorker();
    const pending = readStatementPdf(invented(), "x", { createWorker: () => worker as unknown as Worker });
    await settle(worker);
    worker.onerror!();
    expect(await pending).toMatchObject({ ok: false, failure: "worker" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("resolves a messageerror as ok:false", async () => {
    const worker = fakeWorker();
    const pending = readStatementPdf(invented(), "x", { createWorker: () => worker as unknown as Worker });
    await settle(worker);
    worker.onmessageerror!();
    expect(await pending).toMatchObject({ ok: false, failure: "worker" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("resolves a worker that never answers as ok:false once the timeout passes", async () => {
    const worker = fakeWorker();
    const read = await readStatementPdf(invented(), "x", { createWorker: () => worker as unknown as Worker, timeoutMs: 5 });
    expect(read).toMatchObject({ ok: false, failure: "timeout" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("clears the timeout on every outcome that is not the timeout", async () => {
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const worker = fakeWorker();
    const pending = readStatementPdf(invented(), "x", { createWorker: () => worker as unknown as Worker });
    await settle(worker);
    worker.onerror!();
    await pending;
    expect(clear).toHaveBeenCalled();
  });

  it("ignores an answer that arrives after the worker was stopped", async () => {
    const worker = fakeWorker();
    const pending = readStatementPdf(invented(), "x", { createWorker: () => worker as unknown as Worker });
    await settle(worker);
    worker.onerror!();
    worker.onmessage!({ data: parsed } as MessageEvent<WorkerReply>);
    expect(await pending).toMatchObject({ ok: false, failure: "worker" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("resolves ok:false, without starting a worker, when the hash cannot run", async () => {
    vi.spyOn(crypto.subtle, "digest").mockRejectedValue(new Error("insecure context"));
    const createWorker = vi.fn();
    const read = await readStatementPdf(invented(), "x", { createWorker });
    expect(read).toMatchObject({ ok: false, failure: "hash" });
    expect("digest" in read).toBe(false);
    expect(createWorker).not.toHaveBeenCalled();
  });

  it("resolves ok:false and terminates when posting to the worker throws", async () => {
    const worker = fakeWorker();
    worker.postMessage.mockImplementation(() => { throw new Error("DataCloneError"); });
    const read = await readStatementPdf(invented(), "x", { createWorker: () => worker as unknown as Worker });
    expect(read).toMatchObject({ ok: false, failure: "worker" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
