import { db, notebookToJson } from '../db.js';

export default function folders(app) {
  app.get('/api/folders', (req, reply) => {
    const rows = db
      .prepare('SELECT id, name, parent_id AS parentId, sort FROM folders ORDER BY sort, name')
      .all();
    return rows;
  });

  app.post('/api/folders', (req, reply) => {
    const { name, parentId } = req.body || {};
    if (!name || !String(name).trim()) {
      return reply.code(400).send({ error: 'name is required' });
    }
    const maxSort = db
      .prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM folders WHERE parent_id IS ?')
      .get(parentId ?? null).m;
    const info = db
      .prepare('INSERT INTO folders (name, parent_id, sort) VALUES (?, ?, ?)')
      .run(String(name).trim(), parentId ?? null, maxSort + 1);
    const row = db.prepare('SELECT * FROM folders WHERE id = ?').get(info.lastInsertRowid);
    return reply.code(201).send({
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      sort: row.sort,
    });
  });

  app.patch('/api/folders/:id', (req, reply) => {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id);
    if (!folder) return reply.code(404).send({ error: 'folder not found' });
    const { name, parentId } = req.body || {};
    if (name !== undefined) {
      if (!String(name).trim()) return reply.code(400).send({ error: 'invalid name' });
      db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(String(name).trim(), folder.id);
    }
    if (parentId !== undefined) {
      if (parentId !== null && !db.prepare('SELECT 1 FROM folders WHERE id = ?').get(parentId)) {
        return reply.code(400).send({ error: 'parent folder not found' });
      }
      db.prepare('UPDATE folders SET parent_id = ? WHERE id = ?').run(parentId ?? null, folder.id);
    }
    const row = db.prepare('SELECT * FROM folders WHERE id = ?').get(folder.id);
    return { id: row.id, name: row.name, parentId: row.parent_id, sort: row.sort };
  });

  app.delete('/api/folders/:id', (req, reply) => {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id);
    if (!folder) return reply.code(404).send({ error: 'folder not found' });
    // notebooks inside move to root (FK ON DELETE SET NULL); subfolders become root folders
    db.prepare('UPDATE folders SET parent_id = NULL WHERE parent_id = ?').run(folder.id);
    db.prepare('DELETE FROM folders WHERE id = ?').run(folder.id);
    return { ok: true };
  });
}
