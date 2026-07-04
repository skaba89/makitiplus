/**
 * CORS helper for Supabase Edge Functions.
 *
 * Reads the allowed origin from CORS_ORIGIN env var (set in Supabase dashboard).
 * Falls back to localhost for local development.
 * NEVER uses wildcard (*) in production.
 */

const ALLOWED_ORIGINS = [
  Deno.env.get("CORS_ORIGIN") ?? "http://localhost:5173",
  "http://localhost:8080",  // Vite preview
  "http://localhost:3000",
  "https://makitiplus.onrender.com",  // Production
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  // Only set ACAO if the origin is in the allowlist.
  // If origin is not allowed, don't grant cross-origin access.
  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

/** Shorthand for preflight OPTIONS response */
export function corsOptionsResponse(req: Request): Response {
  return new Response(null, { status: 204, headers: getCorsHeaders(req) });
}

/**
 * Validate that an origin or URL belongs to an allowed domain.
 * Returns the validated origin or the default production URL.
 * Prevents open redirect attacks on Stripe checkout/portal callbacks.
 */
export function validateOrigin(req: Request): string {
  const origin = req.headers.get("Origin") ?? "";
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  return "https://makitiplus.onrender.com";
}
