/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_SUPABASE_PROJECT_ID: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string;
  readonly VITE_SENTRY_DSN: string;
  readonly VITE_SENTRY_ENVIRONMENT: string;
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE: string;
  readonly VITE_SENTRY_REPLAY_SAMPLE_RATE: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_DEMO_MODE: string;
  readonly VITE_PO_RECEIPT_ONCE_ENABLED?: string;
  readonly VITE_PO_RECEIPT_ONCE_RELEASE_APPROVED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
