/**
 * Guarded Service Worker registration for SahelPOS.
 * Refuses registration in dev / Lovable preview / iframes / when ?sw=off is set.
 * Unregisters any matching SW in refused contexts to avoid stale caches.
 */

const SW_URL = "/sw.js";

const isRefusedHost = (host: string): boolean => {
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  ) {
    return true;
  }
  return false;
};

const unregisterMatching = async () => {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          return url.endsWith(SW_URL);
        })
        .map((r) => r.unregister()),
    );
  } catch {
    /* noop */
  }
};

export const registerServiceWorker = () => {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const url = new URL(window.location.href);
  const killSwitch = url.searchParams.get("sw") === "off";
  const inIframe = window.self !== window.top;
  const isProd = import.meta.env.PROD;
  const host = window.location.hostname;

  if (!isProd || inIframe || killSwitch || isRefusedHost(host)) {
    void unregisterMatching();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SW_URL, { type: "classic" }).catch(() => {
      /* ignore registration failures */
    });
  });
};
