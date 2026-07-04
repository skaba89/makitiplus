/**
 * Rate limiter for Supabase Edge Functions.
 *
 * Uses Deno KV (built into Deno runtime in Supabase Edge Functions)
 * for distributed, atomic rate limiting. Falls back to in-memory
 * tracking if KV is unavailable.
 *
 * Uses kv.atomic() for compare-and-set to prevent race conditions
 * where concurrent requests both read the same count.
 *
 * Designed for endpoints that need protection against abuse:
 *   - stripe-portal: Stripe portal session creation
 *   - stripe-checkout: Stripe checkout session creation
 *   - redeem-reset-token: password reset redemption
 *   - rotate-test-accounts: cron job
 *   - send-whatsapp: WhatsApp message sending
 *
 * Usage in an edge function:
 *   const limiter = createRateLimiter("redeem-reset-token", {
 *     maxRequests: 5,
 *     windowMs: 60_000,
 *   });
 *   const result = await limiter.check(req);
 *   if (!result.allowed) return new Response(JSON.stringify({ error: result.error }), { status: 429, ... });
 */

export interface RateLimiterConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Key prefix for storage (default: "rl:") */
  prefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  error?: string;
}

interface RateEntry {
  count: number;
  resetAt: number;
}

// In-memory fallback store (per-isolate, not distributed)
const memoryStore = new Map<string, RateEntry>();

/**
 * Extracts a client identifier from the request.
 * Uses IP address (from Cloudflare/proxy headers) or falls back to a hash of user-agent.
 */
function extractClientId(req: Request): string {
  const candidates = [
    req.headers.get("cf-connecting-ip"),
    req.headers.get("x-real-ip"),
    req.headers.get("x-forwarded-for"),
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const first = raw.split(",")[0]?.trim();
    if (first && first.length <= 64) return first;
  }

  // Fallback: user-agent hash (not ideal, but better than nothing)
  const ua = req.headers.get("user-agent") || "unknown";
  return `ua:${ua.slice(0, 64)}`;
}

/**
 * Creates a rate limiter for a specific endpoint.
 *
 * @param endpoint - Name of the edge function (used as part of the key)
 * @param config - Rate limit configuration
 */
export function createRateLimiter(endpoint: string, config: RateLimiterConfig) {
  const prefix = config.prefix ?? "rl";
  const keyPrefix = `${prefix}:${endpoint}:`;

  return {
    /**
     * Check if the request is allowed under the rate limit.
     * Uses kv.atomic() for race-condition-free increment.
     * Returns result with allowed flag and metadata.
     */
    async check(req: Request): Promise<RateLimitResult> {
      const clientId = extractClientId(req);
      const key = `${keyPrefix}${clientId}`;
      const now = Date.now();
      const resetAt = now + config.windowMs;

      // Try Deno KV first (distributed, atomic)
      try {
        const kv = await Deno.openKv();
        const kvKey = [key];

        // Use atomic compare-and-set to prevent race conditions
        // Retry up to 3 times in case of concurrent writes
        for (let attempt = 0; attempt < 3; attempt++) {
          const entry = await kv.get<RateEntry>(kvKey);
          const currentVersion = entry.versionstamp;

          if (!entry.value || entry.value.resetAt <= now) {
            // Window expired or first request — start fresh
            // Use atomic to ensure no other request wrote first
            const op = kv.atomic();
            if (currentVersion) {
              op.check({ key: kvKey, versionstamp: currentVersion });
            }
            op.set(kvKey, { count: 1, resetAt });
            const result = await op.commit();
            if (result.ok) {
              kv.close();
              return {
                allowed: true,
                remaining: config.maxRequests - 1,
                resetAt,
              };
            }
            // Another request wrote first — retry
            continue;
          }

          const count = entry.value.count + 1;
          if (count > config.maxRequests) {
            kv.close();
            return {
              allowed: false,
              remaining: 0,
              resetAt: entry.value.resetAt,
              error: `Trop de requêtes. Réessayez dans ${Math.ceil((entry.value.resetAt - now) / 1000)}s.`,
            };
          }

          // Increment counter atomically
          const op = kv.atomic();
          op.check({ key: kvKey, versionstamp: currentVersion! });
          op.set(kvKey, { count, resetAt: entry.value.resetAt });
          const result = await op.commit();
          if (result.ok) {
            kv.close();
            return {
              allowed: true,
              remaining: config.maxRequests - count,
              resetAt: entry.value.resetAt,
            };
          }
          // CAS failed — another request modified the entry — retry
        }

        // All retries exhausted — allow the request (fail-open)
        console.warn(`[rateLimiter] CAS retries exhausted for ${key} — allowing request`);
        kv.close();
        return {
          allowed: true,
          remaining: 0,
          resetAt,
        };
      } catch {
        // KV not available — use in-memory fallback
        const entry = memoryStore.get(key);

        if (!entry || entry.resetAt <= now) {
          memoryStore.set(key, { count: 1, resetAt });
          return {
            allowed: true,
            remaining: config.maxRequests - 1,
            resetAt,
          };
        }

        const count = entry.count + 1;
        if (count > config.maxRequests) {
          return {
            allowed: false,
            remaining: 0,
            resetAt: entry.resetAt,
            error: `Trop de requêtes. Réessayez dans ${Math.ceil((entry.resetAt - now) / 1000)}s.`,
          };
        }

        memoryStore.set(key, { count, resetAt: entry.resetAt });
        return {
          allowed: true,
          remaining: config.maxRequests - count,
          resetAt: entry.resetAt,
        };
      }
    },

    /**
     * Add rate-limit headers to a Response.
     */
    addHeaders(
      response: Response,
      result: RateLimitResult,
    ): Response {
      const headers = new Headers(response.headers);
      headers.set("X-RateLimit-Remaining", String(result.remaining));
      headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
      if (!result.allowed) {
        headers.set("Retry-After", String(Math.ceil((result.resetAt - Date.now()) / 1000)));
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
  };
}
