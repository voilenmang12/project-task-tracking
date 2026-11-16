// The HTTP API. Loopback only. Three things:
//   GET  /api/health            is it the tracker? (no token)
//   GET  /api/session           a token for this server run; every other call sends it as X-Nhanh-Token
//   GET  /api/actions           the list of actions with their arguments
//   POST /api/call              {name, arguments, actor, requestId} → {seq, result}
//   GET  /api/stream?token=…    server-sent events: one "change" per write, so the UI refreshes at once
//   GET  /api/run-log?id=&from= what an agent run printed since byte "from" (server/runner.js)
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createStore } from './store.js';
import { definitions, runAction } from './actions.js';

const MAX_BODY = 2 * 1024 * 1024;

export function createService({ root = path.resolve('.local') } = {}) {
  const store = createStore(root);
  const token = randomUUID();
  const streams = new Set();
  let runner = null; // set by server/index.js; tests may run without one

  async function call(name, args, options = {}) {
    const outcome = await store.transact((draft) => runAction(draft, name, args, options));
    if (outcome.changed) for (const res of streams) res.write(`event: change\ndata: ${outcome.seq}\n\n`);
    if (outcome.changed && runner && (name === 'run.start' || name === 'run.stop' || name === 'work.stop')) runner.kick();
    return { seq: outcome.seq, result: outcome.result };
  }

  async function handle(req, res, next = () => { res.statusCode = 404; res.end('Not found'); }) {
    if (!req.url?.startsWith('/api/')) return next();
    const send = (status, value) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(value));
    };
    try {
      // Only this machine, and only pages served by this server, may talk to the API.
      const host = req.headers.host || '';
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return send(403, { error: 'Loopback only.' });
      if (req.headers.origin && req.headers.origin !== `http://${host}`) return send(403, { error: 'Origin not allowed.' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Cross-site request denied.' });

      const url = new URL(req.url, `http://${host}`);
      if (req.method === 'GET' && url.pathname === '/api/health') return send(200, { ok: true, service: 'nhanh-local', apiVersion: 2 });
      if (req.method === 'GET' && url.pathname === '/api/session') return send(200, { token });

      if (req.method === 'GET' && url.pathname === '/api/stream') {
        if (url.searchParams.get('token') !== token) return send(403, { error: 'Session expired. Reload.' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write('event: hello\ndata: 0\n\n');
        streams.add(res);
        req.on('close', () => streams.delete(res));
        return undefined;
      }

      if (req.headers['x-nhanh-token'] !== token) return send(403, { error: 'Session expired. Read /api/session again.' });
      if (req.method === 'GET' && url.pathname === '/api/actions') return send(200, { actions: definitions });
      if (req.method === 'GET' && url.pathname === '/api/run-log') {
        if (!runner) return send(404, { error: 'No run supervisor in this server.' });
        return send(200, runner.readLog(url.searchParams.get('id') || '', Number(url.searchParams.get('from')) || 0));
      }
      if (req.method === 'POST' && url.pathname === '/api/call') {
        if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Send JSON.' });
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BODY) return send(413, { error: 'Request larger than 2 MB.' });
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        return send(200, await call(body.name, body.arguments ?? {}, { actor: body.actor, requestId: body.requestId }));
      }
      return send(404, { error: 'No such endpoint.' });
    } catch (e) {
      return send(e.status || (e instanceof SyntaxError ? 400 : 500), { error: e.message, ...(e.details || {}) });
    }
  }

  const close = () => { for (const res of streams) res.end(); streams.clear(); };
  const setRunner = (r) => { runner = r; };
  return { handle, call, close, store, token, setRunner };
}
