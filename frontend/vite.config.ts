import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    // Only active for `ANALYZE=true npm run build` — writes a treemap of
    // the production bundle instead of running on every normal build.
    ...(process.env.ANALYZE === 'true'
      ? [visualizer({ filename: 'dist/bundle-stats.html', gzipSize: true, brotliSize: true })]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // fallow-ignore-next-line complexity
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'vendor-recharts';
            if (id.includes('date-fns')) return 'vendor-date-fns';
            if (id.includes('framer-motion')) return 'vendor-framer';
            if (id.includes('lucide-react')) return 'vendor-lucide';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/e2e/**', 'node_modules/**', 'dist/**'],
    // `npm test -- --coverage` (CI) reads this block. The `json` reporter must stay:
    // the CI fallow step consumes coverage/coverage-final.json.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'src/test/**',
        'src/setupTests.ts',
        '**/*.test.{ts,tsx}',
        '**/*.config.{ts,js}',
      ],
    },
  },
})
