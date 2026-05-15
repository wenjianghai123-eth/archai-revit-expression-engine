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
            const normalizedId = id.replace(/\\/g, '/');
            if (!normalizedId.includes('node_modules')) return undefined;
            if (normalizedId.includes('@react-three/fiber')) return 'vendor-three-fiber';
            if (normalizedId.includes('@react-three/drei') || normalizedId.includes('three-stdlib')) return 'vendor-three-drei';
            if (normalizedId.includes('node_modules/three/')) {
              if (normalizedId.includes('/src/renderers/')) return 'vendor-three-renderers';
              if (normalizedId.includes('/src/loaders/') || normalizedId.includes('/examples/jsm/loaders/')) return 'vendor-three-loaders';
              if (normalizedId.includes('/src/geometries/')) return 'vendor-three-geometries';
              if (normalizedId.includes('/src/materials/') || normalizedId.includes('/src/textures/')) return 'vendor-three-materials';
              if (normalizedId.includes('/src/math/')) return 'vendor-three-math';
              return 'vendor-three-core';
            }
            if (normalizedId.includes('motion')) return 'vendor-motion';
            if (normalizedId.includes('@supabase')) return 'vendor-supabase';
            if (normalizedId.includes('react') || normalizedId.includes('scheduler')) return 'vendor-react';
            return 'vendor';
          },
        },
      },
    },
  };
});
