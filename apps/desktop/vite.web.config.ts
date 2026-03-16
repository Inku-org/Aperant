import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'src/web'),
  define: {
    'process.env.BUILD_TARGET': JSON.stringify('web'),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    // Match Sentry defines from electron.vite.config.ts renderer section
    '__SENTRY_DSN__': JSON.stringify(process.env.SENTRY_DSN || ''),
    '__SENTRY_TRACES_SAMPLE_RATE__': JSON.stringify(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    '__SENTRY_PROFILES_SAMPLE_RATE__': JSON.stringify(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
  },
  resolve: {
    alias: {
      // Match aliases from electron.vite.config.ts renderer section
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@features': path.resolve(__dirname, 'src/renderer/features'),
      '@components': path.resolve(__dirname, 'src/renderer/shared/components'),
      '@hooks': path.resolve(__dirname, 'src/renderer/shared/hooks'),
      '@lib': path.resolve(__dirname, 'src/renderer/shared/lib'),
      // Stub out electron imports in renderer/preload code
      'electron': path.resolve(__dirname, 'src/web/electron-stub.ts'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
