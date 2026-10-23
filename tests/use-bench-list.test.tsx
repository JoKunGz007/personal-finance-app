import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useBenchList } from "@/app/use-bench-list";
import type { WireResult } from "@/lib/wire";

// D-301: the list load the benches share. Every string here is invented.

type Handle = ReturnType<typeof useBenchList<string>>;

const ok = (data: string): WireResult<string> => ({ ok: true, data });
const refused = (status: number, why: string): WireResult<string> => ({ ok: false, kind: "refused", why, status });

function deferred() {
  let resolve!: (result: WireResult<string>) => void;
  const promise = new Promise<WireResult<string>>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("useBenchList (D-301)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let handle: Handle;
  let Probe: () => null;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function mount(fetchList: () => Promise<WireResult<string>>, options: { signInText?: string; onArrival?: boolean }) {
    // A new function every render, as an inline fetcher in a bench is.
    function Mounted() {
      handle = useBenchList(() => fetchList(), options);
      return null;
    }
    Probe = Mounted;
    await act(async () => root.render(createElement(Probe)));
  }

  it("keeps the newest snapshot when the older load answers last", async () => {
    const answers = [deferred(), deferred()];
    let calls = 0;
    await mount(() => answers[calls++]!.promise, { onArrival: false });

    await act(async () => { void handle.load(); });
    await act(async () => { void handle.load(); });
    expect(calls).toBe(2);
    expect(handle.busy).toBe(true);

    await act(async () => answers[1]!.resolve(ok("newer")));
    expect(handle.data).toBe("newer");
    expect(handle.busy).toBe(false);

    await act(async () => answers[0]!.resolve(ok("older")));
    expect(handle.data).toBe("newer");
    expect(handle.busy).toBe(false);
  });

  it("stays busy until the newest load answers, even if the older one finishes first", async () => {
    const answers = [deferred(), deferred()];
    let calls = 0;
    await mount(() => answers[calls++]!.promise, { onArrival: false });

    await act(async () => { void handle.load(); });
    await act(async () => { void handle.load(); });

    await act(async () => answers[0]!.resolve(ok("older")));
    expect(handle.busy).toBe(true);
    expect(handle.data).toBeNull();

    await act(async () => answers[1]!.resolve(ok("newer")));
    expect(handle.busy).toBe(false);
    expect(handle.data).toBe("newer");
  });

  it("turns an automatic 401 into the sign-in note and a manual one into an error", async () => {
    await mount(async () => refused(401, "Unauthorized."), { signInText: "Sign in to see things." });
    expect(handle.signInNote).toBe("Sign in to see things.");
    expect(handle.error).toBeNull();
    expect(handle.busy).toBe(false);

    await act(async () => { await handle.load(); });
    expect(handle.signInNote).toBeNull();
    expect(handle.error).toBe("Unauthorized.");
  });

  it("shows the route's own words for an automatic 403, and keeps data a failed load leaves alone", async () => {
    const results = [ok("held"), refused(403, "Not allowed."), refused(500, "Broke.")];
    let calls = 0;
    await mount(async () => results[calls++]!, { signInText: "Sign in to see things." });
    expect(handle.data).toBe("held");

    await act(async () => { await handle.load(true); });
    expect(handle.signInNote).toBe("Not allowed.");
    expect(handle.error).toBeNull();

    await act(async () => { await handle.load(); });
    expect(handle.error).toBe("Broke.");
    expect(handle.data).toBe("held");
  });

  it("does not fetch on mount when onArrival is false", async () => {
    let calls = 0;
    await mount(async () => { calls++; return ok("never"); }, { onArrival: false });
    expect(calls).toBe(0);
    expect(handle.data).toBeNull();
    expect(handle.busy).toBe(false);

    await act(async () => { await handle.load(); });
    expect(calls).toBe(1);
    expect(handle.data).toBe("never");
  });

  it("fetches once on arrival, not again when the fetcher is a new function each render", async () => {
    let calls = 0;
    await mount(async () => { calls++; return ok("here"); }, {});
    expect(calls).toBe(1);
    expect(handle.data).toBe("here");
    await act(async () => root.render(createElement(Probe)));
    await act(async () => root.render(createElement(Probe)));
    expect(calls).toBe(1);
  });
});
