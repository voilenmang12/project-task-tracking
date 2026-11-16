// `npm start`: the API and the built web UI on http://127.0.0.1:5173 (PORT changes the port, NHANH_DATA_DIR the
// data folder; default .local/ in this repo). One server per data folder.
// Agent runs (server/runner.js) start `claude` (NHANH_CLAUDE: another command, as a JSON list) in the project's repo
// folder, which is relative to NHANH_WORKSPACE (default: the folder that holds this repository).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from './service.js';
import { acquireLock } from './lock.js';
import { createRunner } from './runner.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(process.env.NHANH_DATA_DIR || path.join(repo, '.local'));
const port = Number(process.env.PORT || 5173);
const dist = path.join(repo, 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const release = await acquireLock(root);
const service = createService({ root });
await service.store.read(); // fail now, not on the first request, when the data cannot be read
const runner = createRunner({
  service,
  root,
  port,
  workspaceDir: path.resolve(process.env.NHANH_WORKSPACE || path.join(repo, '..')),
  command: process.env.NHANH_CLAUDE ? JSON.parse(process.env.NHANH_CLAUDE) : ['claude'],
});
service.setRunner(runner);

const server = http.createServer((req, res) => service.handle(req, res, async () => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.split('/').some((part) => part.startsWith('.'))) { res.writeHead(403); return res.end(); }
    // The UI is a single page: any path that is not a built file gets index.html.
    let file = path.resolve(dist, `.${pathname}`);
    if (!file.startsWith(dist + path.sep) || !path.extname(file)) file = path.join(dist, 'index.html');
    const content = await fs.readFile(file);
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    res.writeHead(404);
    return res.end('The API is running. Build the web UI with: npm run build');
  }
}));

server.on('error', async (e) => { await release(); console.error(e.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  console.log(`Tracker API + UI: http://127.0.0.1:${port}  (data: ${root})`);
  runner.recover(); // runs left from before a restart; queued ones start now
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { service.close(); server.close(async () => { await release(); process.exit(0); }); });
}
