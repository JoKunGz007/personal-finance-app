import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The webhook and connect routes with Supabase and LINE stubbed. Every value is invented.
const SECRET = "invented-channel-secret";
const INBOX_SECRET = "invented-inbox-secret-0123456789abcdef";
const OWNER = "Uinvented0000000000000000000000001";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: { ok: true } as { ok: boolean; status?: number; message?: string },
  strongRpc: vi.fn()
}));

vi.mock("@/lib/server/supabase", () => ({
  noStoreHeaders: { "Content-Type": "application/json" },
  routeError: (message: string, status: number) => Response.json({ error: message }, { status }),
  anonServerClient: () => ({ rpc: state.rpc }),
  strongOwnerClient: async () => state.auth.ok
    ? { ok: true, supabase: { rpc: state.strongRpc } }
    : { ok: false, status: state.auth.status, message: state.auth.message }
}));

const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("base64");
const imageEvent = (id: string, token: string, userId = OWNER) => ({
  type: "message", replyToken: token, source: { type: "user", userId },
  message: { type: "image", id, contentProvider: { type: "line" } }
});

function post(events: unknown[], headers: Record<string, string> = {}, rawBody?: string) {
  const body = rawBody ?? JSON.stringify({ events });
  return import("@/app/api/v1/line/webhook/route").then(({ POST }) => POST(new Request("https://ledger.example/api/v1/line/webhook", {
    method: "POST", body, headers: { "x-line-signature": sign(body), ...headers }
  })));
}

let calls: Array<{ url: string; init?: RequestInit }>;
let contentResponse: () => Response;

beforeEach(() => {
  vi.stubEnv("LINE_CHANNEL_SECRET", SECRET);
  vi.stubEnv("LINE_INBOX_SECRET", INBOX_SECRET);
  vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "invented-token");
  vi.stubEnv("LINE_OWNER_USER_ID", OWNER);
  state.rpc.mockReset().mockResolvedValue({ data: [{ outcome: "stored", set_stored: 1 }], error: null });
  state.strongRpc.mockReset().mockResolvedValue({ data: null, error: null });
  state.auth = { ok: true };
  calls = [];
  contentResponse = () => new Response(JPEG, { headers: { "content-type": "image/jpeg" } });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return url.includes("api-data.line.me") ? contentResponse() : new Response("{}");
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const replies = () => calls.filter((c) => c.url.endsWith("/reply")).map((c) => JSON.parse(String(c.init?.body)));

describe("POST /api/v1/line/webhook", () => {
  it("is 503 when any variable is missing", async () => {
    for (const name of ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN", "LINE_OWNER_USER_ID"]) {
      vi.stubEnv(name, "");
      expect((await post([])).status).toBe(503);
      vi.stubEnv(name, name === "LINE_CHANNEL_SECRET" ? SECRET : "x");
    }
  });
  it("is 503 when the inbox secret is missing or shorter than 32 characters", async () => {
    for (const value of ["", "too-short"]) {
      vi.stubEnv("LINE_INBOX_SECRET", value);
      expect((await post([])).status).toBe(503);
    }
  });
  it("is 401 on a bad or missing signature", async () => {
    expect((await post([], { "x-line-signature": "nope" })).status).toBe(401);
    expect((await post([], { "x-line-signature": "" })).status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("is 413 when the declared length is over 1 MB", async () => {
    expect((await post([], { "content-length": String(1024 * 1024 + 1) })).status).toBe(413);
  });
  it("is 413 when the body itself is over 1 MB", async () => {
    expect((await post([], {}, " ".repeat(1024 * 1024 + 1))).status).toBe(413);
  });
  it("is 400 on a signed body that is not JSON", async () => {
    expect((await post([], {}, "not json")).status).toBe(400);
  });
  it("answers 200 to a verify call with no events", async () => {
    expect((await post([])).status).toBe(200);
    expect(calls).toEqual([]);
  });
  it("enqueues each owner image once with the derived secret, then replies once", async () => {
    const response = await post([imageEvent("100001", "t1"), imageEvent("100002", "t2")]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(state.rpc).toHaveBeenCalledTimes(2);
    expect(state.rpc).toHaveBeenCalledWith("line_inbox_enqueue", {
      p_secret: INBOX_SECRET, p_message_id: "100001", p_content_type: "image/jpeg",
      p_content_base64: JPEG.toString("base64"), p_set_id: null, p_set_index: null, p_set_total: null
    });
    const content = calls.find((c) => c.url.includes("api-data.line.me"))!;
    expect(content.url).toBe("https://api-data.line.me/v2/bot/message/100001/content");
    expect((content.init?.headers as Record<string, string>).Authorization).toBe("Bearer invented-token");
    expect(replies()).toHaveLength(2);
    expect(replies()[0].messages[0].text).toBe("Got 1 image. Open /inbox: https://ledger.example/inbox");
  });
  describe("image sets", () => {
    const setEvent = (id: string, token: string, index: number) => {
      const event = imageEvent(id, token);
      return { ...event, message: { ...event.message, imageSet: { id: "set1", index, total: 3 } } };
    };
    const rowFor = (outcome: string, stored: number | null) => ({ data: [{ outcome, set_stored: stored }], error: null });

    it("passes the set fields to the database", async () => {
      await post([setEvent("100001", "t1", 2)]);
      expect(state.rpc).toHaveBeenCalledWith("line_inbox_enqueue", expect.objectContaining({
        p_set_id: "set1", p_set_index: 2, p_set_total: 3
      }));
    });
    it("does not reply on index = total while the set is short, and replies on the event that completes it", async () => {
      state.rpc.mockResolvedValueOnce(rowFor("stored", 1)).mockResolvedValueOnce(rowFor("stored", 2)).mockResolvedValueOnce(rowFor("stored", 3));
      await post([setEvent("100003", "t3", 3), setEvent("100002", "t2", 2), setEvent("100001", "t1", 1)]);
      expect(replies()).toHaveLength(1);
      expect(replies()[0].replyToken).toBe("t1");
      expect(replies()[0].messages[0].text).toBe("Got 3 images. Open /inbox: https://ledger.example/inbox");
    });
    it("does not reply on a duplicate, but confirms a redelivered one of a complete set", async () => {
      state.rpc.mockResolvedValue(rowFor("duplicate", 3));
      await post([setEvent("100001", "t1", 1)]);
      expect(replies()).toEqual([]);
      const redelivered = { ...setEvent("100001", "t1", 1), deliveryContext: { isRedelivery: true } };
      await post([redelivered]);
      expect(replies()).toHaveLength(1);
      expect(replies()[0].messages[0].text).toContain("Got 3 images");
    });
  });
  it("refuses a non-image content type from LINE: no enqueue, a failure reply", async () => {
    contentResponse = () => new Response("%PDF", { headers: { "content-type": "application/pdf" } });
    const response = await post([imageEvent("100001", "t1")]);
    expect(response.status).toBe(200);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(replies()[0].messages[0].text).toBe("Couldn't save 1 image. Open /inbox, then send again: https://ledger.example/inbox");
  });
  it("reports a failure when the database refuses", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "line inbox refused" } });
    expect((await post([imageEvent("100001", "t1")])).status).toBe(200);
    expect(replies()[0].messages[0].text).toContain("Couldn't save");
  });
  it("never calls the content API for a non-owner", async () => {
    const response = await post([imageEvent("100001", "t1", "Uother")]);
    expect(response.status).toBe(200);
    expect(calls).toEqual([]);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("still answers 200 when the reply call throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("api-data.line.me")) return contentResponse();
      throw new Error("down");
    }));
    expect((await post([imageEvent("100001", "t1")])).status).toBe(200);
  });
});

describe("POST /api/v1/line/connect", () => {
  const connect = () => import("@/app/api/v1/line/connect/route").then(({ POST }) => POST());

  it("passes the signed-in refusal through and sets nothing", async () => {
    state.auth = { ok: false, status: 401, message: "Sign in to continue." };
    expect((await connect()).status).toBe(401);
    state.auth = { ok: false, status: 403, message: "This identity is not the ledger owner." };
    expect((await connect()).status).toBe(403);
    expect(state.strongRpc).not.toHaveBeenCalled();
  });
  it("is 503 without the channel secret", async () => {
    for (const value of ["", "too-short"]) {
      vi.stubEnv("LINE_INBOX_SECRET", value);
      expect((await connect()).status).toBe(503);
    }
    expect(state.strongRpc).not.toHaveBeenCalled();
  });
  it("sets the derived secret", async () => {
    const response = await connect();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: true });
    expect(state.strongRpc).toHaveBeenCalledWith("set_line_webhook_secret", { p_secret: INBOX_SECRET });
  });
  it("reports a refused write as an error", async () => {
    state.strongRpc.mockResolvedValue({ data: null, error: { message: "x" } });
    expect((await connect()).status).toBe(500);
  });
});
