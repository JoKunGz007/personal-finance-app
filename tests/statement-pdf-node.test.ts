import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractStatement } from "@/lib/krungthai-layout";
import { validStatement } from "./fixtures/krungthai-layout-v1";

// pdf.js is mocked: a document opens only with the one password it is told is right.
const state = vi.hoisted(() => ({ right: undefined as string | undefined, seen: [] as (string | undefined)[], pages: [] as unknown[] }));

vi.mock("@/lib/server/receipt-pdf-node", () => ({
  loadPdfJs: async () => ({
    getDocument: ({ password }: { password?: string }) => {
      state.seen.push(password);
      return {
        promise: (async () => {
          if (state.right !== undefined && password !== state.right) {
            const error = new Error("No password given");
            error.name = "PasswordException";
            throw error;
          }
          if (state.right === "BROKEN") {
            throw new Error("boom");
          }
          return {
            numPages: state.pages.length,
            getPage: async (n: number) => ({ getTextContent: async () => ({ items: state.pages[n - 1] }) }),
            destroy: async () => undefined
          };
        })(),
        destroy: async () => undefined
      };
    }
  })
}));

vi.mock("@/lib/read-statement", () => ({
  readStatement: () => {
    const result = extractStatement(validStatement);
    if (!result.ok) throw new Error(result.message);
    return result;
  }
}));

import { readStatementPdf } from "@/lib/server/statement-pdf-node";

const SECRET_A = "invented-secret-alpha";
const SECRET_B = "invented-secret-bravo";

describe("readStatementPdf", () => {
  beforeEach(() => {
    state.seen = [];
    state.pages = [];
    delete process.env.STATEMENT_PASSWORD_KTB;
    delete process.env.STATEMENT_PASSWORD_KBANK_SCB;
  });
  afterEach(() => {
    delete process.env.STATEMENT_PASSWORD_KTB;
    delete process.env.STATEMENT_PASSWORD_KBANK_SCB;
  });

  it("reads an unencrypted file without trying any password", async () => {
    state.right = undefined;
    process.env.STATEMENT_PASSWORD_KTB = SECRET_A;
    const out = await readStatementPdf(new Uint8Array([1]));
    expect(out.kind).toBe("read");
    expect(state.seen).toEqual([undefined]);
  });

  it("moves past a wrong first password to the right second one", async () => {
    state.right = SECRET_B;
    process.env.STATEMENT_PASSWORD_KTB = SECRET_A;
    process.env.STATEMENT_PASSWORD_KBANK_SCB = SECRET_B;
    const out = await readStatementPdf(new Uint8Array([1]));
    expect(out.kind).toBe("read");
    expect(state.seen).toEqual([undefined, SECRET_A, SECRET_B]);
    expect(JSON.stringify(out)).not.toContain(SECRET_A);
    expect(JSON.stringify(out)).not.toContain(SECRET_B);
  });

  it("says no-passwords when the file is locked and none is configured", async () => {
    state.right = SECRET_A;
    expect(await readStatementPdf(new Uint8Array([1]))).toEqual({ kind: "no-passwords" });
  });

  it("says locked when every stored password is wrong", async () => {
    state.right = "something-else";
    process.env.STATEMENT_PASSWORD_KTB = SECRET_A;
    process.env.STATEMENT_PASSWORD_KBANK_SCB = SECRET_B;
    const out = await readStatementPdf(new Uint8Array([1]));
    expect(out).toEqual({ kind: "locked" });
    expect(JSON.stringify(out)).not.toContain(SECRET_A);
    expect(JSON.stringify(out)).not.toContain(SECRET_B);
  });

  it("tries a shared password once", async () => {
    state.right = "something-else";
    process.env.STATEMENT_PASSWORD_KTB = SECRET_A;
    process.env.STATEMENT_PASSWORD_KBANK_SCB = SECRET_A;
    await readStatementPdf(new Uint8Array([1]));
    expect(state.seen).toEqual([undefined, SECRET_A]);
  });

  it("reports a non-password failure as unreadable, with no message", async () => {
    state.right = "BROKEN";
    process.env.STATEMENT_PASSWORD_KTB = "BROKEN";
    const out = await readStatementPdf(new Uint8Array([1]));
    expect(out).toEqual({ kind: "unreadable", code: "PDF_PARSE_FAILED" });
  });
});
