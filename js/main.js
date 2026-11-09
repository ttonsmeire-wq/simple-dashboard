import { themes, themeById } from "./themes/index.js";
import * as store from "./store.js";
import { readFile, parseCsvText } from "./ingest.js";
import { suggestMapping, savedMappingFits, materialize, missingRequired } from "./mapping.js";
import { dayToIso, parseDate } from "./coerce.js";
import { esc, fmt } from "./charts.js";

const app = document.getElementById("app");
const nav = document.getElementById("nav");

// ---------- state ----------
const cache = {};   // "theme:dataset" -> { stored, records, excluded, problems }
const filters = {}; // themeId -> { from, to, carrier }
let editing = null; // in-progress mapping: { themeId, datasetId, fileName, headers, rows, mapping, confidence, touched }

function build(theme, ds, stored) {
  const { records, excluded, problems } = materialize(stored.rows, stored.mapping, ds.fields);
  cache[store.key(theme.id, ds.id)] = { stored, records, excluded, problems };
}

async function init() {
  const all = await store.loadAll().catch(() => ({}));
  for (const t of themes) for (const ds of t.datasets) {
    const s = all[store.key(t.id, ds.id)];
    if (s) build(t, ds, s);
  }
  window.addEventListener("hashchange", route);
  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (currentModule) route(); }, 200); });
  route();
}

// ---------- routing ----------
let currentModule = null;
function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  currentModule = null;
  renderNav(parts);
  window.scrollTo(0, 0);
  if (!parts.length) return renderHome();
  if (parts[0] === "settings") return renderSettings();
  const theme = themeById(parts[0]);
  if (!theme) return renderHome();
  if (theme.status !== "active") return renderSoon(theme);
  if (!parts[1]) {
    const hasData = theme.datasets.some((d) => cache[store.key(theme.id, d.id)]);
    location.replace(`#/${theme.id}/${hasData ? theme.modules[0].id : "data"}`);
    return;
  }
  if (parts[1] === "data") return renderData(theme);
  const mod = theme.modules.find((m) => m.id === parts[1]);
  if (!mod) return renderData(theme);
  currentModule = mod;
  renderModule(theme, mod);
}

function renderNav(parts) {
  const here = `#/${parts.join("/")}`;
  const link = (href, label, cls = "") => `<a href="${href}" class="${cls}${href === here ? " current" : ""}"${href === here ? ' aria-current="page"' : ""}>${esc(label)}</a>`;
  nav.innerHTML = link("#/", "Home") + themes.map((t) => {
    if (t.status !== "active") return `<div class="nav-theme"><span class="nav-theme-label">${esc(t.label)}</span><span class="nav-soon">Coming soon</span></div>`;
    return `<div class="nav-theme"><span class="nav-theme-label">${esc(t.label)}</span>
      ${link(`#/${t.id}/data`, "Data", "nav-sub")}
      ${t.modules.map((m) => link(`#/${t.id}/${m.id}`, m.label, "nav-sub")).join("")}</div>`;
  }).join("") + link("#/settings", "Save / load setup");
}

// ---------- home ----------
function renderHome() {
  app.innerHTML = `
    <h1>Simple-Dashboard</h1>
    <p class="lede">Upload raw supply chain data, confirm how its columns map, and get dashboards organized by theme.</p>
    <p class="privacy"><b>Your data stays on your computer.</b> Files are read in your browser and saved only in this browser.
    Nothing is sent to a server. Use <a href="#/settings">Save / load setup</a> to move your work to another computer.</p>
    <div class="cards">${themes.map((t) => `
      <article class="card">
        <h2>${esc(t.label)}</h2>
        <p>${esc(t.summary)}</p>
        ${t.status === "active"
          ? `<ul class="plain">${t.modules.map((m) => `<li>${esc(m.label)}</li>`).join("")}</ul><a class="btn" href="#/${t.id}">Open</a>`
          : `<ul class="plain">${t.planned.map((m) => `<li>${esc(m)}</li>`).join("")}</ul><span class="muted">Coming soon</span>`}
      </article>`).join("")}</div>`;
}

function renderSoon(theme) {
  app.innerHTML = `<h1>${esc(theme.label)}</h1><p class="lede">${esc(theme.summary)}</p>
    <div class="notice">This theme is coming soon. Planned modules: ${esc(theme.planned.join(", "))}.</div>`;
}

// ---------- data page ----------
function renderData(theme) {
  app.innerHTML = `<h1>${esc(theme.label)}: Data</h1>
    <p class="lede">Each data type below has its own upload and column mapping. Load the ones you have; modules that need a missing type will say so.</p>
    <div class="datasets">${theme.datasets.map((ds) => `<section class="dataset" id="ds-${ds.id}"></section>`).join("")}</div>`;
  for (const ds of theme.datasets) renderDataset(theme, ds);
}

function renderDataset(theme, ds) {
  const box = document.getElementById(`ds-${ds.id}`);
  const c = cache[store.key(theme.id, ds.id)];
  const isEditing = editing && editing.themeId === theme.id && editing.datasetId === ds.id;
  const head = `<h2>${esc(ds.label)}</h2><p>${esc(ds.description)}</p>`;
  if (isEditing) return renderMapping(box, theme, ds, head);
  const fileInput = `<label class="btn">${c ? "Replace file" : "Upload CSV or Excel"}<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls" hidden data-file></label>`;
  if (!c) {
    box.innerHTML = `${head}
      <details><summary>Expected columns</summary><ul class="fields">${ds.fields.map((f) =>
        `<li><b>${esc(f.label)}</b>${f.required ? " (required)" : ""}: ${esc(f.help)}</li>`).join("")}</ul></details>
      <div class="actions">${fileInput}<button class="btn ghost" data-sample>Load sample data</button></div><div class="msg" aria-live="polite"></div>`;
  } else {
    const probs = Object.entries(c.problems).filter(([, n]) => n > 0)
      .map(([k, n]) => `${fmt.int(n)} value${n === 1 ? "" : "s"} in <b>${esc(ds.fields.find((f) => f.key === k).label)}</b> couldn't be read`);
    box.innerHTML = `${head}
      <dl class="status">
        <dt>File</dt><dd>${esc(c.stored.fileName)}</dd>
        <dt>Saved</dt><dd>${new Date(c.stored.savedAt).toLocaleString()}</dd>
        <dt>Rows used</dt><dd>${fmt.int(c.records.length)} of ${fmt.int(c.stored.rows.length)}${c.excluded ? ` (${fmt.int(c.excluded)} excluded: a required value was blank or unreadable)` : ""}</dd>
        <dt>Mapped fields</dt><dd>${ds.fields.filter((f) => c.stored.mapping[f.key]).length} of ${ds.fields.length}</dd>
      </dl>
      ${probs.length ? `<div class="notice"><b>Check your data:</b> ${probs.join("; ")}. Those values are treated as blank.</div>` : ""}
      ${c.records.length === 0 ? `<div class="notice"><b>No usable rows.</b> Check the mapping for the required fields.</div>` : ""}
      <div class="actions"><button class="btn" data-edit>Edit mapping</button>${fileInput}<button class="btn ghost" data-remove>Remove</button></div><div class="msg" aria-live="polite"></div>`;
  }
  const msg = box.querySelector(".msg");
  box.querySelector("[data-file]").addEventListener("change", (e) => handleFile(theme, ds, e.target.files[0], msg));
  box.querySelector("[data-sample]")?.addEventListener("click", async () => {
    try {
      const res = await fetch(ds.sample);
      if (!res.ok) throw new Error("Sample file not found.");
      startEditing(theme, ds, "Sample data (fictional)", parseCsvText(await res.text()));
    } catch (err) { msg.textContent = err.message; }
  });
  box.querySelector("[data-edit]")?.addEventListener("click", () => {
    const s = c.stored;
    editing = { themeId: theme.id, datasetId: ds.id, fileName: s.fileName, headers: s.headers, rows: s.rows,
      mapping: { ...s.mapping }, confidence: Object.fromEntries(ds.fields.map((f) => [f.key, s.mapping[f.key] ? "saved" : null])) };
    renderDataset(theme, ds);
  });
  box.querySelector("[data-remove]")?.addEventListener("click", async () => {
    if (!confirm(`Remove the ${ds.label} data from this browser?`)) return;
    await store.deleteDataset(theme.id, ds.id);
    delete cache[store.key(theme.id, ds.id)];
    renderDataset(theme, ds);
  });
}

async function handleFile(theme, ds, file, msg, sheet) {
  if (!file) return;
  msg.textContent = "Reading file…";
  try {
    const out = await readFile(file, sheet);
    if (out.sheets) {
      msg.innerHTML = `This workbook has several sheets. Which one holds the ${esc(ds.label.toLowerCase())} data?
        <select data-sheet><option value="">Choose a sheet…</option>${out.sheets.map((s) => `<option>${esc(s)}</option>`).join("")}</select>`;
      msg.querySelector("[data-sheet]").addEventListener("change", (e) => e.target.value && handleFile(theme, ds, file, msg, e.target.value));
      return;
    }
    if (!out.rows.length) throw new Error("The file has a header row but no data rows.");
    startEditing(theme, ds, sheet ? `${file.name} (${sheet})` : file.name, out);
  } catch (err) { msg.textContent = err.message; }
}

function startEditing(theme, ds, fileName, { headers, rows }) {
  const prior = cache[store.key(theme.id, ds.id)]?.stored.mapping;
  let mapping, confidence;
  if (savedMappingFits(prior, headers)) {
    mapping = { ...prior };
    confidence = Object.fromEntries(ds.fields.map((f) => [f.key, prior[f.key] ? "saved" : null]));
  } else ({ mapping, confidence } = suggestMapping(headers, ds.fields));
  editing = { themeId: theme.id, datasetId: ds.id, fileName, headers, rows, mapping, confidence };
  renderDataset(theme, ds);
}

const STATUS = {
  exact: "✓ Matched",
  likely: "? Likely match: please check",
  saved: "✓ From your saved mapping",
  user: "✓ Set by you",
};

function renderMapping(box, theme, ds, head) {
  const e = editing;
  const samples = (col) => {
    if (!col) return "";
    const v = []; for (const r of e.rows) { const x = r[col]; if (x !== "" && x != null) v.push(String(x)); if (v.length === 3) break; }
    return v.map(esc).join(", ");
  };
  const usedCols = new Set(Object.values(e.mapping).filter(Boolean));
  const unused = e.headers.filter((h) => !usedCols.has(h));
  const missing = missingRequired(e.mapping, ds.fields);
  const counts = {}; for (const h of Object.values(e.mapping)) if (h) counts[h] = (counts[h] || 0) + 1;
  box.innerHTML = `${head}
    <p><b>${esc(e.fileName)}</b>: ${fmt.int(e.rows.length)} rows, ${e.headers.length} columns. Check each match below; change any that are wrong.</p>
    <div class="table-wrap"><table class="mapping">
      <thead><tr><th>Field</th><th>Your column</th><th>Status</th><th>Example values</th></tr></thead>
      <tbody>${ds.fields.map((f) => {
        const col = e.mapping[f.key];
        const st = col ? STATUS[e.confidence[f.key]] || STATUS.user : f.required ? "✕ Required: not mapped" : "— Not mapped (optional)";
        const dup = col && counts[col] > 1 ? `<div class="small">This column is also used for another field.</div>` : "";
        return `<tr>
          <td><b>${esc(f.label)}</b>${f.required ? " <span class='req'>(required)</span>" : ""}<div class="small muted">${esc(f.help)}</div></td>
          <td><select data-field="${f.key}" aria-label="Column for ${esc(f.label)}"><option value="">— Not mapped —</option>${e.headers.map((h) =>
            `<option${h === col ? " selected" : ""}>${esc(h)}</option>`).join("")}</select></td>
          <td class="${!col && f.required ? "strong" : ""}">${st}${dup}</td>
          <td class="small">${samples(col)}</td></tr>`;
      }).join("")}</tbody></table></div>
    <p class="small">${unused.length ? `Columns not used: ${unused.map(esc).join(", ")}` : "Every column is used."}</p>
    ${missing.length ? `<div class="notice">Map the required field${missing.length > 1 ? "s" : ""} ${missing.map((f) => `<b>${esc(f.label)}</b>`).join(", ")} to continue.</div>` : ""}
    <div class="actions"><button class="btn" data-save ${missing.length ? "disabled" : ""}>Save and build dashboards</button><button class="btn ghost" data-cancel>Cancel</button></div>`;
  box.querySelectorAll("select[data-field]").forEach((sel) => sel.addEventListener("change", () => {
    e.mapping[sel.dataset.field] = sel.value || null;
    e.confidence[sel.dataset.field] = sel.value ? "user" : null;
    renderDataset(theme, ds);
  }));
  box.querySelector("[data-cancel]").addEventListener("click", () => { editing = null; renderDataset(theme, ds); });
  box.querySelector("[data-save]").addEventListener("click", async () => {
    const stored = { fileName: e.fileName, savedAt: Date.now(), headers: e.headers, rows: e.rows, mapping: e.mapping };
    await store.saveDataset(theme.id, ds.id, stored);
    build(theme, ds, stored);
    delete filters[theme.id];
    editing = null;
    renderDataset(theme, ds);
  });
}

// ---------- module pages ----------
function themeRange(theme) {
  let lo = Infinity, hi = -Infinity; const carriers = new Set();
  for (const ds of theme.datasets) {
    const c = cache[store.key(theme.id, ds.id)]; if (!c) continue;
    const k = theme.filterDate[ds.id];
    for (const r of c.records) { if (r[k] < lo) lo = r[k]; if (r[k] > hi) hi = r[k]; if (r.carrier) carriers.add(r.carrier); }
  }
  return { lo: lo === Infinity ? null : lo, hi: hi === -Infinity ? null : hi, carriers: [...carriers].sort() };
}

function renderModule(theme, mod) {
  const range = themeRange(theme);
  const f = (filters[theme.id] ||= { from: range.lo, to: range.hi, carrier: "" });
  app.innerHTML = `<h1>${esc(mod.label)}</h1>
    ${range.lo == null ? "" : `<form class="filters" aria-label="Filters">
      <label>From <input type="date" name="from" value="${f.from == null ? "" : dayToIso(f.from)}" min="${dayToIso(range.lo)}" max="${dayToIso(range.hi)}"></label>
      <label>To <input type="date" name="to" value="${f.to == null ? "" : dayToIso(f.to)}" min="${dayToIso(range.lo)}" max="${dayToIso(range.hi)}"></label>
      <label>Carrier <select name="carrier"><option value="">All carriers</option>${range.carriers.map((c) => `<option${c === f.carrier ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      <button type="button" class="btn ghost" data-reset>Reset filters</button></form>`}
    <div class="module"></div>`;
  const form = app.querySelector(".filters");
  if (form) {
    form.addEventListener("change", () => {
      f.from = parseDate(form.elements.from.value); f.to = parseDate(form.elements.to.value);
      f.carrier = form.elements.carrier.value;
      renderModule(theme, mod);
    });
    form.querySelector("[data-reset]").addEventListener("click", () => { delete filters[theme.id]; renderModule(theme, mod); });
  }
  const ctx = {
    filters: f,
    mapped: (dsId, field) => !!cache[store.key(theme.id, dsId)]?.stored.mapping[field],
    get(dsId, opts = {}) {
      const c = cache[store.key(theme.id, dsId)];
      if (!c) return null;
      const k = theme.filterDate[dsId];
      return c.records.filter((r) => (f.from == null || r[k] >= f.from) && (f.to == null || r[k] <= f.to)
        && (opts.ignoreCarrier || !f.carrier || r.carrier === f.carrier));
    },
  };
  mod.render(app.querySelector(".module"), ctx);
}

// ---------- save / load setup ----------
function renderSettings() {
  const n = Object.keys(cache).length;
  app.innerHTML = `<h1>Save / load setup</h1>
    <p class="lede">Your data and column mappings are saved in this browser only. To move them to another computer or share them, save a setup file and load it there.</p>
    <p>Currently saved: ${n} dataset${n === 1 ? "" : "s"}.</p>
    <div class="actions">
      <button class="btn" data-export ${n ? "" : "disabled"}>Save setup file</button>
      <label class="btn">Load setup file<input type="file" accept=".json" hidden data-import></label>
      <button class="btn ghost" data-clear ${n ? "" : "disabled"}>Clear all data from this browser</button>
    </div>
    <p class="small muted">A setup file contains your uploaded data. Share it only with people who should see that data.</p>
    <div class="msg" aria-live="polite"></div>`;
  const msg = app.querySelector(".msg");
  app.querySelector("[data-export]").addEventListener("click", async () => {
    const data = { app: "simple-dashboard", version: 1, exportedAt: new Date().toISOString(), datasets: await store.loadAll() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `simple-dashboard-setup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    msg.textContent = "Setup file saved to your downloads.";
  });
  app.querySelector("[data-import]").addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "simple-dashboard" || typeof data.datasets !== "object") throw new Error("That isn't a Simple-Dashboard setup file.");
      if (n && !confirm("Loading this file replaces the data currently saved in this browser. Continue?")) return;
      await store.replaceAll(data.datasets);
      for (const k of Object.keys(cache)) delete cache[k];
      for (const k of Object.keys(filters)) delete filters[k];
      for (const t of themes) for (const ds of t.datasets) { const s = data.datasets[store.key(t.id, ds.id)]; if (s) build(t, ds, s); }
      renderSettings();
      app.querySelector(".msg").textContent = `Loaded ${Object.keys(data.datasets).length} dataset(s).`;
    } catch (err) { msg.textContent = err instanceof SyntaxError ? "That file isn't valid JSON." : err.message; }
  });
  app.querySelector("[data-clear]").addEventListener("click", async () => {
    if (!confirm("Delete all Simple-Dashboard data and mappings from this browser? This can't be undone unless you saved a setup file.")) return;
    await store.replaceAll({});
    for (const k of Object.keys(cache)) delete cache[k];
    for (const k of Object.keys(filters)) delete filters[k];
    renderSettings();
  });
}

init();
