import {
  shopeeLinksResultSchema, shopeeMatchResultSchema, shopeeViewSchema,
  type ShopeeLinksRequest, type ShopeeMatchRequest
} from "@/lib/shopee-view";
import { ledgerRequest } from "@/lib/wire";

/** The Shopee page's three requests (PLAN task 62 step 4b, D-270), on the shared `ledgerRequest`. */

export function getShopeeView() {
  return ledgerRequest("/api/v1/shopee", shopeeViewSchema, {
    fallback: "The Shopee orders could not be loaded.",
    unreachable: "The ledger could not be reached, so the Shopee orders were not loaded."
  });
}

export function postShopeeMatch(body: ShopeeMatchRequest) {
  return ledgerRequest("/api/v1/shopee/match", shopeeMatchResultSchema, {
    fallback: "The match could not be saved.",
    unreachable: "The ledger could not be reached, so the match was not saved."
  }, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function postShopeeLinks(body: ShopeeLinksRequest) {
  return ledgerRequest("/api/v1/shopee/links", shopeeLinksResultSchema, {
    fallback: "The link could not be saved.",
    unreachable: "The ledger could not be reached, so the link was not saved."
  }, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
