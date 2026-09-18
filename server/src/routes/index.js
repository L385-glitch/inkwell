import folders from './folders.js';
import notebooks from './notebooks.js';
import pages from './pages.js';
import files from './files.js';
import search from './search.js';

export default async function registerRoutes(app) {
  app.get('/api/health', () => ({ ok: true }));
  await app.register(folders);
  await app.register(notebooks);
  await app.register(pages);
  await app.register(files);
  await app.register(search);
}
