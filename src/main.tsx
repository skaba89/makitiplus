import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config";
import { registerServiceWorker } from "./lib/registerServiceWorker";
import { runMigrations, getDB } from "./lib/indexedDBStorage";
import { initSentry, reportError } from "./lib/sentry";
import { logger } from "./lib/logger";

// Initialize Sentry (no-op if VITE_SENTRY_DSN is not set)
initSentry();

// Initialize IndexedDB (unified v3 DB with all stores) and run migrations
Promise.all([getDB(), runMigrations()]).catch((e) => {
  // IndexedDB init échouée — fallback localStorage sera utilisé
  reportError(e);
  logger.warn("[MalikiPlus] IndexedDB init échouée, fallback localStorage :", e);
});

createRoot(document.getElementById("root")!).render(<App />);
registerServiceWorker();
