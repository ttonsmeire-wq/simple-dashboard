// Carrier Scorecard pages. Each render(view, ctx) draws into `view`.
// ctx.get(datasetId, { ignoreCarrier }) returns filtered typed records, or null when that dataset isn't loaded.
// ctx.mapped(datasetId, fieldKey) says whether the user mapped a column to that field.
import * as M from "./metrics.js";
import { barChart, lineChart, table, fmt, esc } from "../../charts.js";
import { dayToIso } from "../../coerce.js";

const needData = (label) => `<div class="notice">Upload <b>${esc(label)}</b> data on the <a href="#/carrier/data">Data</a> page to use this module.</div>`;
const needField = (label) => `<div class="notice">Map a column to <b>${esc(label)}</b> on the <a href="#/carrier/data">Data</a> page to use this module.</div>`;

function tiles(items) {
  return `<div class="tiles">${items.map(([label, value, note]) => `
    <div class="tile"><div class="tile-label">${esc(label)}</div>
    <div class="tile-value">${value}</div>${note ? `<div class="tile-note">${note}</div>` : ""}</div>`).join("")}</div>`;
}
const val = (v, f) => (v == null ? "—" : f(v));

function panel(title, note) {
  return `<section class="panel"><h3>${esc(title)}</h3>${note ? `<p class="panel-note">${note}</p>` : ""}<div class="panel-body"></div></section>`;
}
function panels(view, defs) {
  view.insertAdjacentHTML("beforeend", defs.map(([t, n]) => panel(t, n)).join(""));
  return [...view.querySelectorAll(".panel-body")].slice(-defs.length);
}
const weekLabel = (d) => dayToIso(d).slice(5);
const COMPARE_NOTE = "All carriers shown for comparison; the carrier filter doesn't apply here.";

// ---------- On-Time ----------
function ontime(view, ctx) {
  const all = ctx.get("shipments");
  if (!all) return (view.innerHTML = needData("Shipments"));
  if (!ctx.mapped("shipments", "sched_delivery") || !ctx.mapped("shipments", "actual_delivery"))
    return (view.innerHTML = needField("Scheduled delivery date and Actual delivery date"));
  const s = M.onTimeStats(all);
  const hasOtp = ctx.mapped("shipments", "actual_pickup");
  view.innerHTML = tiles([
    ["On-time delivery", val(s.otd, fmt.pct), `${fmt.int(s.onTimeDeliveries)} of ${fmt.int(s.measuredDeliveries)} deliveries`],
    ["On-time pickup", hasOtp ? val(s.otp, fmt.pct) : "—", hasOtp ? `${fmt.int(s.measuredPickups)} pickups measured` : "Map Actual pickup date to enable"],
    ["Late deliveries", fmt.int(s.lateDeliveries)],
    ["Avg days late", val(s.avgDaysLate, fmt.num1), "Late deliveries only"],
  ]) + `<p class="def">On time = delivered on or before the scheduled delivery date. Shipments missing either date are left out of the rate.</p>`;
  const [bar, trend, tbl] = panels(view, [
    ["On-time delivery by carrier", COMPARE_NOTE],
    ["Weekly on-time delivery", "Week starting Monday, by scheduled pickup date."],
    ["Carrier detail", ""],
  ]);
  const per = M.byCarrier(ctx.get("shipments", { ignoreCarrier: true }), M.onTimeStats);
  barChart(bar, per.map((r) => ({ label: r.carrier, value: r.otd, tip: `<b>${esc(r.carrier)}</b><br>${fmt.pct(r.otd)} on time<br>${fmt.int(r.measuredDeliveries)} deliveries` })), { format: fmt.pct, max: 1 });
  const wk = M.byPeriod(all, "ship_date", M.weekStart, M.onTimeStats);
  const lo = Math.max(0, Math.floor(Math.min(...wk.map((w) => w.otd ?? 1)) * 10) / 10);
  lineChart(trend, wk.map((w) => ({ label: weekLabel(w.period), value: w.otd, tip: `<b>Week of ${dayToIso(w.period)}</b><br>${val(w.otd, fmt.pct)} on time<br>${fmt.int(w.measuredDeliveries)} deliveries` })), { format: fmt.pct, min: lo, max: 1 });
  const perF = ctx.filters.carrier ? per.filter((r) => r.carrier === ctx.filters.carrier) : per;
  table(tbl, perF, [
    { key: "carrier", label: "Carrier", align: "left" },
    { key: "shipments", label: "Shipments", format: fmt.int },
    { key: "measuredDeliveries", label: "Measured", format: fmt.int },
    { key: "onTimeDeliveries", label: "On time", format: fmt.int },
    { key: "otd", label: "OTD %", format: fmt.pct },
    { key: "lateDeliveries", label: "Late", format: fmt.int },
    { key: "avgDaysLate", label: "Avg days late", format: fmt.num1 },
    ...(hasOtp ? [{ key: "otp", label: "OTP %", format: fmt.pct }] : []),
  ]);
}

// ---------- Cost ----------
function cost(view, ctx) {
  const all = ctx.get("shipments");
  if (!all) return (view.innerHTML = needData("Shipments"));
  if (!ctx.mapped("shipments", "cost")) return (view.innerHTML = needField("Total freight cost"));
  const hasMiles = ctx.mapped("shipments", "miles"), hasWt = ctx.mapped("shipments", "weight");
  const hasLane = ctx.mapped("shipments", "origin") && ctx.mapped("shipments", "destination");
  const s = M.costStats(all);
  view.innerHTML = tiles([
    ["Freight spend", fmt.usd(s.spend), `${fmt.int(s.costedShipments)} shipments with a cost`],
    ["Cost per shipment", val(s.costPerShipment, fmt.usd2)],
    ["Cost per mile", hasMiles ? val(s.costPerMile, fmt.usd2) : "—", hasMiles ? "Total cost ÷ total miles" : "Map Miles to enable"],
    ["Cost per CWT", hasWt ? val(s.costPerCwt, fmt.usd2) : "—", hasWt ? "Per 100 lb: total cost ÷ (total weight ÷ 100)" : "Map Weight to enable"],
  ]);
  const unit = hasMiles ? ["costPerMile", "Cost per mile"] : ["costPerShipment", "Cost per shipment"];
  const defs = [[`${unit[1]} by carrier`, COMPARE_NOTE], ["Monthly freight spend", "By scheduled pickup date."], ["Carrier detail", ""]];
  if (hasLane) defs.push(["Top lanes by volume", "Top 15 origin → destination pairs."]);
  const [bar, trend, tbl, laneBox] = panels(view, defs);
  const per = M.byCarrier(ctx.get("shipments", { ignoreCarrier: true }), M.costStats);
  barChart(bar, per.map((r) => ({ label: r.carrier, value: r[unit[0]], tip: `<b>${esc(r.carrier)}</b><br>${unit[1]}: ${val(r[unit[0]], fmt.usd2)}<br>Spend: ${fmt.usd(r.spend)}` })), { format: fmt.usd2 });
  const mo = M.byPeriod(all, "ship_date", M.monthKey, M.costStats);
  lineChart(trend, mo.map((m) => ({ label: m.period, value: m.spend, tip: `<b>${m.period}</b><br>${fmt.usd(m.spend)}<br>${fmt.int(m.costedShipments)} shipments` })), { format: fmt.usd, min: 0 });
  const perF = ctx.filters.carrier ? per.filter((r) => r.carrier === ctx.filters.carrier) : per;
  table(tbl, perF, [
    { key: "carrier", label: "Carrier", align: "left" },
    { key: "costedShipments", label: "Shipments", format: fmt.int },
    { key: "spend", label: "Spend", format: fmt.usd },
    { key: "costPerShipment", label: "Per shipment", format: fmt.usd2 },
    ...(hasMiles ? [{ key: "costPerMile", label: "Per mile", format: fmt.usd2 }] : []),
    ...(hasWt ? [{ key: "costPerCwt", label: "Per CWT", format: fmt.usd2 }] : []),
  ]);
  if (laneBox) table(laneBox, M.lanes(all), [
    { key: "lane", label: "Lane", align: "left" },
    { key: "shipments", label: "Shipments", format: fmt.int },
    { key: "spend", label: "Spend", format: fmt.usd },
    ...(hasMiles ? [{ key: "costPerMile", label: "Per mile", format: fmt.usd2 }] : []),
    { key: "otd", label: "OTD %", format: fmt.pct },
  ], { limit: 15 });
}

// ---------- Tender acceptance ----------
function tenders(view, ctx) {
  const all = ctx.get("tenders");
  if (!all) return (view.innerHTML = needData("Tenders"));
  const s = M.tenderStats(all);
  view.innerHTML = tiles([
    ["Tender acceptance", val(s.acceptance, fmt.pct), "Accepted ÷ offered"],
    ["Tenders offered", fmt.int(s.offered)],
    ["Accepted", fmt.int(s.accepted)],
    ["Rejected", fmt.int(s.rejected)],
  ]) + `<p class="def">Rows whose response couldn't be read as accepted or rejected are excluded on import; see the Data page.</p>`;
  const [bar, trend, tbl] = panels(view, [
    ["Acceptance by carrier", COMPARE_NOTE],
    ["Weekly tender acceptance", "Week starting Monday, by tender date."],
    ["Carrier detail", ""],
  ]);
  const per = M.byCarrier(ctx.get("tenders", { ignoreCarrier: true }), M.tenderStats);
  barChart(bar, per.map((r) => ({ label: r.carrier, value: r.acceptance, tip: `<b>${esc(r.carrier)}</b><br>${fmt.pct(r.acceptance)} accepted<br>${fmt.int(r.accepted)} of ${fmt.int(r.offered)} offers` })), { format: fmt.pct, max: 1 });
  const wk = M.byPeriod(all, "tender_date", M.weekStart, M.tenderStats);
  const lo = Math.max(0, Math.floor(Math.min(...wk.map((w) => w.acceptance)) * 10) / 10);
  lineChart(trend, wk.map((w) => ({ label: weekLabel(w.period), value: w.acceptance, tip: `<b>Week of ${dayToIso(w.period)}</b><br>${fmt.pct(w.acceptance)} accepted<br>${fmt.int(w.offered)} offers` })), { format: fmt.pct, min: lo, max: 1 });
  const perF = ctx.filters.carrier ? per.filter((r) => r.carrier === ctx.filters.carrier) : per;
  table(tbl, perF, [
    { key: "carrier", label: "Carrier", align: "left" },
    { key: "offered", label: "Offered", format: fmt.int },
    { key: "accepted", label: "Accepted", format: fmt.int },
    { key: "rejected", label: "Rejected", format: fmt.int },
    { key: "acceptance", label: "Acceptance %", format: fmt.pct },
  ]);
}

// ---------- Claims ----------
function claims(view, ctx) {
  const all = ctx.get("shipments");
  if (!all) return (view.innerHTML = needData("Shipments"));
  if (!ctx.mapped("shipments", "claim_amount")) return (view.innerHTML = needField("Claim amount"));
  const hasCost = ctx.mapped("shipments", "cost");
  const s = M.claimStats(all);
  view.innerHTML = tiles([
    ["Claims filed", fmt.int(s.claims), `${fmt.int(s.shipments)} shipments`],
    ["Claim rate", val(s.claimRate, (v) => `${(v * 100).toFixed(2)}%`), "Claims ÷ shipments"],
    ["Claim value", fmt.usd(s.claimDollars)],
    ["Claims as % of spend", hasCost ? val(s.claimsPctOfSpend, (v) => `${(v * 100).toFixed(2)}%`) : "—", hasCost ? "" : "Map Total freight cost to enable"],
  ]) + `<p class="def">A claim is any shipment with a claim amount above $0.</p>`;
  const [bar, tbl, list] = panels(view, [
    ["Claim rate by carrier", COMPARE_NOTE],
    ["Carrier detail", ""],
    ["Largest claims", "Top 25 by amount."],
  ]);
  const per = M.byCarrier(ctx.get("shipments", { ignoreCarrier: true }), M.claimStats);
  const pct2 = (v) => `${(v * 100).toFixed(2)}%`;
  barChart(bar, per.map((r) => ({ label: r.carrier, value: r.claimRate, tip: `<b>${esc(r.carrier)}</b><br>${pct2(r.claimRate)} claim rate<br>${fmt.int(r.claims)} claims, ${fmt.usd(r.claimDollars)}` })), { format: pct2 });
  const perF = ctx.filters.carrier ? per.filter((r) => r.carrier === ctx.filters.carrier) : per;
  table(tbl, perF, [
    { key: "carrier", label: "Carrier", align: "left" },
    { key: "shipments", label: "Shipments", format: fmt.int },
    { key: "claims", label: "Claims", format: fmt.int },
    { key: "claimRate", label: "Claim rate", format: pct2 },
    { key: "claimDollars", label: "Claim value", format: fmt.usd },
    ...(hasCost ? [{ key: "claimsPctOfSpend", label: "% of spend", format: pct2 }] : []),
  ]);
  const top = all.filter((r) => r.claim_amount > 0).sort((a, b) => b.claim_amount - a.claim_amount)
    .map((r) => ({ ...r, date: dayToIso(r.ship_date) }));
  table(list, top, [
    ...(ctx.mapped("shipments", "shipment_id") ? [{ key: "shipment_id", label: "Shipment", align: "left" }] : []),
    { key: "carrier", label: "Carrier", align: "left" },
    { key: "date", label: "Ship date", align: "left" },
    { key: "claim_amount", label: "Amount", format: fmt.usd2 },
  ], { limit: 25 });
}

// ---------- Ranking ----------
const DEFAULT_WEIGHTS = { otd: 40, acceptance: 20, costPerMile: 25, claimRate: 15 };
let weights = { ...DEFAULT_WEIGHTS };

function ranking(view, ctx) {
  const ship = ctx.get("shipments", { ignoreCarrier: true });
  const tend = ctx.get("tenders", { ignoreCarrier: true });
  if (!ship && !tend) return (view.innerHTML = needData("Shipments or Tenders"));
  const { rows, active } = M.ranking(ship || [], tend || [], weights, { claimsMapped: !!ship && ctx.mapped("shipments", "claim_amount") });
  view.innerHTML = `
    <p class="def">Each measure is rescaled across carriers so the best carrier scores 100 and the worst 0
    (lower is better for cost per mile and claim rate). The overall score is the weighted average of those
    scores. A measure with no data is skipped and the remaining weights are rescaled. Scores compare carriers
    with each other, so adding or removing a carrier can change everyone's score. Date filter applies; carrier filter doesn't.</p>
    <form class="weights">${M.RANK_METRICS.map((m) => `
      <label>${esc(m.label)} weight <input type="number" min="0" max="100" step="5" name="${m.key}" value="${weights[m.key]}"></label>`).join("")}
      <button type="button" class="btn ghost" data-reset>Reset weights</button>
    </form>`;
  const form = view.querySelector(".weights");
  form.addEventListener("change", () => {
    for (const m of M.RANK_METRICS) weights[m.key] = Math.max(0, +form.elements[m.key].value || 0);
    ranking(view, ctx);
  });
  form.querySelector("[data-reset]").addEventListener("click", () => { weights = { ...DEFAULT_WEIGHTS }; ranking(view, ctx); });
  if (!active.length) return view.insertAdjacentHTML("beforeend", `<div class="notice">No measures have both data and a weight above 0.</div>`);
  const skipped = M.RANK_METRICS.filter((m) => !active.includes(m)).map((m) => m.label);
  if (skipped.length) view.insertAdjacentHTML("beforeend", `<p class="def">Not in this score: ${esc(skipped.join(", "))}.</p>`);
  const [bar, tbl] = panels(view, [["Overall score", ""], ["Scorecard", ""]]);
  barChart(bar, rows.map((r) => ({ label: r.carrier, value: r.score, tip: `<b>#${r.rank} ${esc(r.carrier)}</b><br>Score ${val(r.score, fmt.score)}` })), { format: fmt.score, max: 100 });
  const pct2 = (v) => `${(v * 100).toFixed(2)}%`;
  table(tbl, rows, [
    { key: "rank", label: "Rank", format: fmt.int },
    { key: "carrier", label: "Carrier", align: "left" },
    { key: "score", label: "Score", format: fmt.score },
    { key: "otd", label: "OTD %", format: fmt.pct },
    { key: "acceptance", label: "Acceptance %", format: fmt.pct },
    { key: "costPerMile", label: "Cost/mile", format: fmt.usd2 },
    { key: "claimRate", label: "Claim rate", format: pct2 },
    { key: "shipments", label: "Shipments", format: fmt.int },
    { key: "tenders", label: "Tenders", format: fmt.int },
  ]);
}

export const modules = [
  { id: "ranking", label: "Carrier Ranking", render: ranking },
  { id: "ontime", label: "On-Time Performance", render: ontime },
  { id: "cost", label: "Cost", render: cost },
  { id: "tenders", label: "Tender Acceptance", render: tenders },
  { id: "claims", label: "Claims", render: claims },
];
