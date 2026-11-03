/**
 * isAmbiguousNetworkFailure — did a request fail *before we could know* whether
 * the server applied it?
 *
 * A Supabase RPC can reach Postgres and commit, then the response is lost on
 * an unstable 3G/4G link. The client sees a fetch-level failure, not a
 * Postgres error. For a sale this outcome is ambiguous: retrying with a NEW
 * sale number would create a duplicate, while giving up would lose the sale.
 * Callers use this helper to route such failures to the offline queue with the
 * SAME sale number — the server deduplicates on (organization_id, sale_number).
 *
 * Business errors (Postgres codes such as P0001 "Stock insuffisant", plan
 * limits, RLS 42501…) are NOT ambiguous and must be surfaced to the user.
 */
const NETWORK_MESSAGE_RE =
  /failed to fetch|fetch failed|networkerror|network request failed|load failed|network error|timed? ?out|timeout|aborted|err_network|err_internet_disconnected|econnreset|econnrefused|socket hang up/i;

export function isAmbiguousNetworkFailure(error: unknown): boolean {
  if (!error) return false;

  if (typeof error === "object") {
    const e = error as { name?: unknown; message?: unknown; code?: unknown; status?: unknown };
    const name = typeof e.name === "string" ? e.name : "";
    const message = typeof e.message === "string" ? e.message : "";
    const code = typeof e.code === "string" ? e.code : "";

    // A Postgres/PostgREST error code means the server answered: not ambiguous.
    if (code && /^[0-9A-Z]{5}$/.test(code)) return false;
    if (code && code.startsWith("PGRST")) return false;

    // HTTP gateway errors: request may or may not have been processed.
    if (typeof e.status === "number" && (e.status === 0 || e.status === 502 || e.status === 503 || e.status === 504)) {
      return true;
    }
    if (name === "AbortError" || name === "TimeoutError") return true;
    if (name === "TypeError" && NETWORK_MESSAGE_RE.test(message)) return true;
    return NETWORK_MESSAGE_RE.test(message);
  }

  if (typeof error === "string") return NETWORK_MESSAGE_RE.test(error);
  return false;
}
