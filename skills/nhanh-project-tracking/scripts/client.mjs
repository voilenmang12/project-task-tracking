// The tracker's HTTP client, shared by the CLI (nhanh.mjs) and the MCP server (nhanh-mcp.mjs). No dependencies.
// NHANH_URL changes the server (default http://127.0.0.1:5173).
export const BASE = (process.env.NHANH_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');

export async function http(path, init) {
  let res;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    throw Error(`The tracker does not answer at ${BASE}. It is optional: carry on with the work and say so; do not start a second server.`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Error(body.error || `HTTP ${res.status}`);
  return body;
}

export async function call(name, args, { actor, requestId } = {}) {
  const health = await http('/api/health');
  if (health.service !== 'nhanh-local') throw Error(`${BASE} is not the tracker; no data was sent.`);
  const { token } = await http('/api/session');
  return http('/api/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nhanh-Token': token },
    body: JSON.stringify({ name, arguments: args, actor, requestId }),
  });
}

/** Every action with its description, arguments, JSON Schema and audience. */
export async function actions() {
  const { token } = await http('/api/session');
  return (await http('/api/actions', { headers: { 'X-Nhanh-Token': token } })).actions;
}
