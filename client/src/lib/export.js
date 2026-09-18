import { PDFDocument } from 'pdf-lib';
import { drawBackground, drawStroke, drawTextItem } from './engine/ink.js';
import { renderPdfPage } from './pdf.js';
import { api } from './api.js';

const RES = 2;

async function renderPageToCanvas(page) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(page.width * RES));
  canvas.height = Math.max(1, Math.round(page.height * RES));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  if (page.background === 'pdf' && page.pdfId != null) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, page.width, page.height);
    const c = await renderPdfPage(page.pdfId, (page.pdfPage ?? 0) + 1, RES);
    ctx.drawImage(c, 0, 0, page.width, page.height);
  } else {
    drawBackground(ctx, page.background, page.width, page.height);
  }
  for (const s of page.content?.strokes ?? []) drawStroke(ctx, s);
  for (const t of page.content?.texts ?? []) drawTextItem(ctx, t);
  return canvas;
}

export async function exportNotebookPdf(notebook) {
  const summaries = await api.listPages(notebook.id);
  const doc = await PDFDocument.create();
  for (const summary of summaries) {
    const full = await api.getPage(summary.id);
    const canvas = await renderPageToCanvas(full);
    const png = canvas.toDataURL('image/png');
    const img = await doc.embedPng(png);
    const p = doc.addPage([full.width, full.height]);
    p.drawImage(img, { x: 0, y: 0, width: full.width, height: full.height });
  }
  const bytes = await doc.save();
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), slug(notebook.title) + '.pdf');
}

export async function exportPagePdf(notebook, pageId) {
  const full = await api.getPage(pageId);
  const canvas = await renderPageToCanvas(full);
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(canvas.toDataURL('image/png'));
  const p = doc.addPage([full.width, full.height]);
  p.drawImage(img, { x: 0, y: 0, width: full.width, height: full.height });
  const bytes = await doc.save();
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), slug(notebook.title) + '-page' + (full.idx + 1) + '.pdf');
}

function slug(s) {
  return (s || 'notebook').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'notebook';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
