// Column mapping: suggest which uploaded column feeds each field, then turn raw rows into typed records.
import { PARSERS } from "./coerce.js";

// Common header abbreviations, expanded before matching (applied to both headers and synonyms).
const ABBREV = { dt: "date", amt: "amount", chg: "charge", chgs: "charges", wt: "weight", qty: "quantity",
  orig: "origin", dest: "destination", sched: "scheduled", schd: "scheduled", mi: "miles", num: "number", no: "number", appt: "appointment", del: "delivery", dlv: "delivery" };
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  .split(" ").map((w) => ABBREV[w] || w).join(" ");
const tokens = (s) => new Set(norm(s).split(" ").filter(Boolean));

function score(header, field) {
  const h = norm(header);
  if (!h) return 0;
  const names = [field.key.replace(/_/g, " "), field.label, ...(field.synonyms || [])].map(norm);
  if (names.includes(h)) return 100;
  let best = 0;
  const ht = tokens(header);
  for (const n of names) {
    if (n.length >= 3 && (` ${h} `.includes(` ${n} `) || ` ${n} `.includes(` ${h} `))) best = Math.max(best, 70);
    const nt = tokens(n);
    const inter = [...ht].filter((t) => nt.has(t)).length;
    const union = new Set([...ht, ...nt]).size;
    if (union) best = Math.max(best, Math.round(60 * (inter / union)));
  }
  return best;
}

// Returns { mapping: {fieldKey: header|null}, confidence: {fieldKey: "exact"|"likely"|null} }
export function suggestMapping(headers, fields) {
  const pairs = [];
  for (const f of fields) for (const h of headers) {
    const s = score(h, f);
    if (s >= 40) pairs.push({ f: f.key, h, s });
  }
  pairs.sort((a, b) => b.s - a.s);
  const mapping = Object.fromEntries(fields.map((f) => [f.key, null]));
  const confidence = Object.fromEntries(fields.map((f) => [f.key, null]));
  const usedH = new Set();
  for (const p of pairs) {
    if (mapping[p.f] !== null || usedH.has(p.h)) continue;
    mapping[p.f] = p.h;
    confidence[p.f] = p.s === 100 ? "exact" : "likely";
    usedH.add(p.h);
  }
  return { mapping, confidence };
}

// A saved mapping is reused only when every column it names still exists in the new file.
export function savedMappingFits(saved, headers) {
  if (!saved) return false;
  const set = new Set(headers);
  return Object.values(saved).every((h) => h === null || set.has(h));
}

// Turn raw rows into typed records. Rows missing any required value are excluded and counted.
export function materialize(rows, mapping, fields) {
  const records = [];
  const problems = Object.fromEntries(fields.map((f) => [f.key, 0]));
  let excluded = 0;
  for (const raw of rows) {
    const rec = {};
    let ok = true;
    for (const f of fields) {
      const col = mapping[f.key];
      if (!col) { rec[f.key] = null; continue; }
      const rawVal = raw[col];
      const val = PARSERS[f.type](rawVal);
      const blank = rawVal === null || rawVal === undefined || String(rawVal).trim() === "";
      if (val === null && !blank) problems[f.key]++;
      if (val === null && f.required) ok = false;
      rec[f.key] = val;
    }
    if (ok) records.push(rec); else excluded++;
  }
  return { records, excluded, problems };
}

export function missingRequired(mapping, fields) {
  return fields.filter((f) => f.required && !mapping[f.key]);
}
