import { db, PDF_DIR, deleteOrphanedPdfs } from '../db.js';
import fs from 'node:fs';
import path from 'node:path';

export default function files(app) {
  app.post('/api/upload/pdf', async (req, reply) => {
    const file = await req.file({
      limits: { fileSize: 100 * 1024 * 1024 },
    });
    if (!file) return reply.code(400).send({ error: 'no file uploaded' });
    const name = file.filename || 'document.pdf';
    const info = db
      .prepare('INSERT INTO pdfs (name, path, size) VALUES (?, ?, ?)')
      .run(name, '', 0);
    const dest = path.join(PDF_DIR, `${info.lastInsertRowid}.pdf`);
    const buf = await file.toBuffer();
    fs.writeFileSync(dest, buf);
    db.prepare('UPDATE pdfs SET path = ?, size = ? WHERE id = ?').run(dest, buf.length, info.lastInsertRowid);
    return reply.code(201).send({ id: info.lastInsertRowid, name, size: buf.length });
  });

  app.get('/api/pdfs/:id/file', (req, reply) => {
    const pdf = db.prepare('SELECT * FROM pdfs WHERE id = ?').get(req.params.id);
    if (!pdf || !fs.existsSync(pdf.path)) {
      return reply.code(404).send({ error: 'pdf not found' });
    }
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="${pdf.name}"`);
    return reply.send(fs.createReadStream(pdf.path));
  });

  app.delete('/api/pdfs/:id', (req, reply) => {
    const pdf = db.prepare('SELECT * FROM pdfs WHERE id = ?').get(req.params.id);
    if (!pdf) return reply.code(404).send({ error: 'pdf not found' });
    db.prepare('DELETE FROM pdfs WHERE id = ?').run(pdf.id);
    if (fs.existsSync(pdf.path)) fs.unlinkSync(pdf.path);
    deleteOrphanedPdfs();
    return { ok: true };
  });
}
