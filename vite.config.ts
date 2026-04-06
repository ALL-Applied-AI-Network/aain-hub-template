import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('hub.config.json', 'utf-8'));

export default defineConfig({
  root: '.',
  base: './',
  define: {
    __HUB_CONFIG__: JSON.stringify(config),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
