/**
 * Sentry integration for MalikiPlus frontend monitoring.
 *
 * - Captures unhandled exceptions and React error boundaries
 * - Tracks performance with automatic transaction tracking
 * - Filters out noisy/non-actionable errors
 * - Tags errors with user role, organization, and device context
 * - Respects user privacy: no PII in breadcrumbs
 *
 * Configuration via environment variables:
 * - VITE_SENTRY_DSN: Required. Your Sentry project DSN
 * - VITE_SENTRY_ENVIRONMENT: Optional. "production" | "staging" | "development"
 * - VITE_SENTRY_TRACES_SAMPLE_RATE: Optional. Default 0.1 (10%)
 * - VITE_SENTRY_REPLAY_SAMPLE_RATE: Optional. Default 0.05 (5%)
 */

import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const ENVIRONMENT = (import.meta.env.VITE_SENTRY_ENVIRONMENT as string) || import.meta.env.MODE || "development";
const TRACES_SAMPLE_RATE = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE) || 0.1;
const REPLAY_SAMPLE_RATE = Number(import.meta.env.VITE_SENTRY_REPLAY_SAMPLE_RATE) || 0.05;
const IS_PROD = import.meta.env.PROD;

/** Errors to ignore — noisy, non-actionable, or expected */
const IGNORED_PATTERNS: Array<string | RegExp> = [
  // Network errors that are expected in offline-first PWA
  "Failed to fetch",
  "NetworkError",
  "Network request failed",
  "net::ERR_INTERNET_DISCONNECTED",
  "net::ERR_NETWORK_CHANGED",
  "net::ERR_CONNECTION_REFUSED",
  "net::ERR_ABORTED",
  // Supabase auth errors that are handled in UI
  "Invalid login credentials",
  "JWT expired",
  "User not found",
  // Service worker registration failures (expected in dev/iframe)
  "ServiceWorker registration failed",
  // ResizeObserver loop errors (benign)
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  // Browser extension noise
  /chrome-extension:\/\//,
  /moz-extension:\/\//,
];

/**
 * Initialize Sentry. Only runs in production or when DSN is provided.
 * Safe to call multiple times — will only init once.
 */
let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  if (!SENTRY_DSN) {
    console.info("[Sentry] VITE_SENTRY_DSN not set — monitoring disabled");
    return;
  }
  if (!IS_PROD && !SENTRY_DSN) return;

  initialized = true;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    release: `malikiplus@${import.meta.env.VITE_APP_VERSION || "0.0.0"}`,

    // Performance monitoring
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Mask all text content for privacy
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: false,
      }),
    ],

    // Sampling rates
    tracesSampleRate: TRACES_SAMPLE_RATE,
    replaysSessionSampleRate: REPLAY_SAMPLE_RATE,
    replaysOnErrorSampleRate: 1.0, // Always capture replay on error

    // Error filtering
    ignoreErrors: IGNORED_PATTERNS,

    // Don't send errors in dev mode (unless DSN is explicitly set)
    beforeSend(event) {
      // Filter out events from Lovable preview hosts
      if (typeof window !== "undefined") {
        const host = window.location.hostname;
        if (
          host.startsWith("id-preview--") ||
          host.startsWith("preview--") ||
          host.endsWith(".lovableproject.com") ||
          host.endsWith(".beta.lovable.dev")
        ) {
          return null;
        }
      }
      return event;
    },

    // Initial tags
    initialScope: {
      tags: {
        app: "malikiplus",
        offline_first: true,
        pwa: true,
      },
    },
  });
}

/**
 * Set user context in Sentry (called after auth).
 * Only sets non-PII identifiers — no email or phone number.
 */
export function setSentryUserContext(context: {
  userId: string;
  role: string;
  organizationId?: string;
  deviceId?: string;
}): void {
  if (!initialized) return;
  Sentry.setUser({ id: context.userId });
  Sentry.setTag("user_role", context.role);
  if (context.organizationId) Sentry.setTag("organization_id", context.organizationId);
  if (context.deviceId) Sentry.setTag("device_id", context.deviceId);
}

/**
 * Clear user context on logout.
 */
export function clearSentryUserContext(): void {
  if (!initialized) return;
  Sentry.setUser(null);
  Sentry.setTag("user_role", "");
  Sentry.setTag("organization_id", "");
}

/**
 * Capture a custom breadcrumb for offline/sync events.
 */
export function addSentryBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!initialized) return;
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: "info",
    timestamp: Date.now() / 1000,
  });
}

/**
 * Report a handled error to Sentry with context.
 */
export function reportError(
  error: Error | unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialized) return;
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Report a sync/receipt delivery event to Sentry breadcrumbs.
 * Useful for debugging offline sync issues from user reports.
 */
export function reportSyncEvent(event: {
  type: "queue_flush" | "retry" | "enqueue" | "conflict" | "migration";
  channel?: string;
  success: boolean;
  details?: string;
}): void {
  addSentryBreadcrumb("sync", `${event.type}: ${event.success ? "ok" : "fail"}`, {
    type: event.type,
    channel: event.channel,
    success: event.success,
    details: event.details,
  });
}

// Re-export Sentry's ErrorBoundary for React
export const SentryErrorBoundary = Sentry.ErrorBoundary;
