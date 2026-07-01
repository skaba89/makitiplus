import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  build: {
    rollupOptions: {
      // Externalize jspdf optional deps that bloat the bundle unnecessarily.
      // canvg (~150 kB) and dompurify (~28 kB) are only needed for SVG/HTML
      // rendering inside PDFs — our receipt generator uses pure canvas, not SVG.
      external: (id) =>
        id === "html2canvas" || id === "canvg" || id === "dompurify",
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          query: ["@tanstack/react-query"],
          charts: ["recharts"],
          pdf: ["jspdf"],
          qrcode: ["qrcode"],
          scanner: ["html5-qrcode"],
          barcode: ["jsbarcode"],
          ui: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-popover",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-switch",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-avatar",
            "@radix-ui/react-label",
            "@radix-ui/react-separator",
            "@radix-ui/react-slot",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-collapsible",
            "@radix-ui/react-accordion",
            "@radix-ui/react-progress",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-toggle",
            "@radix-ui/react-toggle-group",
            "@radix-ui/react-toast",
            "@radix-ui/react-aspect-ratio",
            "@radix-ui/react-hover-card",
            "@radix-ui/react-context-menu",
            "@radix-ui/react-menubar",
            "@radix-ui/react-navigation-menu",
            "@radix-ui/react-slider",
          ],
          cmdk: ["cmdk"],
          forms: ["react-hook-form", "@hookform/resolvers", "zod"],
          state: ["zustand"],
          icons: ["lucide-react"],
          date: ["date-fns", "react-day-picker"],
          motion: ["embla-carousel-react", "vaul"],
        },
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      filename: "sw.js",
      devOptions: { enabled: false },
      manifest: false,
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,woff2}"],
        runtimeCaching: [
          // HTML navigations — NetworkFirst for fresh content
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-navigations",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          // Static assets — CacheFirst for performance
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\.(?:js|css|woff2|png|svg|ico)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // Supabase REST API (GET only) — NetworkFirst with cache fallback
          // This caches API responses so the app works offline via IndexedDB fallback
          {
            urlPattern: ({ url }) =>
              url.hostname.includes("supabase.co") &&
              url.pathname.includes("/rest/v1/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Supabase Auth — NetworkOnly (never cache auth tokens)
          {
            urlPattern: ({ url }) =>
              url.hostname.includes("supabase.co") &&
              url.pathname.includes("/auth/v1/"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
