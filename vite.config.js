import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  assetsInclude: ['**/*.fbx', '**/*.glb'],
  server: {
    host: true,
    port: 5173,
    open: false,
  },
});
