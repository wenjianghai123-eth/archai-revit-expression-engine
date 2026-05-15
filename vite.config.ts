import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify; file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:8787',
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@react-three/fiber')) return 'vendor-three-fiber';
            if (id.includes('@react-three/drei') || id.includes('three-stdlib')) return 'vendor-three-drei';
            if (id.includes('node_modules/three/')) return 'vendor-three';
            if (id.includes('motion')) return 'vendor-motion';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
            return 'vendor';
          },
        },
      },
    },
  };
});
