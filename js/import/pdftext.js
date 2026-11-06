// Estrae il testo di un PDF come righe ordinate (dall'alto in basso, da sinistra a destra),
// usando pdf.js caricato solo quando serve. Tutto avviene sul dispositivo.

let pdfjsPromise = null;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../vendor/pdfjs/pdf.min.mjs').then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
      return m;
    });
  }
  return pdfjsPromise;
}

const Y_TOLERANCE = 2.5;

function groupLines(items) {
  items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const lines = [];
  for (const it of items) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= Y_TOLERANCE);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map((i) => i.str.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ');
    l.x = l.items[0].x;
  }
  lines.sort((a, b) => b.y - a.y);
  return lines;
}

// Restituisce un array di pagine; ogni pagina è un array di righe { text, x, y, items }.
export async function pdfToLines(file) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true }).promise;
  try {
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items
        .filter((i) => i.str && i.str.trim())
        .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5] }));
      pages.push(groupLines(items));
    }
    return pages;
  } finally {
    doc.destroy();
  }
}
