import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createAnalyzeMiddleware } from './server/deepseekProxy.js';

// The DeepSeek proxy runs as middleware inside the Vite server (both `npm run dev`
// and `npm start`). DEEPSEEK_API_KEY is read here, on the server, and is never
// exposed to browser code: Vite only exposes variables prefixed with VITE_.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const getApiKey = () => env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  const apiPlugin = {
    name: 'rodeoai-deepseek-proxy',
    configureServer(server) {
      server.middlewares.use(createAnalyzeMiddleware(getApiKey));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createAnalyzeMiddleware(getApiKey));
    },
  };
  return {
    plugins: [react(), apiPlugin],
    server: { host: true },
    preview: { host: true },
    test: { environment: 'node' },
  };
});
