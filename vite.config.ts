import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            motion: ['framer-motion', 'motion', 'gsap'],
            icons: ['lucide-react'],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: true,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: { usePolling: true },
      // Allow the sandbox/dev-preview proxy host (and any custom domain) to reach
      // the Vite dev server. Without this, Vite 5+ rejects unrecognized Host
      // headers with a 403 "Blocked request" response before the app loads.
      allowedHosts: true,
    },
  };
});
