import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { GET } from './api/image.js';
import { fileURLToPath } from 'node:url';

// Resolve paths from this file, even when Vite is started from another folder.
const appRoot = fileURLToPath(new URL('.', import.meta.url));

/** 내 컴퓨터에서 `npm run dev`로 실행할 때도 /api/image 가 동작하게 해 줘요. (Vercel에서는 api/image.ts가 대신 해요) */
function devImageProxy(): Plugin {
  return {
    name: 'dev-image-proxy',
    configureServer(server) {
      server.middlewares.use('/api/image', async (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
        const out = await GET(new Request('http://localhost/api/image' + (req.url ?? ''), {
          headers: { authorization: req.headers.authorization ?? '' },
        }));
        res.statusCode = out.status;
        out.headers.forEach((value, key) => res.setHeader(key,value));
        res.end(new Uint8Array(await out.arrayBuffer()));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, appRoot, ''));
  return {
  root: appRoot,
  envDir: appRoot,
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  plugins: [react(), tailwindcss(), devImageProxy()],
  build: { chunkSizeWarningLimit: 700 },
  };
});
