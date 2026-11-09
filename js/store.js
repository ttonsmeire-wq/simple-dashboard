// Local persistence in the browser (IndexedDB). Nothing here touches the network.
const DB_NAME = "simple-dashboard";
const STORE = "datasets";
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export const key = (themeId, datasetId) => `${themeId}:${datasetId}`;

// record: { fileName, savedAt, headers, rows, mapping }
export const saveDataset = (themeId, datasetId, record) =>
  tx("readwrite", (s) => s.put(record, key(themeId, datasetId)));

export const loadDataset = (themeId, datasetId) =>
  tx("readonly", (s) => s.get(key(themeId, datasetId)));

export const deleteDataset = (themeId, datasetId) =>
  tx("readwrite", (s) => s.delete(key(themeId, datasetId)));

export async function loadAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out = {};
    const req = db.transaction(STORE, "readonly").objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) { out[c.key] = c.value; c.continue(); } else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function replaceAll(entries) {
  await tx("readwrite", (s) => {
    s.clear();
    for (const [k, v] of Object.entries(entries)) s.put(v, k);
  });
}
