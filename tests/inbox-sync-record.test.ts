// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordMailSync: vi.fn<(complete: boolean) => Promise<{ ok: boolean }>>(async () => ({ ok: true })),
  loadAccountCoverage: vi.fn(async () => ({ ok: true, data: { accounts: [], lastSync: null } })),
  grab: vi.fn(),
  seven: vi.fn(),
  statements: vi.fn()
}));

vi.mock("@/lib/browser/mail-sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/browser/mail-sync")>()),
  recordMailSync: mocks.recordMailSync,
  loadAccountCoverage: mocks.loadAccountCoverage,
  syncGrabMail: mocks.grab,
  syncSevenElevenMail: mocks.seven,
  syncMailboxStatements: mocks.statements
}));
vi.mock("@/lib/wire", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/wire")>()),
  ledgerRequest: vi.fn(async () => ({ ok: true, data: { accounts: [] } }))
}));
vi.mock("next/link", () => ({ default: () => null }));

import { InboxBench } from "@/app/inbox-bench";
import { EMPTY_STATEMENT_TOTAL } from "@/lib/browser/mail-sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function runSync(grabError: string | null) {
  mocks.grab.mockResolvedValue({ total: null, error: grabError });
  mocks.seven.mockResolvedValue({ total: null, error: null });
  mocks.statements.mockResolvedValue({ ok: true, total: EMPTY_STATEMENT_TOTAL });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(createElement(InboxBench)); });
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "Sync all mail")!;
  await act(async () => { button.click(); });
  await act(async () => { root.unmount(); });
  host.remove();
}

describe("Sync all mail records the run", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { document.body.innerHTML = ""; });

  it("records complete=false when a source failed", async () => {
    await runSync("The server answered 504.");
    expect(mocks.recordMailSync).toHaveBeenCalledTimes(1);
    expect(mocks.recordMailSync).toHaveBeenCalledWith(false);
    expect(mocks.loadAccountCoverage).toHaveBeenCalledTimes(2);
  });

  it("records complete=true when none failed", async () => {
    await runSync(null);
    expect(mocks.recordMailSync).toHaveBeenCalledWith(true);
  });
});
