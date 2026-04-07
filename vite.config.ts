import { defineConfig } from 'vite';
import { readFileSync, existsSync, cpSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(resolve(__dirname, 'hub.config.json'), 'utf-8'));

// Plugin to copy the local/ content folder into dist/ at build time
function copyLocalContent() {
  return {
    name: 'copy-local-content',
    closeBundle() {
      const localDir = resolve(__dirname, 'local');
      const outDir = resolve(__dirname, 'dist', 'local');
      if (existsSync(localDir)) {
        cpSync(localDir, outDir, { recursive: true });
      }
    },
  };
}

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
  plugins: [copyLocalContent()],
});
