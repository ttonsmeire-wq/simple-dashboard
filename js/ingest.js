// Read an uploaded file in the browser. Files never leave the user's computer.
// CSV uses the bundled Papa Parse. Excel loads SheetJS from its official CDN the first time it is needed.
const SHEETJS_URL = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
let sheetjs = null;

function loadSheetJs() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!sheetjs) {
    sheetjs = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SHEETJS_URL;
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => { sheetjs = null; reject(new Error("Could not load the Excel reader. Check your connection, or save the sheet as CSV and upload that.")); };
      document.head.appendChild(s);
    });
  }
  return sheetjs;
}

const isExcel = (name) => /\.(xlsx|xlsm|xls)$/i.test(name);

// Returns { sheets: [name...] } for Excel files with several sheets, otherwise { headers, rows }.
export async function readFile(file, sheetName) {
  if (isExcel(file.name)) {
    const XLSX = await loadSheetJs();
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true, dense: true });
    if (!sheetName && wb.SheetNames.length > 1) return { sheets: wb.SheetNames };
    const ws = wb.Sheets[sheetName || wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: "", dateNF: "yyyy-mm-dd" });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return { headers, rows };
  }
  if (!/\.(csv|txt|tsv)$/i.test(file.name)) throw new Error("Please upload a .csv, .tsv, .txt, or Excel (.xlsx) file.");
  return parseCsvText(await file.text());
}

export function parseCsvText(text) {
  const p = window.Papa.parse(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  const headers = (p.meta.fields || []).filter((h) => h !== "");
  if (!headers.length) throw new Error("No header row found. The first row of the file should hold the column names.");
  return { headers, rows: p.data };
}
