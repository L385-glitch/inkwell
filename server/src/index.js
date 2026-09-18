import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import registerRoutes from './routes/index.js';

const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || '0.0.0.0';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
});
app.setErrorHandler((err, req, reply) => {
  req.log.error(err);
  reply.code(err.statusCode || 500).send({ error: err.message || 'Server error' });
});

await app.register(fastifyMultipart, { limits: { fileSize: 100 * 1024 * 1024 } });
await app.register(registerRoutes);

// Serve the built frontend if present (Docker / local prod); in dev Vite serves it
const PUBLIC_DIR = process.env.PUBLIC_DIR
  ? path.resolve(process.env.PUBLIC_DIR)
  : fileURLToPath(new URL('../../client/dist/', import.meta.url));

const hasClient = fs.existsSync(path.join(PUBLIC_DIR, 'index.html'));
if (hasClient) {
  // Hashed assets are content-addressed → cache forever. index.html is served
  // separately (below) with no-cache so a new deploy is always picked up.
  await app.register(fastifyStatic, {
    root: PUBLIC_DIR,
    index: false,
    cacheControl: true,
    maxAge: '365d',
    immutable: true,
  });
  const sendIndex = (reply) =>
    reply
      .type('text/html')
      .header('Cache-Control', 'no-cache')
      .send(fs.readFileSync(path.join(PUBLIC_DIR, 'index.html')));
  app.get('/', (req, reply) => sendIndex(reply));
  app.setNotFoundHandler((req, reply) => {
    if (req.url.split('?')[0].startsWith('/api/')) {
      return reply.code(404).send({ error: 'not found' });
    }
    return sendIndex(reply);
  });
} else {
  app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: 'not found' }));
  console.log('[server] client build not found — serve it via Vite dev (npm run dev:client)');
}

await app.listen({ port: PORT, host: HOST });
