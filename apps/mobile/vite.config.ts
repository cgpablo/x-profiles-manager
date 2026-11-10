import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: './',
  // La UI vive en otro paquete del workspace: que React sea uno solo
  resolve: { dedupe: ['react', 'react-dom'] },
  build: {
    outDir: 'www',
    emptyOutDir: true,
    target: 'es2020',
  },
});
