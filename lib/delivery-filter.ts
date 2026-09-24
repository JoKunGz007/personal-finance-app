import type { StoredDelivery, StoredRide } from "@/lib/deliveries";
import { schemeRealCost } from "@/lib/delivery-cost";
import type { DeliveryMatchState } from "@/lib/delivery-match";

/**
 * Narrowing `/deliveries` to what the owner is checking, on the device, over what is already
 * loaded (PLAN task 58). Nothing is fetched or written: every order and ride is read in one list.
 */

export type DeliveryShow = "all" | "grabfood" | "lineman" | "rides";
export type DeliveryLedgerFilter = "all" | "on" | "none" | "pick" | "outside" | "scheme";

export type DeliveryFilter = { show: DeliveryShow; ledger: DeliveryLedgerFilter; query: string };

export const NO_DELIVERY_FILTER: DeliveryFilter = { show: "all", ledger: "all", query: "" };

const LEDGER_STATUSES: Record<Exclude<DeliveryLedgerFilter, "all" | "scheme">, readonly DeliveryMatchState["status"][]> = {
  on: ["matched", "linked"],
  none: ["none", "declined"],
  pick: ["ambiguous"],
  outside: ["outside"]
};

function matchesLedger(filter: DeliveryLedgerFilter, status: DeliveryMatchState["status"], scheme: boolean): boolean {
  if (filter === "all") return true;
  if (filter === "scheme") return scheme;
  return LEDGER_STATUSES[filter].includes(status);
}

/** Every word must appear somewhere in the text, in any order, ignoring case. */
function matchesQuery(query: string, fields: readonly (string | null)[]): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = fields.filter((field) => field !== null).join(" ").toLocaleLowerCase();
  return words.every((word) => text.includes(word));
}

export function filterDeliveries(
  deliveries: readonly StoredDelivery[],
  rides: readonly StoredRide[],
  filter: DeliveryFilter
): { deliveries: StoredDelivery[]; rides: StoredRide[] } {
  const showOrders = filter.show !== "rides";
  // A ride is never paid through ไทยช่วยไทย, so that filter leaves only orders.
  const showRides = (filter.show === "all" || filter.show === "rides") && filter.ledger !== "scheme";
  return {
    deliveries: showOrders
      ? deliveries.filter((delivery) =>
        (filter.show === "all" || delivery.platform === filter.show)
        && matchesLedger(filter.ledger, delivery.match.status, schemeRealCost(delivery) !== null)
        && matchesQuery(filter.query, [
          delivery.restaurant, delivery.booking_id, delivery.payment_method,
          ...delivery.items.flatMap((item) => [item.name, ...item.options])
        ]))
      : [],
    rides: showRides
      ? rides.filter((ride) =>
        matchesLedger(filter.ledger, ride.match.status, false)
        && matchesQuery(filter.query, [ride.pickup_place, ride.dropoff_place, ride.ride_type, ride.booking_id]))
      : []
  };
}
