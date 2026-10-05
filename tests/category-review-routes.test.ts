import { beforeEach, describe, expect, it, vi } from "vitest";
import { categoryReviewResponseSchema } from "@/lib/transactions";
import { categoryListSchema, categoryParentResponseSchema } from "@/lib/categories";

// The two D-245 step-4 routes: "Looks right" (`review_transaction_category`) and a category's
// parent (`set_category_parent`), plus the parent on `GET /api/v1/categories`. The database's
// refusals are pgTAP's (029); here the client is a stub. Every value is invented.
const TX = "dddddddd-0000-4000-8000-000000000301";
const FOOD = "cafecafe-0000-4000-8000-000000000301";
const DELIVERY = "cafecafe-0000-4000-8000-000000000302";

const state = vi.hoisted(() => ({
  calls: [] as { name: string; args: unknown }[],
  result: { data: null as unknown, error: null as unknown },
  owner: true
}));

vi.mock("@/lib/server/supabase", () => ({
  noStoreHeaders: { "Content-Type": "application/json" },
  routeError: (message: string, status: number) => Response.json({ error: message }, { status }),
  strongOwnerClient: async () => state.owner ? ({
    ok: true,
    supabase: {
      rpc: async (name: string, args: unknown) => {
        state.calls.push({ name, args });
        return state.result;
      },
      from: (table: string) => ({
        select: () => table === "categories"
          ? { order: async () => ({ data: [
              { id: DELIVERY, name: "Delivery", archived: false, created_at: "2026-10-05T00:00:00Z" },
              { id: FOOD, name: "Food & Drinks", archived: false, created_at: "2026-10-05T00:00:00Z" }
            ], error: null }) }
          : Promise.resolve({ data: [{ category_id: DELIVERY, parent_id: FOOD }], error: null })
      })
    }
  }) : { ok: false, status: 403, message: "AAL2 and a verified TOTP factor are required." }
}));

const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function review(id: string, body: unknown) {
  const { POST } = await import("@/app/api/v1/transactions/[id]/category-review/route");
  return POST(new Request(`http://local/api/v1/transactions/${id}/category-review`, json(body)), { params: Promise.resolve({ id }) });
}

async function setParent(body: unknown) {
  const { POST } = await import("@/app/api/v1/categories/parent/route");
  return POST(new Request("http://local/api/v1/categories/parent", json(body)));
}

beforeEach(() => {
  state.calls = [];
  state.result = { data: null, error: null };
  state.owner = true;
});

describe("POST /api/v1/transactions/[id]/category-review", () => {
  it("confirms the provenance revision the owner saw and answers in the published shape", async () => {
    state.result = { data: { transaction_id: TX, overlay_revision: 3, reviewed: true, changed: true }, error: null };
    const response = await review(TX, { overlayRevision: 3 });
    expect(response.status).toBe(200);
    expect(categoryReviewResponseSchema.safeParse(await response.json()).success).toBe(true);
    expect(state.calls).toEqual([{ name: "review_transaction_category", args: { p_transaction_id: TX, p_overlay_revision: 3 } }]);
  });

  it("answers 409 when the category changed underneath", async () => {
    state.result = { data: null, error: { message: "not the latest category provenance" } };
    expect((await review(TX, { overlayRevision: 2 })).status).toBe(409);
  });

  it("answers 400 for any other refusal", async () => {
    state.result = { data: null, error: { message: "owner category needs no review" } };
    expect((await review(TX, { overlayRevision: 2 })).status).toBe(400);
  });

  it("refuses a bad id, a bad body and an extra field before calling the database", async () => {
    expect((await review("not-a-uuid", { overlayRevision: 1 })).status).toBe(400);
    expect((await review(TX, { overlayRevision: 0 })).status).toBe(422);
    expect((await review(TX, { overlayRevision: 1, source: "owner" })).status).toBe(422);
    expect(state.calls).toEqual([]);
  });

  it("refuses without strong owner access", async () => {
    state.owner = false;
    expect((await review(TX, { overlayRevision: 1 })).status).toBe(403);
    expect(state.calls).toEqual([]);
  });
});

describe("POST /api/v1/categories/parent", () => {
  it("sets a parent", async () => {
    state.result = { data: { category_id: DELIVERY, parent_id: FOOD, changed: true }, error: null };
    const response = await setParent({ id: DELIVERY, parentId: FOOD });
    expect(response.status).toBe(200);
    expect(categoryParentResponseSchema.safeParse(await response.json()).success).toBe(true);
    expect(state.calls).toEqual([{ name: "set_category_parent", args: { p_category_id: DELIVERY, p_parent_id: FOOD } }]);
  });

  it("removes a parent with null", async () => {
    state.result = { data: { category_id: DELIVERY, parent_id: null, changed: true }, error: null };
    expect((await setParent({ id: DELIVERY, parentId: null })).status).toBe(200);
    expect(state.calls[0]!.args).toEqual({ p_category_id: DELIVERY, p_parent_id: null });
  });

  it("answers 400 when the database refuses", async () => {
    state.result = { data: null, error: { message: "category has children" } };
    expect((await setParent({ id: FOOD, parentId: DELIVERY })).status).toBe(400);
  });

  it("refuses a missing parentId or a bad id before calling the database", async () => {
    expect((await setParent({ id: DELIVERY })).status).toBe(422);
    expect((await setParent({ id: "x", parentId: null })).status).toBe(422);
    expect(state.calls).toEqual([]);
  });

  it("refuses without strong owner access", async () => {
    state.owner = false;
    expect((await setParent({ id: DELIVERY, parentId: FOOD })).status).toBe(403);
  });
});

describe("GET /api/v1/categories", () => {
  it("carries each category's parent, null at the top level", async () => {
    const { GET } = await import("@/app/api/v1/categories/route");
    const body = categoryListSchema.parse(await (await GET()).json());
    expect(body.categories.map((category) => [category.name, category.parent_id])).toEqual([
      ["Delivery", FOOD], ["Food & Drinks", null]
    ]);
  });
});
