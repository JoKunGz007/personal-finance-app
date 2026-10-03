import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  planLineEvents, planLineReplies, verifyLineSignature, type PlannedImage
} from "@/lib/line-webhook";

// Every value is invented.
const SECRET = "invented-channel-secret";
const OWNER = "Uinvented0000000000000000000000001";
const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body).digest("base64");

const imageEvent = (over: Record<string, unknown> = {}, message: Record<string, unknown> = {}) => ({
  type: "message", replyToken: "tok-1", source: { type: "user", userId: OWNER },
  message: { type: "image", id: "100001", contentProvider: { type: "line" }, ...message }, ...over
});

describe("verifyLineSignature", () => {
  const body = '{"events":[]}';
  it("accepts a valid signature", () => expect(verifyLineSignature(body, sign(body), SECRET)).toBe(true));
  it("refuses a tampered body", () => expect(verifyLineSignature(body + " ", sign(body), SECRET)).toBe(false));
  it("refuses the wrong secret", () => expect(verifyLineSignature(body, sign(body, "other"), SECRET)).toBe(false));
  it("refuses a missing header", () => expect(verifyLineSignature(body, null, SECRET)).toBe(false));
  it("refuses a wrong-length header without throwing", () => expect(verifyLineSignature(body, "abc", SECRET)).toBe(false));
});

describe("planLineEvents", () => {
  it("plans the owner's image", () => {
    const plan = planLineEvents({ events: [imageEvent()] }, OWNER);
    expect(plan.images).toEqual([{ messageId: "100001", replyToken: "tok-1", isRedelivery: false }]);
    expect(plan.nonImages).toEqual([]);
  });
  it("reads image sets and redelivery", () => {
    const plan = planLineEvents({
      events: [imageEvent({ deliveryContext: { isRedelivery: true } }, { imageSet: { id: "s", index: 2, total: 3 } })]
    }, OWNER);
    expect(plan.images[0]).toMatchObject({ isRedelivery: true, imageSet: { id: "s", index: 2, total: 3 } });
  });
  it("drops everything that is not the owner's line-hosted image", () => {
    const events = [
      imageEvent({ source: { type: "user", userId: "Uother" } }),
      imageEvent({ source: { type: "group", groupId: "G1", userId: OWNER } }),
      imageEvent({ source: { type: "room", roomId: "R1", userId: OWNER } }),
      imageEvent({}, { contentProvider: { type: "external" } }),
      imageEvent({}, { contentProvider: undefined }),
      imageEvent({}, { id: "12ab" }),
      imageEvent({}, { id: "1".repeat(33) }),
      { type: "follow", replyToken: "t", source: { type: "user", userId: OWNER } },
      { type: "unfollow", source: { type: "user", userId: OWNER } },
      null, "x", 5
    ];
    expect(planLineEvents({ events }, OWNER)).toEqual({ images: [], nonImages: [] });
  });
  it("treats an empty events list and malformed bodies as nothing", () => {
    for (const body of [{ events: [] }, {}, null, "x", { events: "no" }]) {
      expect(planLineEvents(body, OWNER)).toEqual({ images: [], nonImages: [] });
    }
    expect(planLineEvents({ events: [imageEvent()] }, "")).toEqual({ images: [], nonImages: [] });
  });
  it("collects the owner's non-image messages and ignores strangers'", () => {
    const text = { type: "message", replyToken: "tok-t", source: { type: "user", userId: OWNER }, message: { type: "text", id: "1", text: "hi" } };
    const stranger = { ...text, source: { type: "user", userId: "Uother" } };
    expect(planLineEvents({ events: [text, stranger] }, OWNER).nonImages).toEqual([{ replyToken: "tok-t" }]);
  });
});

describe("planLineReplies", () => {
  const origin = "https://ledger.example";
  const img = (over: Partial<PlannedImage> & { outcome?: "stored" | "duplicate" | "failed" } = {}) => ({
    messageId: "1", replyToken: "t1", isRedelivery: false, outcome: "stored" as const, ...over
  });

  it("replies once for a single image", () => {
    expect(planLineReplies([img()], [], origin)).toEqual([
      { replyToken: "t1", text: "Got 1 image. Open /inbox: https://ledger.example/inbox" }
    ]);
  });
  it("replies for an image set only on the last, with the set total", () => {
    const set = (index: number) => img({ replyToken: `t${index}`, imageSet: { id: "s", index, total: 3 } });
    const replies = planLineReplies([set(1), set(2), set(3)], [], origin);
    expect(replies).toEqual([{ replyToken: "t3", text: "Got 3 images. Open /inbox: https://ledger.example/inbox" }]);
  });
  it("sends no success reply for a redelivery, and counts duplicates as success", () => {
    expect(planLineReplies([img({ isRedelivery: true })], [], origin)).toEqual([]);
    expect(planLineReplies([img({ outcome: "duplicate" })], [], origin)).toHaveLength(1);
  });
  it("sends one failure reply on a failed event's token", () => {
    const replies = planLineReplies([img({ outcome: "failed", replyToken: "a" }), img({ outcome: "failed", replyToken: "b" })], [], origin);
    expect(replies).toEqual([{ replyToken: "a", text: `Couldn't save 2 images. Open /inbox, then send again: https://ledger.example/inbox` }]);
  });
  it("tells the owner PDFs go through Add files", () => {
    expect(planLineReplies([], [{ replyToken: "n" }], origin)).toEqual([
      { replyToken: "n", text: "I only take images. Send PDFs through Add files on /inbox: https://ledger.example/inbox" }
    ]);
  });
  it("sends at most one reply per token", () => {
    const replies = planLineReplies([img({ replyToken: "same" })], [{ replyToken: "same" }], origin);
    expect(replies).toHaveLength(1);
  });
});
