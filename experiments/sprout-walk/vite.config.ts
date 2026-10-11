import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
  build: { outDir: '../../.local/sprout-walk-dist', emptyOutDir: true },
});
