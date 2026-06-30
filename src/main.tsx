import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from "./lib/registerServiceWorker";
import { runMigrations } from "./lib/indexedDBStorage";
import { initSentry } from "./lib/sentry";

// Initialize Sentry (no-op if VITE_SENTRY_DSN is not set)
initSentry();

// Run localStorage → IndexedDB migrations before rendering
runMigrations().catch(() => {
  // IndexedDB migration échouée — fallback localStorage sera utilisé
});

// Initialize the offline queue DB (creates v2 stores if needed)
import("./lib/offlineQueue").catch(() => {
  // Offline queue init échouée — mode hors-ligne dégradé
});

createRoot(document.getElementById("root")!).render(<App />);
registerServiceWorker();
