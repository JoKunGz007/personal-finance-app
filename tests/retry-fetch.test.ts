// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { retryingFetch } from "@/lib/server/retry-fetch";

// A fake fetch answering from a script: a status, or "throw" for a network failure.
function scripted(...answers: (number | "throw")[]) {
  const calls: (string | undefined)[] = [];
  const base = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init?.method);
    const answer = answers[calls.length - 1] ?? 200;
    if (answer === "throw") throw new TypeError("fetch failed");
    return new Response(null, { status: answer });
  }) as typeof fetch;
  return { base, calls };
}

describe("retryingFetch", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});

  it("retries a GET once after a 503 and returns the second answer", async () => {
    const f = scripted(503, 200);
    const response = await retryingFetch(f.base, 0)("https://example.test/rest/v1/t");
    expect(response.status).toBe(200);
    expect(f.calls).toHaveLength(2);
  });
  it("retries a GET once after a network failure", async () => {
    const f = scripted("throw", 200);
    expect((await retryingFetch(f.base, 0)("https://example.test", { method: "GET" })).status).toBe(200);
    expect(f.calls).toHaveLength(2);
  });
  it("retries only once: a second 500 is returned", async () => {
    const f = scripted(500, 500, 200);
    expect((await retryingFetch(f.base, 0)("https://example.test")).status).toBe(500);
    expect(f.calls).toHaveLength(2);
  });
  it("lets a second network failure throw", async () => {
    const f = scripted("throw", "throw");
    await expect(retryingFetch(f.base, 0)("https://example.test")).rejects.toThrow("fetch failed");
    expect(f.calls).toHaveLength(2);
  });
  it("never retries a POST, whatever the failure", async () => {
    const five = scripted(500, 200);
    expect((await retryingFetch(five.base, 0)("https://example.test/rest/v1/rpc/f", { method: "POST" })).status).toBe(500);
    expect(five.calls).toHaveLength(1);
    const net = scripted("throw", 200);
    await expect(retryingFetch(net.base, 0)("https://example.test", { method: "post" })).rejects.toThrow();
    expect(net.calls).toHaveLength(1);
  });
  it("does not retry a 4xx or a 501", async () => {
    for (const status of [400, 401, 404, 409, 501]) {
      const f = scripted(status, 200);
      expect((await retryingFetch(f.base, 0)("https://example.test")).status).toBe(status);
      expect(f.calls).toHaveLength(1);
    }
  });
  it("does not retry an aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    const f = scripted("throw", 200);
    await expect(retryingFetch(f.base, 0)("https://example.test", { signal: controller.signal })).rejects.toThrow();
    expect(f.calls).toHaveLength(1);
  });
  it("does not retry when the Request's own signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const f = scripted("throw", 200);
    await expect(retryingFetch(f.base, 0)(new Request("https://example.test", { signal: controller.signal }))).rejects.toThrow();
    expect(f.calls).toHaveLength(1);
  });
  it("does not resend when aborted during the retry delay", async () => {
    const controller = new AbortController();
    const f = scripted(503, 200);
    const pending = retryingFetch(f.base, 20)("https://example.test", { signal: controller.signal });
    setTimeout(() => controller.abort(), 5);
    await expect(pending).rejects.toThrow();
    expect(f.calls).toHaveLength(1);
  });
  it("reads the method from a Request when init has none", async () => {
    const f = scripted(503, 200);
    const response = await retryingFetch(f.base, 0)(new Request("https://example.test", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
    expect(f.calls).toHaveLength(1);
  });
});
