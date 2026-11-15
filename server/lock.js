// One server per data folder: <root>/server.lock holds the PID of the server that owns it.
import fs from 'node:fs/promises';
import path from 'node:path';

export async function acquireLock(root, { reuseProcess = false } = {}) {
  await fs.mkdir(root, { recursive: true });
  const file = path.join(root, 'server.lock');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await fs.open(file, 'wx');
      await handle.writeFile(String(process.pid));
      await handle.close();
      return async () => {
        try { if ((await fs.readFile(file, 'utf8')) === String(process.pid)) await fs.unlink(file); } catch { /* already gone */ }
      };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const pid = Number(await fs.readFile(file, 'utf8').catch(() => NaN));
      if (!Number.isInteger(pid) || pid <= 0) throw Error(`Invalid ${file}; inspect it before removing it`);
      if (reuseProcess && pid === process.pid) return async () => {};
      try {
        process.kill(pid, 0); // throws ESRCH when that process is gone
      } catch (err) {
        if (err.code === 'ESRCH') { await fs.unlink(file); continue; }
        throw Error('Cannot check the server that holds the data folder');
      }
      throw Error(`The data folder is already served by PID ${pid}. Stop that server before starting another.`);
    }
  }
  throw Error('Cannot lock the data folder');
}
