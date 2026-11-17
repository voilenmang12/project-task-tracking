// The tracker's HTTP client, shared by the CLI (nhanh.mjs) and the MCP server (nhanh-mcp.mjs). No dependencies.
// NHANH_URL changes the server (default http://127.0.0.1:5173).
export const BASE = (process.env.NHANH_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');

export async function http(path, init) {
  let res;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    session = null;
    throw Error(`The tracker does not answer at ${BASE}. It is optional: carry on with the work and say so; do not start a second server.`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(Error(body.error || `HTTP ${res.status}`), { status: res.status });
  return body;
}

// The token of this tracker run, checked once per process: the MCP server lives for a whole session, so its calls do
// not ask for the health and the token each time. A restarted tracker answers 403 "Session expired": read them again.
let session = null;

function token() {
  session ??= (async () => {
    const health = await http('/api/health');
    if (health.service !== 'nhanh-local') throw Error(`${BASE} is not the tracker; no data was sent.`);
    return (await http('/api/session')).token;
  })().catch((e) => { session = null; throw e; });
  return session;
}

async function withToken(send) {
  try {
    return await send(await token());
  } catch (e) {
    if (e.status !== 403 || !/Session expired/.test(e.message)) throw e; // other 403s are refusals by an action
    session = null;
    return send(await token());
  }
}

export function call(name, args, { actor, requestId } = {}) {
  return withToken((t) => http('/api/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nhanh-Token': t },
    body: JSON.stringify({ name, arguments: args, actor, requestId }),
  }));
}

/** Every action with its description, arguments, JSON Schema and audience. */
export async function actions() {
  return (await withToken((t) => http('/api/actions', { headers: { 'X-Nhanh-Token': t } }))).actions;
}
