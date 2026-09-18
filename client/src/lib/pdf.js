import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const docCache = new Map(); // pdfId -> { pdf, pages: Map(key -> canvas) }

export async function getPdfDoc(pdfId) {
  const cached = docCache.get(pdfId);
  if (cached) return cached.pdf;
  const res = await fetch(`/api/pdfs/${pdfId}/file`);
  if (!res.ok) throw new Error(`failed to load pdf (${res.status})`);
  const data = new Uint8Array(await res.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  docCache.set(pdfId, { pdf, pages: new Map() });
  return pdf;
}

// Page size in page-coordinate units (96 dpi)
export async function getPageSize(pdfId, pageNum) {
  const pdf = await getPdfDoc(pdfId);
  const page = await pdf.getPage(pageNum);
  const vp = page.getViewport({ scale: 96 / 72 });
  return { w: vp.width, h: vp.height };
}

export async function getPageCount(pdfId) {
  const pdf = await getPdfDoc(pdfId);
  return pdf.numPages;
}

// Render a PDF page to an offscreen canvas. `res` = canvas pixels per page-coordinate unit.
export async function renderPdfPage(pdfId, pageNum, res = 2) {
  const entry = docCache.get(pdfId);
  const key = `${pageNum}:${res}`;
  if (entry?.pages.has(key)) return entry.pages.get(key);
  const pdf = await getPdfDoc(pdfId);
  const page = await pdf.getPage(pageNum);
  const vp = page.getViewport({ scale: res * (96 / 72) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  if (entry) entry.pages.set(key, canvas);
  return canvas;
}
