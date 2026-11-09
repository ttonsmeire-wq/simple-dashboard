// Pure value parsers shared by every theme. No DOM, so they also run under Node for tests.

// Dates become a whole day number (days since 1970-01-01, UTC) so time zones never shift a date.
export function parseDate(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return dayNum(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/))) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return dayNum(y, +m[1], +m[2]);
  }
  // Excel serial date (1900 system), only in a plausible range (1954-2119)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Math.floor(+s);
    if (n > 20000 && n < 80000) return n - 25569;
  }
  return null;
}

function dayNum(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCDate() !== d) return null; // rejects 02/30 etc.
  return Math.round(t / 86400000);
}

export function dayToIso(day) {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}

export function parseNumber(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, "").replace(/(usd|lbs?|mi)$/i, "");
  if (!/^-?\d*\.?\d+(e-?\d+)?$/i.test(s)) return null;
  const n = parseFloat(s);
  return neg ? -n : n;
}

const TRUE_WORDS = new Set(["accepted", "accept", "yes", "y", "true", "t", "1", "a"]);
const FALSE_WORDS = new Set(["rejected", "reject", "declined", "decline", "no", "n", "false", "f", "0", "r", "d"]);

export function parseBool(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  if (TRUE_WORDS.has(s)) return true;
  if (FALSE_WORDS.has(s)) return false;
  return null;
}

export function parseText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

export const PARSERS = { date: parseDate, number: parseNumber, bool: parseBool, text: parseText };
