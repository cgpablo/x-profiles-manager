import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    // La app de escritorio carga el renderer desde su propio dist
    outDir: '../../apps/desktop/dist/renderer',
    emptyOutDir: true,
  },
});
