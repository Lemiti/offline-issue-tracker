import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false,
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // NEVER cache or intercept API calls: requests to the backend (/reports, /health)
            // must go straight to the network so the sync engine sees real failures.
            urlPattern: ({ url }) => {
              return (
                url.pathname.startsWith('/reports') ||
                url.pathname.startsWith('/health') ||
                url.port === '8000'
              );
            },
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'Offline Field Issue Tracker',
        short_name: 'IssueTracker',
        description: 'Offline-first field problem reporting application',
        theme_color: '#0958d9',
        background_color: '#ffffff',
        display: 'standalone',
      },
    }),
  ],
  preview: {
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
