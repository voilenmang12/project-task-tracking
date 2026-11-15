import { defineConfig } from 'vite';
import { createService } from './server/service.js';
import { acquireLock } from './server/lock.js';

// `npm run dev`: the same API as `npm start`, with hot reload for the UI.
const api = () => ({
  name: 'nhanh-api',
  async configureServer(server) {
    const service = createService({ root: process.env.NHANH_DATA_DIR || '.local' });
    await acquireLock(service.store.root, { reuseProcess: true });
    server.httpServer?.on('close', service.close);
    server.middlewares.use(service.handle);
  },
});

export default defineConfig({
  plugins: [api()],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    watch: { ignored: ['**/.local/**'] },
    fs: { deny: ['**/.local/**', '**/.env*', '**/.git/**'] },
  },
});
