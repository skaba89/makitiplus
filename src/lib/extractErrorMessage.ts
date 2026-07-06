/**
 * extractErrorMessage — Safely extract a human-readable string from any error
 *
 * Supabase PostgrestError is a plain object (NOT an Error instance):
 *   { message: string, code: string, details: string | null, hint: string | null }
 *
 * Using String(error) on a PostgrestError gives "[object Object]".
 * Using (error as Error).message gives undefined.
 *
 * This utility handles PostgrestError, native Error, string, and unknown objects.
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const errObj = error as Record<string, unknown>;
    // PostgrestError: { message, code, details, hint }
    if (typeof errObj.message === "string" && errObj.message.length > 0) {
      const parts: string[] = [errObj.message];
      // Append details if available and different from message
      if (typeof errObj.details === "string" && errObj.details.length > 0 && errObj.details !== errObj.message) {
        parts.push(errObj.details);
      }
      return parts.join(" — ");
    }
    if (typeof errObj.msg === "string") return errObj.msg;
    if (typeof errObj.error === "string") return errObj.error;
    // Fallback: JSON stringify (truncated to avoid huge payloads)
    try {
      const json = JSON.stringify(error);
      return json.length > 200 ? json.slice(0, 200) + "…" : json;
    } catch {
      return String(error);
    }
  }
  return String(error);
}
