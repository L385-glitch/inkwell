import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'pdfs'), { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  parent_id  INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS notebooks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  folder_id  INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  color      TEXT NOT NULL DEFAULT '#4f7cff',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS notebook_tags (
  notebook_id INTEGER NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (notebook_id, tag_id)
);

CREATE TABLE IF NOT EXISTS pdfs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  path       TEXT NOT NULL,
  size       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS pages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  notebook_id INTEGER NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  idx         INTEGER NOT NULL,
  background  TEXT NOT NULL DEFAULT 'blank',
  pdf_id      INTEGER REFERENCES pdfs(id) ON DELETE SET NULL,
  pdf_page    INTEGER,
  width       REAL NOT NULL DEFAULT 794,
  height      REAL NOT NULL DEFAULT 1123,
  content     TEXT NOT NULL DEFAULT '{"strokes":[],"texts":[]}',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_pages_notebook ON pages(notebook_id, idx);

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  notebook_id UNINDEXED,
  page_id     UNINDEXED,
  kind        UNINDEXED,
  body,
  tokenize='porter unicode61'
);
`);

export const PDF_DIR = path.join(DATA_DIR, 'pdfs');

export function deleteOrphanedPdfs() {
  const orphans = db
    .prepare(
      'SELECT id, path FROM pdfs WHERE id NOT IN (SELECT DISTINCT pdf_id FROM pages WHERE pdf_id IS NOT NULL)'
    )
    .all();
  for (const o of orphans) {
    db.prepare('DELETE FROM pdfs WHERE id = ?').run(o.id);
    if (o.path && fs.existsSync(o.path)) fs.unlinkSync(o.path);
  }
  return orphans.length;
}

export function renumberPages(notebookId) {
  const pages = db
    .prepare('SELECT id FROM pages WHERE notebook_id = ? ORDER BY idx, id')
    .all(notebookId);
  const upd = db.prepare('UPDATE pages SET idx = ? WHERE id = ?');
  pages.forEach((p, i) => upd.run(i, p.id));
}

export function pageToJson(row) {
  return {
    id: row.id,
    notebookId: row.notebook_id,
    idx: row.idx,
    background: row.background,
    pdfId: row.pdf_id,
    pdfPage: row.pdf_page,
    width: row.width,
    height: row.height,
    content: JSON.parse(row.content || '{"strokes":[],"texts":[]}'),
    updatedAt: row.updated_at,
  };
}

export function pageSummaryToJson(row) {
  return {
    id: row.id,
    notebookId: row.notebook_id,
    idx: row.idx,
    background: row.background,
    pdfId: row.pdf_id,
    pdfPage: row.pdf_page,
    width: row.width,
    height: row.height,
    updatedAt: row.updated_at,
  };
}

export function notebookToJson(row) {
  const tags = db
    .prepare(
      `SELECT t.name FROM tags t
       JOIN notebook_tags nt ON nt.tag_id = t.id
       WHERE nt.notebook_id = ? ORDER BY t.name`
    )
    .all(row.id)
    .map((t) => t.name);
  const pageCount = db
    .prepare('SELECT COUNT(*) AS c FROM pages WHERE notebook_id = ?')
    .get(row.id).c;
  const first = db
    .prepare('SELECT background, pdf_id, pdf_page FROM pages WHERE notebook_id = ? ORDER BY idx, id LIMIT 1')
    .get(row.id);
  return {
    id: row.id,
    title: row.title,
    folderId: row.folder_id,
    color: row.color,
    tags,
    pageCount,
    firstBackground: first ? first.background : 'blank',
    firstPdfId: first && first.pdf_id != null ? first.pdf_id : null,
    firstPdfPage: first && first.pdf_page != null ? first.pdf_page : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function setNotebookTags(notebookId, names) {
  db.prepare('DELETE FROM notebook_tags WHERE notebook_id = ?').run(notebookId);
  const insTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const insRel = db.prepare(
    'INSERT OR IGNORE INTO notebook_tags (notebook_id, tag_id) VALUES (?, ?)'
  );
  for (const raw of names) {
    const name = String(raw).trim().toLowerCase();
    if (!name) continue;
    insTag.run(name);
    const tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(name);
    insRel.run(notebookId, tag.id);
  }
}

export function indexPageText(notebookId, pageId, content) {
  db.prepare('DELETE FROM search_index WHERE page_id = ?').run(pageId);
  const ins = db.prepare(
    'INSERT INTO search_index (notebook_id, page_id, kind, body) VALUES (?, ?, ?, ?)'
  );
  for (const t of content.texts || []) {
    const body = String(t.text || '').trim();
    if (body) ins.run(notebookId, pageId, 'text', body);
  }
}
