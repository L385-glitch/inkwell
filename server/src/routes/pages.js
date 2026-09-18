import { db, renumberPages, pageToJson, pageSummaryToJson, indexPageText, deleteOrphanedPdfs } from '../db.js';

const BACKGROUNDS = ['blank', 'ruled', 'grid', 'dots', 'pdf'];

function getNotebookOr404(app, id, reply) {
  const nb = db.prepare('SELECT * FROM notebooks WHERE id = ?').get(id);
  if (!nb) {
    reply.code(404).send({ error: 'notebook not found' });
    return null;
  }
  return nb;
}

function touchNotebook(notebookId) {
  db.prepare(
    "UPDATE notebooks SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?"
  ).run(notebookId);
}

export default function pages(app) {
  app.get('/api/notebooks/:id/pages', (req, reply) => {
    if (!getNotebookOr404(app, req.params.id, reply)) return;
    const rows = db
      .prepare('SELECT * FROM pages WHERE notebook_id = ? ORDER BY idx, id')
      .all(req.params.id);
    return rows.map(pageSummaryToJson);
  });

  app.post('/api/notebooks/:id/pages', (req, reply) => {
    const nb = getNotebookOr404(app, req.params.id, reply);
    if (!nb) return;
    const { background = 'blank', pdfId, pdfPage, width, height, afterId } = req.body || {};
    if (!BACKGROUNDS.includes(background)) {
      return reply.code(400).send({ error: 'invalid background' });
    }
    let w = 794, h = 1123;
    if (background === 'pdf') {
      if (!pdfId) return reply.code(400).send({ error: 'pdfId required for pdf background' });
      if (width && height) { w = Number(width); h = Number(height); }
    } else if (width && height) {
      w = Number(width); h = Number(height);
    }
    let idx;
    if (afterId) {
      const after = db.prepare('SELECT idx FROM pages WHERE id = ? AND notebook_id = ?').get(afterId, nb.id);
      idx = after ? after.idx + 1 : null;
    }
    let info;
    if (idx === null || idx === undefined) {
      const maxIdx = db
        .prepare('SELECT COALESCE(MAX(idx), -1) AS m FROM pages WHERE notebook_id = ?')
        .get(nb.id).m;
      info = db
        .prepare('INSERT INTO pages (notebook_id, idx, background, pdf_id, pdf_page, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(nb.id, maxIdx + 1, background, pdfId ?? null, pdfPage ?? null, w, h);
    } else {
      db.prepare('UPDATE pages SET idx = idx + 1 WHERE notebook_id = ? AND idx >= ?').run(nb.id, idx);
      info = db
        .prepare('INSERT INTO pages (notebook_id, idx, background, pdf_id, pdf_page, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(nb.id, idx, background, pdfId ?? null, pdfPage ?? null, w, h);
    }
    touchNotebook(nb.id);
    return reply.code(201).send(pageSummaryToJson(db.prepare('SELECT * FROM pages WHERE id = ?').get(info.lastInsertRowid)));
  });

  app.get('/api/pages/:id', (req, reply) => {
    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
    if (!page) return reply.code(404).send({ error: 'page not found' });
    return pageToJson(page);
  });

  app.put('/api/pages/:id', (req, reply) => {
    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
    if (!page) return reply.code(404).send({ error: 'page not found' });
    const { background, width, height, content } = req.body || {};
    if (background !== undefined && !BACKGROUNDS.includes(background)) {
      return reply.code(400).send({ error: 'invalid background' });
    }
    if (background !== undefined || width !== undefined || height !== undefined) {
      db.prepare('UPDATE pages SET background = ?, width = ?, height = ? WHERE id = ?').run(
        background ?? page.background,
        width ?? page.width,
        height ?? page.height,
        page.id
      );
    }
    if (content !== undefined) {
      if (typeof content !== 'object' || content === null || !Array.isArray(content.strokes) || !Array.isArray(content.texts)) {
        return reply.code(400).send({ error: 'content must be {strokes:[], texts:[]}' });
      }
      db.prepare(
        "UPDATE pages SET content = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?"
      ).run(JSON.stringify(content), page.id);
      indexPageText(page.notebook_id, page.id, content);
    }
    touchNotebook(page.notebook_id);
    return pageToJson(db.prepare('SELECT * FROM pages WHERE id = ?').get(page.id));
  });

  app.post('/api/pages/:id/move', (req, reply) => {
    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
    if (!page) return reply.code(404).send({ error: 'page not found' });
    const dir = req.body?.dir === 'prev' ? -1 : 1;
    const sibling = db
      .prepare(
        `SELECT * FROM pages WHERE notebook_id = ? AND idx ${dir > 0 ? '>' : '<'} ?
         ORDER BY idx ${dir > 0 ? 'ASC' : 'DESC'} LIMIT 1`
      )
      .get(page.notebook_id, page.idx);
    if (sibling) {
      const myIdx = page.idx;
      db.prepare('UPDATE pages SET idx = ? WHERE id = ?').run(sibling.idx, page.id);
      db.prepare('UPDATE pages SET idx = ? WHERE id = ?').run(myIdx, sibling.id);
      touchNotebook(page.notebook_id);
    }
    const rows = db
      .prepare('SELECT * FROM pages WHERE notebook_id = ? ORDER BY idx, id')
      .all(page.notebook_id);
    return rows.map(pageSummaryToJson);
  });

  app.delete('/api/pages/:id', (req, reply) => {
    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
    if (!page) return reply.code(404).send({ error: 'page not found' });
    db.prepare('DELETE FROM search_index WHERE page_id = ?').run(page.id);
    db.prepare('DELETE FROM pages WHERE id = ?').run(page.id);
    renumberPages(page.notebook_id);
    deleteOrphanedPdfs();
    touchNotebook(page.notebook_id);
    const rows = db
      .prepare('SELECT * FROM pages WHERE notebook_id = ? ORDER BY idx, id')
      .all(page.notebook_id);
    return rows.map(pageSummaryToJson);
  });
}
