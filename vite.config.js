import { defineConfig } from 'vite';

// ExoSwarm Salvage is a zero-dependency static game (index.html + main.js + style.css).
// Vite gives us a fast dev server with live reload and a minified production build.
export default defineConfig({
  base: './',
  server: {
    open: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
