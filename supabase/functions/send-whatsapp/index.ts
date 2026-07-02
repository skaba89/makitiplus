// send-whatsapp — Send WhatsApp messages via Meta Cloud API
// Called by the frontend to send receipts, custom messages, or template messages
// to customers. Keeps API credentials server-side.

import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts';
import { createRateLimiter } from '../_shared/rateLimiter.ts';

const limiter = createRateLimiter('send-whatsapp', { maxRequests: 30, windowMs: 60_000 });

const WHATSAPP_API_VERSION = 'v21.0';

interface WhatsAppConfig {
  phone_number_id: string;
  business_account_id: string;
  access_token: string;
  is_active: boolean;
  daily_limit: number;
  daily_count: number;
  daily_count_date: string | null;
  auto_send_receipt: boolean;
  whatsapp_phone: string | null;
}

interface SendMessagePayload {
  phone: string;
  message_type: 'receipt' | 'custom' | 'template';
  text?: string;           // For custom/receipt messages
  template_name?: string;  // For template messages
  template_params?: string[];  // Template variables
  sale_id?: string;
  customer_id?: string;
  store_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsOptionsResponse(req);

  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  // Rate limiting
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
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user session
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.93.3');
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: jsonHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Get user's org
    const { data: profile } = await adminClient
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: 'No organization found' }), { status: 403, headers: jsonHeaders });
    }

    // ── Load WhatsApp config ──────────────────────────────────────
    const { data: config, error: configError } = await adminClient
      .from('whatsapp_config')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)
      .maybeSingle();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ error: 'WhatsApp non configuré. Veuillez configurer WhatsApp dans les paramètres.' }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // ── Daily limit check ─────────────────────────────────────────
    const today = new Date().toISOString().split('T')[0];
    const currentCount = config.daily_count_date === today ? (config.daily_count || 0) : 0;

    if (currentCount >= (config.daily_limit || 1000)) {
      return new Response(
        JSON.stringify({ error: `Limite quotidienne atteinte (${config.daily_limit} messages/jour)` }),
        { status: 429, headers: jsonHeaders }
      );
    }

    // ── Parse payload ─────────────────────────────────────────────
    const body: SendMessagePayload = await req.json();
    const { phone, message_type, text, template_name, template_params, sale_id, customer_id, store_id } = body;

    if (!phone) {
      return new Response(JSON.stringify({ error: 'Numéro de téléphone requis' }), { status: 400, headers: jsonHeaders });
    }

    // Clean phone number (remove spaces, dashes, ensure country code)
    let cleanPhone = phone.replace(/[\s\-()]/g, '').replace(/^\+/, '');
    // If no country code, default to Guinea (224)
    if (/^[5-7]/.test(cleanPhone) && cleanPhone.length === 9) {
      cleanPhone = '224' + cleanPhone;
    }

    // ── Send via Meta WhatsApp Cloud API ──────────────────────────
    const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${config.phone_number_id}/messages`;

    let whatsappPayload: Record<string, unknown>;

    if (message_type === 'template' && template_name) {
      // Template message
      whatsappPayload = {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'template',
        template: {
          name: template_name,
          language: { code: 'fr' },
          components: template_params?.length ? [{
            type: 'body',
            parameters: template_params.map((p) => ({ type: 'text', text: p })),
          }] : [],
        },
      };
    } else {
      // Text message (receipt or custom)
      if (!text) {
        return new Response(JSON.stringify({ error: 'Message text requis' }), { status: 400, headers: jsonHeaders });
      }

      // WhatsApp text messages have a 4096 char limit
      const messageText = text.length > 4096 ? text.substring(0, 4093) + '...' : text;

      whatsappPayload = {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'text',
        text: { body: messageText },
      };
    }

    // Call Meta API
    const whatsappResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(whatsappPayload),
    });

    const whatsappData = await whatsappResponse.json();

    if (!whatsappResponse.ok) {
      // Log the failure
      await adminClient.from('whatsapp_message_logs').insert({
        organization_id: profile.organization_id,
        store_id: store_id || null,
        sale_id: sale_id || null,
        customer_id: customer_id || null,
        phone_number: cleanPhone,
        message_type,
        message_content: text?.substring(0, 2000) || null,
        template_name: template_name || null,
        status: 'failed',
        error_message: JSON.stringify(whatsappData.error || whatsappData),
        attempts: 1,
      });

      const errorMsg = whatsappData.error?.message || whatsappData.error?.error_data?.details || 'Erreur API WhatsApp';
      return new Response(
        JSON.stringify({ error: `WhatsApp: ${errorMsg}` }),
        { status: 502, headers: jsonHeaders }
      );
    }

    // ── Success — log & update counter ────────────────────────────
    const whatsappMessageId = whatsappData.messages?.[0]?.id || null;

    await adminClient.from('whatsapp_message_logs').insert({
      organization_id: profile.organization_id,
      store_id: store_id || null,
      sale_id: sale_id || null,
      customer_id: customer_id || null,
      phone_number: cleanPhone,
      message_type,
      message_content: text?.substring(0, 2000) || null,
      template_name: template_name || null,
      status: 'sent',
      whatsapp_message_id: whatsappMessageId,
      sent_at: new Date().toISOString(),
      attempts: 1,
    });

    // Update daily counter
    await adminClient
      .from('whatsapp_config')
      .update({
        daily_count: currentCount + 1,
        daily_count_date: today,
      })
      .eq('id', config.id);

    return new Response(
      JSON.stringify({
        success: true,
        message_id: whatsappMessageId,
        phone: cleanPhone,
        daily_remaining: (config.daily_limit || 1000) - currentCount - 1,
      }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (err) {
    console.error('[send-whatsapp] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur interne du serveur' }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
