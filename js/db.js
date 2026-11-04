// IndexedDB: due archivi.
// - meta: intestazione del vault (chiavi avvolte, sali), id dispositivo, date di sincronizzazione,
//   tema. Nessun dato personale in chiaro.
// - records: i dati dell'app, ciascuno cifrato singolarmente ({iv, ct}).

const DB_NAME = 'finanze';
const DB_VERSION = 1;
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('records')) db.createObjectStore('records');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transazione annullata'));
  });
}

export async function metaGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('meta', 'readonly').objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function metaSet(key, value) {
  const db = await openDb();
  const t = db.transaction('meta', 'readwrite');
  t.objectStore('meta').put(value, key);
  return done(t);
}

export async function metaDel(key) {
  const db = await openDb();
  const t = db.transaction('meta', 'readwrite');
  t.objectStore('meta').delete(key);
  return done(t);
}

export async function recordsAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out = [];
    const req = db.transaction('records', 'readonly').objectStore('records').openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) { out.push([c.key, c.value]); c.continue(); } else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function recordsPutMany(entries) {
  const db = await openDb();
  const t = db.transaction('records', 'readwrite');
  const s = t.objectStore('records');
  for (const [k, v] of entries) s.put(v, k);
  return done(t);
}

// Cancella tutto il database di questo dispositivo.
export async function wipe() {
  const db = await openDb();
  db.close();
  dbPromise = null;
  await new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    r.onblocked = () => resolve();
  });
}
