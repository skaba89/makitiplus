/**
 * HTTP method enforcement for Supabase Edge Functions.
 *
 * Ensures that only allowed methods reach the handler.
 * Returns a 405 Method Not Allowed for disallowed methods.
 */
export function requireMethod(req: Request, allowed: string | string[]): Response | null {
  const methods = Array.isArray(allowed) ? allowed : [allowed];
  // OPTIONS is always allowed for CORS preflight
  if (req.method === 'OPTIONS') return null;
  if (methods.includes(req.method)) return null;

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      Allow: methods.join(', '),
    },
  });
}
