/**
 * Web Vitals monitoring for MalikiPlus.
 *
 * Captures Core Web Vitals (LCP, INP, CLS, TTFB) and sends them to
 * Sentry as breadcrumbs + custom events. This gives us real-user performance
 * data in the same dashboard as errors, without needing a separate metrics backend.
 *
 * Metrics tracked:
 * - LCP  (Largest Contentful Paint): loading performance
 * - INP  (Interaction to Next Paint):  interactivity
 * - CLS  (Cumulative Layout Shift):    visual stability
 * - TTFB (Time to First Byte):         server responsiveness
 *
 * Usage: import and call `initWebVitals()` once at app startup.
 */

import { onLCP, onINP, onCLS, onTTFB, type Metric } from "web-vitals";
import { reportError, addSentryBreadcrumb } from "@/lib/sentry";
import { logger } from "@/lib/logger";

/** Rate-limit: don't send more than 1 metric per type per session */
const sent = new Set<string>();

function handleMetric(metric: Metric) {
  const { name, value, rating, delta } = metric;

  // Log to console in dev
  if (import.meta.env.DEV) {
    logger.info(`[WebVitals] ${name}: ${value.toFixed(2)}ms (${rating}) delta=${delta.toFixed(2)}`);
  }

  // Avoid duplicate sends for the same metric in a single session
  const key = `${name}`;
  if (sent.has(key)) return;
  sent.add(key);

  // Send to Sentry as a breadcrumb for correlation with errors
  addSentryBreadcrumb("web-vitals", `${name}=${value.toFixed(0)}ms (${rating})`, {
    metric: name,
    value: Math.round(value),
    rating,
    delta: Math.round(delta),
    navigationType: metric.navigationType,
  });

  // Report poor ratings as soft errors so they appear in Sentry issues
  if (rating === "poor") {
    reportError(new Error(`WebVital ${name} is poor: ${value.toFixed(0)}ms`), {
      metric: name,
      value: Math.round(value),
      rating,
      navigationType: metric.navigationType,
    });
  }
}

/**
 * Initialize web-vitals collection.
 * Safe to call multiple times — will only register listeners once.
 */
let initialized = false;

export function initWebVitals(): void {
  if (initialized) return;
  if (typeof window === "undefined") return; // SSR guard

  initialized = true;

  try {
    onLCP(handleMetric);
    onINP(handleMetric);
    onCLS(handleMetric);
    onTTFB(handleMetric);
  } catch (err) {
    // Web Vitals should never crash the app
    logger.warn("[WebVitals] Failed to initialize:", err);
  }
}
