import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { proxyInstagramImage } from './server/imageProxy';

/** 내 컴퓨터에서 `npm run dev`로 실행할 때도 /api/image 가 동작하게 해 줘요. (Vercel에서는 api/image.ts가 대신 해요) */
function devImageProxy(): Plugin {
  return {
    name: 'dev-image-proxy',
    configureServer(server) {
      server.middlewares.use('/api/image', async (req, res) => {
        const out = await proxyInstagramImage(new URL(req.url ?? '', 'http://localhost').searchParams.get('url')).catch(() => ({
          status: 502,
          contentType: 'text/plain; charset=utf-8',
          body: '사진을 가져오는 중 오류가 났어요.',
        }));
        res.statusCode = out.status;
        res.setHeader('Content-Type', out.contentType);
        res.end(typeof out.body === 'string' ? out.body : new Uint8Array(out.body));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devImageProxy()],
  build: { chunkSizeWarningLimit: 1500 },
});
