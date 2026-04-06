import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(resolve(__dirname, 'hub.config.json'), 'utf-8'));

export default defineConfig({
  root: __dirname,
  base: './',
  define: {
    __HUB_CONFIG__: JSON.stringify(config),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        article: resolve(__dirname, 'article.html'),
      },
    },
  },
});
