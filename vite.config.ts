import { defineConfig } from 'vite';

// Relative asset paths, so the built game works from any sub-path (such as GitHub Pages).
export default defineConfig({
  base: './',
});
