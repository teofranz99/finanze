// File allegati (ricevute: foto o PDF), salvati cifrati come gli altri dati.
// Record nella collezione 'files': { id, name, type, size, data (base64), createdAt }.
// Le foto vengono ridotte (lato lungo 1600 px, JPEG) per non appesantire archivio e backup.

import * as S from '../store.js';
import { uid, b64, unb64 } from '../util.js';

const MAX_SIDE = 1600;
const MAX_BYTES = 6 * 1024 * 1024;

async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    return blob || file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Salva un file scelto dall'utente e restituisce l'id.
export async function saveFile(file) {
  const isImage = /^image\//.test(file.type) && file.type !== 'image/svg+xml';
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isImage && !isPdf) throw new Error('Puoi allegare una foto o un PDF.');
  const blob = isImage ? await shrinkImage(file) : file;
  if (blob.size > MAX_BYTES) throw new Error('Il file è troppo grande (massimo 6 MB).');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const rec = {
    id: uid(),
    name: isImage ? file.name.replace(/\.\w+$/, '.jpg') : file.name,
    type: isImage ? (blob.type || 'image/jpeg') : 'application/pdf',
    size: bytes.length,
    data: b64(bytes),
    createdAt: Date.now(),
  };
  await S.put('files', rec.id, rec);
  return rec.id;
}

export const getFile = (id) => (id ? S.get('files', id) : null);
export const removeFile = (id) => (id ? S.remove('files', id) : null);

export function fileBlob(f) {
  return new Blob([unb64(f.data)], { type: f.type });
}

// Apre il file in una nuova scheda (anteprima di Safari) o lo scarica.
export function openFile(f) {
  const url = URL.createObjectURL(fileBlob(f));
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  if (f.type === 'application/pdf') a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Chiede un file all'utente (foto, screenshot o PDF).
export function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf,.pdf';
    input.addEventListener('change', () => resolve(input.files[0] || null));
    input.click();
  });
}

// Esporta un file: su iPhone con il foglio di condivisione (Salva in File, Mail…),
// sul computer come download.
export async function exportFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}
