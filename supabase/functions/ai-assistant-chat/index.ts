// ai-assistant-chat — Real LLM-backed business advice assistant
//
// Replaces the previous frontend-only keyword-matching simulation
// (src/pages/AIAssistant.tsx generateAIResponse) with an actual call to
// Groq's chat completions API, grounded in the caller's real business
// data (sales, stock, expenses — read via the caller's own JWT so RLS
// scopes everything to their organization automatically).
//
// Access control is enforced HERE, server-side, independently of the
// frontend FeatureGate — the API key must never be reachable by a
// caller whose plan doesn't include has_ai_assistant, regardless of
// what the UI shows.

import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';
import { createRateLimiter } from '../_shared/rateLimiter.ts';

// LLM calls cost money per request — tighter budget than send-whatsapp.
const limiter = createRateLimiter('ai-assistant-chat', { maxRequests: 20, windowMs: 5 * 60_000 });

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface ChatRequestMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPayload {
  message: string;
  // Last few turns for conversational context — kept short, no server-side
  // persistence needed for a v1 stateless assistant.
  history?: ChatRequestMessage[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsOptionsResponse(req);

  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  const rateResult = await limiter.check(req);
  if (!rateResult.allowed) {
    return limiter.addHeaders(
      new Response(JSON.stringify({ error: rateResult.error }), { status: 429, headers: jsonHeaders }),
      rateResult,
    );
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers: jsonHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.93.3');
    // Deliberately the USER's own JWT, not service role — every RPC called
    // below uses auth.uid() internally, so this is what makes the data
    // returned automatically scoped to the caller's own organization
    // without this function needing to know or trust an org_id from the client.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: jsonHeaders });
    }

    // ── Plan enforcement — server-side, independent of the frontend gate ──
    const { data: featureCheck, error: featureError } = await userClient.rpc('check_feature_access', {
      p_feature_key: 'ai_assistant',
    });
    if (featureError) {
      return new Response(JSON.stringify({ error: 'Impossible de vérifier votre accès à cette fonctionnalité' }), { status: 500, headers: jsonHeaders });
    }
    const allowed = typeof featureCheck === 'object' && featureCheck !== null
      ? Boolean((featureCheck as Record<string, unknown>).allowed ?? featureCheck)
      : Boolean(featureCheck);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "L'assistant IA n'est pas inclus dans votre plan actuel." }),
        { status: 403, headers: jsonHeaders },
      );
    }

    // ── Parse payload ─────────────────────────────────────────────
    const body: ChatPayload = await req.json();
    const message = (body.message ?? '').trim();
    if (!message) {
      return new Response(JSON.stringify({ error: 'Message requis' }), { status: 400, headers: jsonHeaders });
    }
    if (message.length > 2000) {
      return new Response(JSON.stringify({ error: 'Message trop long (2000 caractères max)' }), { status: 400, headers: jsonHeaders });
    }
    const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

    // ── Business context — real data, scoped by RLS via the user's own JWT ──
    const [profileRes, dashboardRes, productRes, expenseRes] = await Promise.all([
      userClient.from('profiles').select('business_name, currency, country').eq('user_id', user.id).maybeSingle(),
      userClient.rpc('get_dashboard_stats', {}),
      userClient.rpc('get_product_stats'),
      userClient.rpc('get_expense_stats'),
    ]);

    const businessName = profileRes.data?.business_name ?? 'ce commerce';
    const currency = profileRes.data?.currency ?? 'GNF';
    const dashboard = Array.isArray(dashboardRes.data) ? dashboardRes.data[0] : dashboardRes.data;
    const products = productRes.data as Record<string, unknown> | null;
    const expenses = expenseRes.data as Record<string, unknown> | null;

    const contextLines = [
      `Boutique : ${businessName} (devise : ${currency})`,
      dashboard ? `Ventes aujourd'hui : ${dashboard.todaySales ?? 0} ${currency} (${dashboard.todayTransactions ?? 0} transactions)` : null,
      dashboard ? `Crédits clients en cours : ${dashboard.totalCredits ?? 0} ${currency} (${dashboard.creditsCount ?? 0} clients)` : null,
      products ? `Produits en catalogue : ${products.totalProducts ?? 0} (dont ${products.lowStockCount ?? 0} en stock bas, ${products.outOfStockCount ?? 0} en rupture)` : null,
      expenses ? `Dépenses ce mois : ${expenses.monthTotal ?? 0} ${currency} (${expenses.monthCount ?? 0} dépenses)` : null,
    ].filter(Boolean).join('\n');

    // ── Call Groq ─────────────────────────────────────────────────
    const groqKey = Deno.env.get('GROQ_API_KEY');
    if (!groqKey) {
      console.error('[ai-assistant-chat] GROQ_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Assistant IA temporairement indisponible' }), { status: 503, headers: jsonHeaders });
    }

    const systemPrompt = `Tu es l'assistant IA métier de MakitiPlus, une application de caisse pour les commerces en Afrique de l'Ouest. Tu conseilles le gérant d'une boutique sur ses ventes, son stock, ses dépenses et sa stratégie commerciale, de manière concrète, actionnable et adaptée au contexte local (mobile money, marchés africains). Réponds toujours en français.

Données réelles actuelles de son commerce :
${contextLines || "Aucune donnée disponible pour le moment."}

Réponds STRICTEMENT au format JSON suivant, sans texte hors JSON :
{"content": "ta réponse en markdown (gras avec **), 3-5 paragraphes maximum", "suggestions": ["question de suivi courte 1", "question de suivi courte 2", "question de suivi courte 3"]}`;

    const groqResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: message },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 800,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text().catch(() => '');
      console.error('[ai-assistant-chat] Groq API error:', groqResponse.status, errText.slice(0, 500));
      return new Response(JSON.stringify({ error: "L'assistant IA n'a pas pu répondre. Réessayez dans un instant." }), { status: 502, headers: jsonHeaders });
    }

    const groqData = await groqResponse.json();
    const rawContent: string = groqData.choices?.[0]?.message?.content ?? '';

    let parsed: { content: string; suggestions?: string[] };
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      // Fallback: model didn't honor JSON mode — surface the raw text rather than fail the request.
      parsed = { content: rawContent || "Désolé, je n'ai pas pu formuler de réponse. Réessayez.", suggestions: [] };
    }

    return new Response(
      JSON.stringify({
        content: parsed.content,
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 4) : [],
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    console.error('[ai-assistant-chat] Unexpected error:', (err as Error).message);
    return new Response(JSON.stringify({ error: 'Erreur interne du serveur' }), { status: 500, headers: jsonHeaders });
  }
});
