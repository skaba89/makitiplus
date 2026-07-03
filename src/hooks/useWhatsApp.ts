import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStoreId } from "@/contexts/StoreContext";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WhatsAppConfig {
  id: string;
  phone_number_id: string;
  business_account_id: string;
  access_token: string;  // Masked on read (only first 8 chars)
  whatsapp_phone: string | null;
  auto_send_receipt: boolean;
  auto_send_message: string | null;
  is_active: boolean;
  daily_limit: number;
  daily_count: number;
  daily_count_date: string | null;
}

export interface WhatsAppStats {
  total_sent: number;
  total_delivered: number;
  total_failed: number;
  today_sent: number;
  receipts: number;
  custom: number;
  is_configured: boolean;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  header_text: string | null;
  body_text: string;
  footer_text: string | null;
  is_active: boolean;
  meta_template_name: string | null;
}

export interface WhatsAppMessageLog {
  id: string;
  organization_id: string;
  store_id: string | null;
  sale_id: string | null;
  customer_id: string | null;
  phone_number: string;
  message_type: string;
  message_content: string | null;
  template_name: string | null;
  status: string;
  whatsapp_message_id: string | null;
  error_message: string | null;
  attempts: number;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface SendWhatsAppParams {
  phone: string;
  message_type: 'receipt' | 'custom' | 'template';
  text?: string;
  template_name?: string;
  template_params?: string[];
  sale_id?: string;
  customer_id?: string;
  store_id?: string;
}

// ─── Hook: useWhatsAppConfig ───────────────────────────────────────────────

export function useWhatsAppConfig() {
  const { user } = useAuth();

  return useQuery<WhatsAppConfig | null>({
    queryKey: ["whatsapp-config", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_whatsapp_config");
      if (error) throw error;
      return (data as WhatsAppConfig) ?? null;
    },
    enabled: !!user,
  });
}

// ─── Hook: useWhatsAppStats ────────────────────────────────────────────────

export function useWhatsAppStats() {
  const { user } = useAuth();

  return useQuery<WhatsAppStats>({
    queryKey: ["whatsapp-stats", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_whatsapp_stats");
      if (error) throw error;
      return (data as WhatsAppStats) ?? {
        total_sent: 0, total_delivered: 0, total_failed: 0,
        today_sent: 0, receipts: 0, custom: 0, is_configured: false,
      };
    },
    enabled: !!user,
  });
}

// ─── Hook: useWhatsAppTemplates ────────────────────────────────────────────

export function useWhatsAppTemplates() {
  const { user } = useAuth();

  return useQuery<WhatsAppTemplate[]>({
    queryKey: ["whatsapp-templates", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as WhatsAppTemplate[];
    },
    enabled: !!user,
  });
}

// ─── Hook: useWhatsAppMessageLogs ──────────────────────────────────────────

export function useWhatsAppMessageLogs(limit = 50) {
  const { user } = useAuth();
  const storeId = useStoreId();

  return useQuery<WhatsAppMessageLog[]>({
    queryKey: ["whatsapp-logs", user?.id, storeId ?? "no-store", limit],
    queryFn: async () => {
      let query = supabase
        .from("whatsapp_message_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (storeId) query = query.eq("store_id", storeId);
      const { data, error } = await query;
      if (error) throw error;
      return data as WhatsAppMessageLog[];
    },
    enabled: !!user,
  });
}

// ─── Hook: useSaveWhatsAppConfig ───────────────────────────────────────────

export function useSaveWhatsAppConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      phone_number_id: string;
      business_account_id: string;
      access_token: string;
      whatsapp_phone?: string | null;
      auto_send_receipt?: boolean;
      auto_send_message?: string | null;
      daily_limit?: number;
    }) => {
      const { data, error } = await supabase.rpc("save_whatsapp_config", {
        p_phone_number_id: params.phone_number_id,
        p_business_account_id: params.business_account_id,
        p_access_token: params.access_token,
        p_whatsapp_phone: params.whatsapp_phone ?? null,
        p_auto_send_receipt: params.auto_send_receipt ?? false,
        p_auto_send_message: params.auto_send_message ?? null,
        p_daily_limit: params.daily_limit ?? 1000,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-config"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-stats"] });
    },
  });
}

// ─── Hook: useSendWhatsApp ─────────────────────────────────────────────────

export function useSendWhatsApp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SendWhatsAppParams) => {
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-logs"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-stats"] });
    },
  });
}
