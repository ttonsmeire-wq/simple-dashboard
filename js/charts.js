// Small SVG chart helpers: horizontal bar, line, and table. One series color; hover tooltips on every mark.
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

let tip;
function tooltip() {
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.setAttribute("role", "status");
    document.body.appendChild(tip);
  }
  return tip;
}
function showTip(html, evt) {
  const t = tooltip();
  t.innerHTML = html;
  t.style.display = "block";
  const pad = 12, w = t.offsetWidth, h = t.offsetHeight;
  let x = evt.clientX + pad, y = evt.clientY - h - pad;
  if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
  if (y < 8) y = evt.clientY + pad;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}
const hideTip = () => { if (tip) tip.style.display = "none"; };

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// data: [{ label, value, tip? }]  opts: { format(v), max? }
export function barChart(container, data, opts) {
  container.innerHTML = "";
  const rows = data.filter((d) => d.value != null);
  if (!rows.length) { container.innerHTML = `<p class="muted">No data for this view.</p>`; return; }
  const width = Math.max(container.clientWidth, 300);
  const labelW = Math.min(170, width * 0.38), valueW = 64, rowH = 30, bar = 16, top = 4;
  const height = top + rows.length * rowH;
  const max = opts.max ?? niceMax(Math.max(...rows.map((d) => d.value)));
  const plotW = width - labelW - valueW;
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "img", "aria-label": opts.title || "Bar chart" }, container);
  el("line", { x1: labelW, x2: labelW, y1: 0, y2: height, class: "axis" }, svg);
  rows.forEach((d, i) => {
    const y = top + i * rowH, cy = y + rowH / 2;
    const w = Math.max(0, (d.value / max) * plotW);
    const lab = el("text", { x: labelW - 8, y: cy, class: "tick-label", "text-anchor": "end", "dominant-baseline": "middle" }, svg);
    const maxChars = Math.floor((labelW - 10) / 6.6);
    lab.textContent = d.label.length > maxChars ? `${d.label.slice(0, maxChars - 1)}…` : d.label;
    const r = Math.min(4, w);
    const y0 = cy - bar / 2, y1 = cy + bar / 2, x0 = labelW, x1 = labelW + w;
    el("path", { class: "mark", d: `M${x0},${y0} H${x1 - r} Q${x1},${y0} ${x1},${y0 + r} V${y1 - r} Q${x1},${y1} ${x1 - r},${y1} H${x0} Z` }, svg);
    const val = el("text", { x: x1 + 6, y: cy, class: "value-label", "dominant-baseline": "middle" }, svg);
    val.textContent = opts.format(d.value);
    const hit = el("rect", { x: 0, y, width, height: rowH, class: "hit" }, svg);
    hit.addEventListener("mousemove", (e) => showTip(d.tip || `<b>${esc(d.label)}</b><br>${opts.format(d.value)}`, e));
    hit.addEventListener("mouseleave", hideTip);
  });
}

// points: [{ label, value, tip? }] in order.  opts: { format(v), min?, max? }
export function lineChart(container, points, opts) {
  container.innerHTML = "";
  const pts = points.filter((p) => p.value != null);
  if (pts.length < 2) { container.innerHTML = `<p class="muted">Not enough periods in this view to draw a trend.</p>`; return; }
  const width = Math.max(container.clientWidth, 300), height = 220;
  const m = { l: 56, r: 16, t: 12, b: 28 };
  const vals = pts.map((p) => p.value);
  const lo = opts.min ?? Math.min(...vals), hi = opts.max ?? niceMax(Math.max(...vals));
  const span = hi - lo || 1;
  const x = (i) => m.l + (pts.length === 1 ? 0 : (i / (pts.length - 1)) * (width - m.l - m.r));
  const y = (v) => m.t + (1 - (v - lo) / span) * (height - m.t - m.b);
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "img", "aria-label": opts.title || "Line chart" }, container);
  for (let k = 0; k <= 4; k++) {
    const v = lo + (span * k) / 4, yy = y(v);
    el("line", { x1: m.l, x2: width - m.r, y1: yy, y2: yy, class: k === 0 ? "axis" : "grid" }, svg);
    const t = el("text", { x: m.l - 6, y: yy, class: "tick-label", "text-anchor": "end", "dominant-baseline": "middle" }, svg);
    t.textContent = opts.format(v);
  }
  const step = Math.ceil(pts.length / Math.max(2, Math.floor((width - m.l) / 90)));
  const last = pts.length - 1;
  pts.forEach((p, i) => {
    if (i % step && i !== last) return;
    if (i !== last && last - i < step * 0.75) return; // keep the final label from colliding
    const anchor = i === last ? "end" : i === 0 ? "start" : "middle";
    const t = el("text", { x: x(i), y: height - 8, class: "tick-label", "text-anchor": anchor }, svg);
    t.textContent = p.label;
  });
  el("path", { class: "line", d: pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join("") }, svg);
  const cross = el("line", { y1: m.t, y2: height - m.b, class: "crosshair", visibility: "hidden" }, svg);
  const dot = el("circle", { r: 5, class: "dot", visibility: "hidden" }, svg);
  const hit = el("rect", { x: m.l, y: 0, width: width - m.l - m.r, height, class: "hit" }, svg);
  hit.addEventListener("mousemove", (e) => {
    const box = svg.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * width;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((px - m.l) / (width - m.l - m.r)) * (pts.length - 1))));
    const p = pts[i];
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
    dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(p.value)); dot.setAttribute("visibility", "visible");
    showTip(p.tip || `<b>${esc(p.label)}</b><br>${opts.format(p.value)}`, e);
  });
  hit.addEventListener("mouseleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); });
}

// columns: [{ key, label, format?, align? }]
export function table(container, rows, columns, opts = {}) {
  const limit = opts.limit ?? rows.length;
  const shown = rows.slice(0, limit);
  container.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>${columns.map((c) => `<th class="${c.align === "left" ? "" : "num"}">${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${shown.map((r) => `<tr>${columns.map((c) => {
      const v = r[c.key];
      const txt = v == null ? "—" : c.format ? c.format(v) : esc(v);
      return `<td class="${c.align === "left" ? "" : "num"}">${txt}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>
    ${rows.length > limit ? `<p class="muted small">Showing ${limit} of ${rows.length} rows.</p>` : ""}`;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const fmt = {
  pct: (v) => `${(v * 100).toFixed(1)}%`,
  usd: (v) => `$${Math.round(v).toLocaleString("en-US")}`,
  usd2: (v) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  int: (v) => Math.round(v).toLocaleString("en-US"),
  num1: (v) => v.toFixed(1),
  score: (v) => v.toFixed(1),
};
