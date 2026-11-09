// Carrier Scorecard calculations. Pure functions: records in, numbers out (no DOM).
// Every rate is a ratio of totals (e.g. total cost / total miles), never an average of per-row ratios.

export const weekStart = (day) => day - ((day + 3) % 7); // Monday of the week (day 0 = Thu 1970-01-01)
export const monthKey = (day) => new Date(day * 86400000).toISOString().slice(0, 7);

export function filterRecords(records, dateKey, f) {
  return records.filter((r) =>
    (f.from == null || r[dateKey] >= f.from) &&
    (f.to == null || r[dateKey] <= f.to) &&
    (!f.carrier || r.carrier === f.carrier));
}

function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

const ratio = (a, b) => (b > 0 ? a / b : null);

// ---------- On-time ----------
export function onTimeStats(recs) {
  const del = recs.filter((r) => r.sched_delivery != null && r.actual_delivery != null);
  const onTime = del.filter((r) => r.actual_delivery <= r.sched_delivery);
  const late = del.filter((r) => r.actual_delivery > r.sched_delivery);
  const pick = recs.filter((r) => r.actual_pickup != null && r.ship_date != null);
  const pickOn = pick.filter((r) => r.actual_pickup <= r.ship_date);
  return {
    shipments: recs.length,
    measuredDeliveries: del.length,
    onTimeDeliveries: onTime.length,
    otd: ratio(onTime.length, del.length),
    lateDeliveries: late.length,
    avgDaysLate: late.length ? late.reduce((s, r) => s + (r.actual_delivery - r.sched_delivery), 0) / late.length : null,
    measuredPickups: pick.length,
    otp: ratio(pickOn.length, pick.length),
  };
}

// ---------- Cost ----------
export function costStats(recs) {
  const c = recs.filter((r) => r.cost != null);
  const cm = c.filter((r) => r.miles != null && r.miles > 0);
  const cw = c.filter((r) => r.weight != null && r.weight > 0);
  const spend = c.reduce((s, r) => s + r.cost, 0);
  return {
    shipments: recs.length,
    costedShipments: c.length,
    spend,
    costPerShipment: ratio(spend, c.length),
    costPerMile: ratio(cm.reduce((s, r) => s + r.cost, 0), cm.reduce((s, r) => s + r.miles, 0)),
    costPerCwt: ratio(cw.reduce((s, r) => s + r.cost, 0), cw.reduce((s, r) => s + r.weight, 0) / 100),
  };
}

// ---------- Claims ----------
export function claimStats(recs) {
  const claims = recs.filter((r) => r.claim_amount != null && r.claim_amount > 0);
  const claimDollars = claims.reduce((s, r) => s + r.claim_amount, 0);
  const spend = recs.filter((r) => r.cost != null).reduce((s, r) => s + r.cost, 0);
  return {
    shipments: recs.length,
    claims: claims.length,
    claimRate: ratio(claims.length, recs.length),
    claimDollars,
    claimsPctOfSpend: ratio(claimDollars, spend),
  };
}

// ---------- Tenders ----------
export function tenderStats(recs) {
  const acc = recs.filter((r) => r.accepted === true).length;
  return { offered: recs.length, accepted: acc, rejected: recs.length - acc, acceptance: ratio(acc, recs.length) };
}

export function byCarrier(recs, statFn) {
  return [...groupBy(recs, (r) => r.carrier)]
    .map(([carrier, rs]) => ({ carrier, ...statFn(rs) }))
    .sort((a, b) => a.carrier.localeCompare(b.carrier));
}

export function byPeriod(recs, dateKey, periodFn, statFn) {
  return [...groupBy(recs, (r) => periodFn(r[dateKey]))]
    .map(([period, rs]) => ({ period, ...statFn(rs) }))
    .sort((a, b) => (a.period < b.period ? -1 : 1));
}

export function lanes(recs) {
  const withLane = recs.filter((r) => r.origin && r.destination);
  return [...groupBy(withLane, (r) => `${r.origin} → ${r.destination}`)]
    .map(([lane, rs]) => ({ lane, ...costStats(rs), ...onTimeStats(rs) }))
    .sort((a, b) => b.shipments - a.shipments);
}

// ---------- Ranking ----------
// Each metric is rescaled across carriers so the best carrier scores 100 and the worst 0
// (lower is better for cost per mile and claim rate). The overall score is the weighted
// average of whichever metrics a carrier has, with weights rescaled to the metrics present.
export const RANK_METRICS = [
  { key: "otd", label: "On-time delivery", higherBetter: true },
  { key: "acceptance", label: "Tender acceptance", higherBetter: true },
  { key: "costPerMile", label: "Cost per mile", higherBetter: false },
  { key: "claimRate", label: "Claim rate", higherBetter: false },
];

export function ranking(shipRecs, tenderRecs, weights, opts = { claimsMapped: true }) {
  const names = new Set([...shipRecs.map((r) => r.carrier), ...tenderRecs.map((r) => r.carrier)]);
  const shipBy = groupBy(shipRecs, (r) => r.carrier);
  const tendBy = groupBy(tenderRecs, (r) => r.carrier);
  const rows = [...names].map((carrier) => {
    const s = shipBy.get(carrier) || [];
    const t = tendBy.get(carrier) || [];
    const ot = onTimeStats(s), cs = costStats(s), cl = claimStats(s), td = tenderStats(t);
    return {
      carrier, shipments: s.length, tenders: t.length,
      otd: s.length ? ot.otd : null,
      acceptance: t.length ? td.acceptance : null,
      costPerMile: s.length ? cs.costPerMile : null,
      claimRate: s.length && opts.claimsMapped ? cl.claimRate : null, // blank claim = no claim
    };
  });
  const active = RANK_METRICS.filter((m) => (weights[m.key] || 0) > 0 && rows.some((r) => r[m.key] != null));
  for (const m of active) {
    const vals = rows.map((r) => r[m.key]).filter((v) => v != null);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    for (const r of rows) {
      if (r[m.key] == null) { r[`${m.key}Score`] = null; continue; }
      const pos = hi === lo ? 1 : (r[m.key] - lo) / (hi - lo);
      r[`${m.key}Score`] = 100 * (m.higherBetter ? pos : 1 - pos);
    }
  }
  for (const r of rows) {
    let wsum = 0, total = 0;
    for (const m of active) {
      const sc = r[`${m.key}Score`];
      if (sc != null) { wsum += weights[m.key]; total += weights[m.key] * sc; }
    }
    r.score = wsum ? total / wsum : null;
  }
  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  rows.forEach((r, i) => (r.rank = r.score == null ? null : i + 1));
  return { rows, active };
}
