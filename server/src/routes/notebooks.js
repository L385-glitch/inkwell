import { db, notebookToJson, setNotebookTags, deleteOrphanedPdfs } from '../db.js';

const DEFAULT_COLORS = ['#4f7cff', '#e05d5d', '#e0a13c', '#5cb85c', '#9b59b6', '#16a2b8'];

export default function notebooks(app) {
  app.get('/api/notebooks', (req, reply) => {
    const rows = db.prepare('SELECT * FROM notebooks ORDER BY updated_at DESC').all();
    return rows.map(notebookToJson);
  });

  app.post('/api/notebooks', (req, reply) => {
    const { title, folderId, color, background = 'blank' } = req.body || {};
    if (!title || !String(title).trim()) {
      return reply.code(400).send({ error: 'title is required' });
    }
    const info = db
      .prepare('INSERT INTO notebooks (title, folder_id, color) VALUES (?, ?, ?)')
      .run(String(title).trim(), folderId ?? null, color || DEFAULT_COLORS[0]);
    const id = info.lastInsertRowid;
    db.prepare(
      `INSERT INTO pages (notebook_id, idx, background) VALUES (?, 0, ?)`
    ).run(id, background);
    db.prepare('UPDATE notebooks SET updated_at = strftime(\'%Y-%m-%dT%H:%M:%SZ\', \'now\') WHERE id = ?').run(id);
    return reply.code(201).send(notebookToJson(db.prepare('SELECT * FROM notebooks WHERE id = ?').get(id)));
  });

  app.patch('/api/notebooks/:id', (req, reply) => {
    const nb = db.prepare('SELECT * FROM notebooks WHERE id = ?').get(req.params.id);
    if (!nb) return reply.code(404).send({ error: 'notebook not found' });
    const { title, folderId, color, tags } = req.body || {};
    if (title !== undefined) {
      if (!String(title).trim()) return reply.code(400).send({ error: 'invalid title' });
      db.prepare('UPDATE notebooks SET title = ? WHERE id = ?').run(String(title).trim(), nb.id);
    }
    if (folderId !== undefined) {
      if (folderId !== null && !db.prepare('SELECT 1 FROM folders WHERE id = ?').get(folderId)) {
        return reply.code(400).send({ error: 'folder not found' });
      }
      db.prepare('UPDATE notebooks SET folder_id = ? WHERE id = ?').run(folderId ?? null, nb.id);
    }
    if (color !== undefined) db.prepare('UPDATE notebooks SET color = ? WHERE id = ?').run(color, nb.id);
    if (tags !== undefined) setNotebookTags(nb.id, Array.isArray(tags) ? tags : []);
    db.prepare('UPDATE notebooks SET updated_at = strftime(\'%Y-%m-%dT%H:%M:%SZ\', \'now\') WHERE id = ?').run(nb.id);
    return notebookToJson(db.prepare('SELECT * FROM notebooks WHERE id = ?').get(nb.id));
  });

  app.delete('/api/notebooks/:id', (req, reply) => {
    const nb = db.prepare('SELECT * FROM notebooks WHERE id = ?').get(req.params.id);
    if (!nb) return reply.code(404).send({ error: 'notebook not found' });
    db.prepare('DELETE FROM notebooks WHERE id = ?').run(nb.id);
    deleteOrphanedPdfs();
    return { ok: true };
  });

  app.get('/api/tags', (req, reply) => {
    const rows = db
      .prepare(
        `SELECT t.id, t.name, COUNT(nt.notebook_id) AS count
         FROM tags t LEFT JOIN notebook_tags nt ON nt.tag_id = t.id
         GROUP BY t.id ORDER BY t.name`
      )
      .all();
    return rows;
  });
}
