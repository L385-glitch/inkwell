import { db } from '../db.js';

export default function search(app) {
  app.get('/api/search', (req, reply) => {
    const q = String(req.query.q || '').trim();
    if (!q) return [];
    const results = [];

    // notebook titles
    const like = db
      .prepare('SELECT id, title FROM notebooks WHERE title LIKE ? LIMIT 20')
      .all(`%${q}%`);
    for (const row of like) {
      results.push({ notebookId: row.id, pageId: null, kind: 'title', snippet: row.title });
    }

    // full-text over typed text on pages
    try {
      const safe = q.replace(/["']/g, ' ').trim();
      if (safe) {
        const rows = db
          .prepare(
            `SELECT notebook_id AS notebookId, page_id AS pageId, kind,
                    snippet(search_index, -1, '«', '»', ' … ', 12) AS snippet
             FROM search_index WHERE search_index MATCH ? ORDER BY rank LIMIT 50`
          )
          .all(`"${safe}"`);
        for (const row of rows) results.push(row);
      }
    } catch {
      // FTS query syntax edge cases — fall back to LIKE over the index
      const rows = db
        .prepare(
          `SELECT notebook_id AS notebookId, page_id AS pageId, kind, body AS snippet
           FROM search_index WHERE body LIKE ? LIMIT 50`
        )
        .all(`%${q}%`);
      for (const row of rows) {
        const s = row.snippet.length > 120 ? row.snippet.slice(0, 120) + '…' : row.snippet;
        results.push({ ...row, snippet: s });
      }
    }
    return results;
  });
}
