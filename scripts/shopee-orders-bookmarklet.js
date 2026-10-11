// Shopee order export — run on https://shopee.co.th/user/purchase (scroll first to load
// the orders you want). Opens each loaded order in a hidden frame, reads only receipt
// fields (never the delivery address or phone) and downloads shopee-orders-<date>.json.
// Amounts are kept as exact decimal strings in baht; nothing is rounded.
// Build the bookmark with: node scripts/shopee-orders-bookmarklet.js --print
async function shopeeOrderExport(opts = {}) {
  const limit = opts.limit ?? Infinity;
  const download = opts.download ?? true;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const money = /^-?฿[\d,]+(\.\d+)?$/;
  const priceLine = /^(฿[\d,]+(\.\d+)?)+$/;
  const amount = (s) => s.replace(/[฿,]/g, "");
  const date = /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/;

  // A cancelled order's card links to /cancellation/<id>; the order itself is at /order/<same id>.
  const orderLinks = () => [...new Set([...document.querySelectorAll('a[href*="/user/purchase/order/"], a[href*="/user/purchase/cancellation/"]')].map((a) => a.href.split("?")[0]))];
  if (!orderLinks().length) { alert("No orders found — open shopee.co.th/user/purchase first."); return []; }

  const badge = document.createElement("div");
  badge.style.cssText = "position:fixed;top:8px;right:8px;z-index:99999;background:#ee4d2d;color:#fff;padding:8px 12px;border-radius:6px;font:14px sans-serif";
  document.body.appendChild(badge);

  // The list loads 5 more orders when its bottom spinner scrolls back into view; a nudge up
  // then down triggers it. Loads can stall for 15s+, so stop only after 10 unchanged nudges
  // (~35s) or once the limit is reached. A first run stopped at 68 of 73 with 6 × 2.4s.
  for (let still = 0; still < 10 && orderLinks().length < limit; ) {
    const before = orderLinks().length;
    badge.textContent = `Shopee export: loading orders… ${before}`;
    window.scrollBy(0, -600); await sleep(500);
    window.scrollTo(0, document.body.scrollHeight); await sleep(3000);
    still = orderLinks().length === before ? still + 1 : 0;
  }
  const hrefs = orderLinks().slice(0, limit);

  function parse(lines, url) {
    const out = { url, orderId: null, status: null, timeline: {}, shops: [], priceRows: [], orderTotal: null, paymentMethod: null, check: null, itemsCheck: null };
    const idLine = lines.find((s) => /^ORDER ID\./.test(s));
    out.orderId = idLine ? idLine.replace(/^ORDER ID\.\s*/, "") : null;
    const idIdx = lines.indexOf(idLine);
    if (lines[idIdx + 1] === "|") out.status = lines[idIdx + 2];

    // Stepper: label followed by a dd-mm-yyyy hh:mm line. Stops before the address block.
    const addr = lines.findIndex((s) => /Delivery Address/i.test(s));
    for (let i = idIdx; i < (addr > 0 ? addr : lines.length) - 1; i++) {
      if (date.test(lines[i + 1]) && !date.test(lines[i])) {
        const label = lines[i].replace(/\s*\(฿[\d,.]+\)$/, "");
        out.timeline[label] = lines[i + 1];
      }
    }

    // Parcel cards: shop name sits before "View Shop" (and before "Chat" when the shop has
    // one; instant-delivery shops like BigC don't). Items run until "Merchandise Subtotal".
    const sub = lines.indexOf("Merchandise Subtotal");
    let shop = null, i = lines.indexOf("Parcel Card Section");
    for (; i < sub; i++) {
      if (lines[i] === "View Shop") {
        shop = { name: lines[i - 1] === "Chat" ? lines[i - 2] : lines[i - 1], items: [] }; out.shops.push(shop); continue;
      }
      if (!shop || lines[i] === "Go to PDP") continue;
      if (priceLine.test(lines[i]) || money.test(lines[i]) || /^x\d+$/.test(lines[i])) continue;
      // Item: name, optional "Variation: …", "xN", then one or two prices (original, paid).
      const item = { name: lines[i], variation: null, qty: null, price: null, originalPrice: null };
      let j = i + 1;
      if (/^Variation:/.test(lines[j] || "")) { item.variation = lines[j].replace(/^Variation:\s*/, ""); j++; }
      if (!/^x\d+$/.test(lines[j] || "")) continue; // not an item line (badges, notices)
      item.qty = Number(lines[j].slice(1)); j++;
      // A discounted item shows original and paid price on one line: "฿335฿213".
      const prices = [];
      while (priceLine.test(lines[j] || "")) prices.push(...lines[j++].match(/฿[\d,]+(\.\d+)?/g).map(amount));
      item.price = prices.at(-1) ?? null;
      if (prices.length > 1) item.originalPrice = prices[0];
      shop.items.push(item);
      i = j - 1;
    }

    // Price rows: label/value pairs from Merchandise Subtotal to Order Total.
    const tot = lines.indexOf("Order Total");
    for (let k = sub; k >= 0 && k < tot; k++) {
      if (!money.test(lines[k]) && money.test(lines[k + 1] || "")) out.priceRows.push({ label: lines[k], amount: amount(lines[k + 1]) });
    }
    if (tot >= 0 && money.test(lines[tot + 1] || "")) out.orderTotal = amount(lines[tot + 1]);
    const pm = lines.indexOf("Payment Method");
    if (pm >= 0) out.paymentMethod = lines[pm + 1];

    // Exact check in satang: price rows must sum to the order total.
    const satang = (s) => { const [w, f = ""] = s.replace("-", "").split("."); const v = BigInt(w) * 100n + BigInt((f + "00").slice(0, 2)); return s.startsWith("-") ? -v : v; };
    if (out.orderTotal && out.priceRows.length) {
      const sum = out.priceRows.reduce((a, r) => a + satang(r.amount), 0n);
      out.check = sum === satang(out.orderTotal) ? "ok" : `rows sum ${sum} satang ≠ total`;
    }
    const merch = out.priceRows.find((r) => r.label === "Merchandise Subtotal");
    const items = out.shops.flatMap((s) => s.items);
    // Shopee shows a unit price on some orders and a line total on others (a bundle deal
    // looked like the latter), so record which reading makes the items sum to the subtotal.
    if (merch && items.every((it) => it.price)) {
      const want = satang(merch.amount);
      const asLine = items.reduce((a, it) => a + satang(it.price), 0n);
      const asUnit = items.reduce((a, it) => a + satang(it.price) * BigInt(it.qty), 0n);
      out.itemPriceIs = asLine === want ? "line total" : asUnit === want ? "unit price" : null;
      out.itemsCheck = out.itemPriceIs ? "ok" : `items sum ${asLine} (or ${asUnit} per unit) satang ≠ subtotal`;
    }
    return out;
  }

  // Cancellation page: label/value pairs after the item card, plus the request header. No
  // delivery block on this page. Seen: "Refund to" is "ShopeePay Balance" or "ShopeePay".
  function parseCancellation(lines, url) {
    const after = (label) => { const i = lines.indexOf(label); return i >= 0 ? lines[i + 1] ?? null : null; };
    const header = (re) => (lines.find((s) => re.test(s)) || "").replace(re, "") || null;
    const refund = after("Refund Amount");
    return {
      url,
      requestId: header(/^Request ID:\s*/),
      requestedAt: header(/^Requested at:\s*/),
      steps: lines.filter((s) => /^(Cancellation Requested|Cancellation Accepted|Refunded|Refund Completed)$/.test(s)),
      refundAmount: refund && money.test(refund) ? amount(refund) : null,
      refundTo: after("Refund to"),
      requestedBy: after("Requested by"),
      orderId: after("Order ID"),
      reason: header(/^Reason:\s*/),
    };
  }

  // Load a same-origin page in a hidden frame and return its lines once `ready` holds.
  async function readFrame(url, ready) {
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;left:-9999px;width:1200px;height:2000px";
    f.src = url;
    document.body.appendChild(f);
    let lines = null;
    for (const t0 = Date.now(); Date.now() - t0 < 30000; ) {
      await sleep(500);
      const text = f.contentDocument?.body?.innerText || "";
      if (ready(text)) {
        await sleep(800); // let late sections settle
        lines = f.contentDocument.body.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
        break;
      }
    }
    f.remove();
    return lines;
  }
  const orderReady = (t) => t.includes("Order Total") && t.includes("Payment Method") && /ORDER ID\./.test(t);
  const cancelReady = (t) => t.includes("Order ID") && t.includes("Requested by");

  // A cancelled order's page has no "Order Paid" line, only "Order Placed" and "Order
  // Cancelled"; its order facts are read from /order/<id> like any other order.
  const results = [];
  for (const [n, link] of hrefs.entries()) {
    badge.textContent = `Shopee export: ${n + 1} / ${hrefs.length}`;
    const cancelUrl = link.includes("/cancellation/") ? link : null;
    const url = cancelUrl ? link.replace("/cancellation/", "/order/") : link;
    try {
      const lines = await readFrame(url, orderReady);
      const out = lines ? parse(lines, url) : { url, error: "timed out after 30s" };
      if (cancelUrl) {
        const c = await readFrame(cancelUrl, cancelReady);
        out.cancellation = c ? parseCancellation(c, cancelUrl) : { url: cancelUrl, error: "timed out after 30s" };
      }
      results.push(out);
    } catch (e) { results.push({ url, error: `parse failed: ${e.message}` }); }
    await sleep(1000);
  }
  badge.remove();

  if (download) {
    const blob = new Blob([JSON.stringify({ source: "shopee.co.th order detail", version: 2, exportedAt: new Date().toISOString(), orders: results }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `shopee-orders-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }
  return results;
}

if (typeof module !== "undefined" && process.argv.includes("--print")) {
  console.log("javascript:" + encodeURIComponent(`(${shopeeOrderExport.toString()})()`));
}
