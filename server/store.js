// The workspace on disk: one JSON file, written atomically, one writer at a time.
//   <root>/workspace.json          the data (version 2)
//   <root>/workspace.backup.json   the state before the last write
//   <root>/workspace.v1.json       the untouched file of tracker v1, kept after the migration
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyWorkspace, validateWorkspace } from '../shared/model.js';
import { migrateV1 } from './migrate.js';

async function atomicWrite(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, text, 'utf8');
  await fs.rename(temp, file);
}

export function createStore(root) {
  const file = path.join(root, 'workspace.json');
  let cache = null;
  let queue = Promise.resolve();

  async function load() {
    if (cache) return cache;
    let raw;
    try {
      raw = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return (cache = emptyWorkspace());
      throw Error(`Cannot read ${file}: ${e.message}. Nothing was overwritten; restore workspace.backup.json if needed.`);
    }
    if (raw.version === 2) return (cache = validateWorkspace(raw));
    // Tracker v1 wrote {revision, data: {version: 1, ...}}. Keep that file and convert it once.
    if (raw.data?.version === 1) {
      const kept = path.join(root, 'workspace.v1.json');
      try { await fs.access(kept); } catch { await fs.copyFile(file, kept); }
      cache = validateWorkspace(migrateV1(raw.data));
      await atomicWrite(file, JSON.stringify(cache, null, 2));
      return cache;
    }
    throw Error(`${file} is not a tracker workspace (version ${raw.version ?? raw.data?.version}).`);
  }

  /** A deep copy for readers; they cannot corrupt the cache. */
  const read = async () => structuredClone(await load());

  /**
   * Run `change(draft)` on a copy and save it when it reports a change. Changes run one after the other, so two
   * agents writing at once never lose each other's work.
   */
  function transact(change) {
    const run = queue.catch(() => {}).then(async () => {
      const current = await load();
      const draft = structuredClone(current);
      const { result, changed } = await change(draft);
      if (!changed) return { result, changed: false, seq: current.seq };
      validateWorkspace(draft);
      await atomicWrite(path.join(root, 'workspace.backup.json'), JSON.stringify(current, null, 2));
      await atomicWrite(file, JSON.stringify(draft, null, 2));
      cache = draft;
      return { result, changed: true, seq: draft.seq };
    });
    queue = run;
    return run;
  }

  return { root, read, transact };
}
