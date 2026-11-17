import { defineConfig } from 'vite';

// base: './' damit `npm run build` eine statische Seite erzeugt,
// die auch aus einem Unterordner oder per file-Server läuft.
export default defineConfig({
  base: './',
  server: { open: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
