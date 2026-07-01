/**
 * SaaS Subscription & Plan Management Hooks for MakitiPlus
 *
 * Provides:
 * - useSubscription: current org's subscription and plan details
 * - usePlanLimit: check if an action is within plan limits
 * - useFeatureAccess: check if a feature is available for the current plan
 * - usePlans: public plans list for pricing page
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number | null;
  currency: string;
  max_stores: number;
  max_users: number;
  max_products: number | null;
  max_sales_per_month: number | null;
  has_advanced_reports: boolean;
  has_exports: boolean;
  has_supplier_management: boolean;
  has_offline_advanced: boolean;
  has_api_access: boolean;
  has_priority_support: boolean;
  has_custom_branding: boolean;
  has_multi_currency: boolean;
  has_ai_assistant: boolean;
  has_loyalty_program: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface Subscription {
  subscription_id: string;
  plan_id: string;
  plan_name: string;
  status: "active" | "past_due" | "grace_period" | "read_only" | "cancelled" | "expired";
  current_period_end: string;
  trial_ends_at: string | null;
  grace_period_ends_at: string | null;
  max_stores: number;
  max_users: number;
  max_products: number | null;
  max_sales_per_month: number | null;
  has_advanced_reports: boolean;
  has_exports: boolean;
  has_supplier_management: boolean;
  has_offline_advanced: boolean;
  has_api_access: boolean;
  has_priority_support: boolean;
  has_custom_branding: boolean;
  has_multi_currency: boolean;
  has_ai_assistant: boolean;
  has_loyalty_program: boolean;
}

export interface PlanLimitCheck {
  allowed: boolean;
  current_count: number;
  limit_value: number | null;
  plan_id: string;
}

export type LimitType = "stores" | "users" | "products" | "sales_this_month";

export type FeatureKey =
  | "pos"
  | "stock_management"
  | "customer_credit"
  | "basic_reports"
  | "advanced_reports"
  | "exports"
  | "supplier_management"
  | "offline_advanced"
  | "custom_branding"
  | "multi_currency"
  | "api_access"
  | "priority_support"
  | "ai_assistant"
  | "loyalty_program"
  | "admin_analytics"
  | "backup_restore";

// ─── useSubscription ──────────────────────────────────────────

export function useSubscription() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["subscription"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_organization_subscription");
      if (error) throw error;
      return data as Subscription | null;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── usePlanLimit ──────────────────────────────────────────────

export function usePlanLimit(limitType: LimitType, enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["plan-limit", limitType],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("check_plan_limit", {
        p_limit_type: limitType,
      });
      if (error) throw error;
      return data as PlanLimitCheck | null;
    },
    enabled: !!user && enabled,
    staleTime: 2 * 60 * 1000,
  });
}

// ─── useFeatureAccess ──────────────────────────────────────────

export function useFeatureAccess(featureKey: FeatureKey, enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["feature-access", featureKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("check_feature_access", {
        p_feature_key: featureKey,
      });
      if (error) throw error;
      return (data as { allowed: boolean; plan_id: string } | null)?.allowed ?? false;
    },
    enabled: !!user && enabled,
    staleTime: 10 * 60 * 1000,
  });
}

// ─── usePlans ──────────────────────────────────────────────────

export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_plans");
      if (error) throw error;
      return data as Plan[];
    },
    staleTime: 30 * 60 * 1000, // Plans rarely change
  });
}

// ─── Helper: isWithinLimit ────────────────────────────────────

/** Quick check: returns true if the action is allowed within the plan */
export function isWithinLimit(check: PlanLimitCheck | null | undefined): boolean {
  if (!check) return true; // Default allow if no data yet
  return check.allowed;
}

/** Format limit display: "5 / 10" or "5 / Illimité" */
export function formatLimit(current: number, limit: number | null): string {
  if (limit === null) return `${current} / Illimité`;
  return `${current} / ${limit}`;
}
