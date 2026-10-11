import { z } from "zod";
import { SHOPEE_CHUNK, SHOPEE_MAX_BYTES, parseShopeeExport, type ShopeeRefusal } from "@/lib/shopee-import";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const rpcResultSchema = z.object({
  new: z.number().int().nonnegative(),
  stored: z.number().int().nonnegative(),
  beforeLedger: z.number().int().nonnegative(),
  refundsNew: z.number().int().nonnegative(),
  refundsStored: z.number().int().nonnegative(),
  refused: z.array(z.object({ orderCode: z.string().nullable(), reason: z.string() }))
});

/**
 * Stores the orders of a Shopee export read in the browser (D-270). Only the parsed orders reach
 * the database, in satang; `capture_shopee_orders` re-checks and is idempotent, so a repeat is
 * answered as already stored. The database's own messages are never echoed.
 */
export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const raw = await request.text().catch(() => null);
  if (raw === null) return routeError("The request body could not be read.", 400);
  if (raw.length > SHOPEE_MAX_BYTES) return routeError("The Shopee export is larger than 5 MB.", 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return routeError("The file is not valid JSON.", 400);
  }
  const parsed = parseShopeeExport(body);
  if (!parsed.ok) return routeError(parsed.reason, 400);

  const total = { new: 0, stored: 0, beforeLedger: 0, refundsNew: 0, refundsStored: 0 };
  const refused: ShopeeRefusal[] = [...parsed.refused];
  for (let start = 0; start < parsed.orders.length; start += SHOPEE_CHUNK) {
    const chunk = parsed.orders.slice(start, start + SHOPEE_CHUNK);
    const { data, error } = await auth.supabase.rpc("capture_shopee_orders", { p_request: { orders: chunk } });
    if (error) {
      if (start === 0) return routeError("The orders could not be stored.", 400);
      // Earlier chunks are already committed; say so rather than hide it. Capture is idempotent.
      return routeError(
        `Only the first ${start} orders were processed (${total.new} new, ${total.stored} already stored); ` +
        "the rest were not. Dropping the same file again is safe: orders already stored are recognised.",
        500
      );
    }
    const result = rpcResultSchema.safeParse(data);
    if (!result.success) return routeError("The database answered in a shape this ledger does not read.", 502);
    total.new += result.data.new;
    total.stored += result.data.stored;
    total.beforeLedger += result.data.beforeLedger;
    total.refundsNew += result.data.refundsNew;
    total.refundsStored += result.data.refundsStored;
    refused.push(...result.data.refused);
  }
  return Response.json({ version: parsed.version, ...total, refused }, { headers: noStoreHeaders });
}
