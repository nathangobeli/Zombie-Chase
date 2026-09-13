import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.fbx', '**/*.glb'],
  server: {
    host: true,
    port: 5173,
    open: false,
  },
});
