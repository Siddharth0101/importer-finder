import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    // The React dev server forwards API calls to the Express server.
    proxy: { '/api': `http://localhost:${process.env.API_PORT || 3001}` },
  },
});
