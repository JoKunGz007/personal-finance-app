import { afterEach, describe, expect, it, vi } from "vitest";
import { OCR_READ_PATH, readImageWords } from "@/lib/browser/ocr-reader";

/**
 * The browser's reader client, which both capture forms now go through (D-120, D-129).
 *
 * **It became worth its own tests when it got a second caller.** While the card form held this
 * code inline, a mistake in it broke one form and one form's specs. Now a mistake in it breaks
 * card capture and slip capture together, and the two behave identically by construction rather
 * than by two people writing the same four lines the same way.
 *
 * What is covered is the part that fails silently: which outcomes are told apart from which. A
 * refusal the owner can act on, a refusal they cannot, and a 200 carrying something that is not a
 * word list all have to end somewhere different — and the last one is the case that would otherwise
 * hand a grammar `undefined` and surface as an unrelated crash.
 *
 * Recognition is not covered here and cannot be: the accuracy claims are measurements over real
 * screenshots and real slips (D-118, D-128). `encodeForReader` is not covered either — it needs a
 * canvas and an `ImageBitmap`, so the browser specs are where it is exercised.
 */

const IMAGE = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

afterEach(() => { vi.unstubAllGlobals(); });

function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("posting an image to this app's own reader route", () => {
  it("sends the bytes to the relative path and nowhere else", async () => {
    const fetchSpy = stubFetch(async () => new Response(JSON.stringify({ words: [] }), { status: 200 }));
    await readImageWords(IMAGE);

    const [url, init] = fetchSpy.mock.calls[0]!;
    // **Relative, so it is same-origin by construction.** An absolute URL is what would need
    // `connect-src` widened and what would put the API key in the browser (D-058, D-120).
    expect(url).toBe(OCR_READ_PATH);
    expect(String(url)).not.toMatch(/^https?:/u);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("image/png");
    expect(init?.body).toBe(IMAGE);
  });

  it("returns the words a successful read carries", async () => {
    const word = { text: "จำนวนเงิน", left: 10, top: 100, right: 90, bottom: 122 };
    stubFetch(async () => new Response(JSON.stringify({ words: [word] }), { status: 200 }));
    expect(await readImageWords(IMAGE)).toEqual({ ok: true, words: [word] });
  });

  it("counts an empty reading as a success, because it is one", async () => {
    // "The engine ran and read nothing" is an honest answer that each grammar turns into its own
    // named refusal — `LABEL_NOT_FOUND` on a slip, no card found on a screenshot. A failure means
    // no reading happened at all, and the two call for different things from the owner.
    stubFetch(async () => new Response(JSON.stringify({ words: [] }), { status: 200 }));
    expect(await readImageWords(IMAGE)).toEqual({ ok: true, words: [] });
  });

  it("passes the route's own sentence through when it refuses", async () => {
    // The route words its three failures differently on purpose: a missing key is the deployment's
    // problem, an unreachable service is worth retrying, and a refusal is not. Rewriting them here
    // would collapse that back into one message.
    stubFetch(async () => new Response(
      JSON.stringify({ error: "The reader is not configured on this deployment. Type the values yourself." }),
      { status: 503 }
    ));
    const read = await readImageWords(IMAGE);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.why).toBe("The reader is not configured on this deployment. Type the values yourself.");
  });

  it("falls back to its own sentence when a refusal carries no message", async () => {
    stubFetch(async () => new Response("<html>gateway</html>", { status: 502 }));
    const read = await readImageWords(IMAGE);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.why).toMatch(/could not be reached/iu);
  });

  it("treats a network failure as a refusal rather than letting it escape", async () => {
    // Offline, DNS, a dropped connection: the form shows a sentence and the owner types the
    // figures. An exception escaping here would surface as whatever generic error boundary caught
    // it, which tells them nothing they can act on.
    stubFetch(async () => { throw new TypeError("Failed to fetch"); });
    const read = await readImageWords(IMAGE);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.why).toMatch(/could not be reached/iu);
  });

  it("refuses a 200 that does not carry a word list", async () => {
    // The case that would otherwise hand a grammar `undefined` and fail somewhere unrelated. A
    // proxy or a login page answering 200 with HTML is the realistic way it happens.
    for (const body of ["not json at all", JSON.stringify({}), JSON.stringify({ words: "many" })]) {
      stubFetch(async () => new Response(body, { status: 200 }));
      const read = await readImageWords(IMAGE);
      expect(read.ok, `a 200 carrying ${body.slice(0, 20)} must not read as a success`).toBe(false);
    }
  });
});
