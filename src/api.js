// The web UI's link to the server: the same actions the agents use, as the actor "human".
import { HUMAN } from '../shared/model.js';

let token = null;

async function session() {
  if (!token) token = (await (await fetch('/api/session')).json()).token;
  return token;
}

export async function call(name, args = {}) {
  const send = async () =>
    fetch('/api/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Nhanh-Token': await session() },
      body: JSON.stringify({ name, arguments: args, actor: HUMAN }),
    });
  let res = await send();
  if (res.status === 403) { token = null; res = await send(); } // the server restarted: take a new token once
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Error(body.error || `HTTP ${res.status}`);
  return body.result;
}

/** Calls `onChange` after every write by anyone (an agent, another tab). Returns a function that stops it. */
export function subscribe(onChange, onStatus) {
  let source;
  let stopped = false;
  let retry;
  const open = async () => {
    try {
      source = new EventSource(`/api/stream?token=${await session()}`);
      source.addEventListener('hello', () => { onStatus(true); onChange(); });
      source.addEventListener('change', onChange);
      source.onerror = () => {
        onStatus(false);
        source.close();
        token = null;
        if (!stopped) retry = setTimeout(open, 2000);
      };
    } catch {
      onStatus(false);
      if (!stopped) retry = setTimeout(open, 2000);
    }
  };
  open();
  return () => { stopped = true; clearTimeout(retry); source?.close(); };
}
