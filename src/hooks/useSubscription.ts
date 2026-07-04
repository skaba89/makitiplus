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
import { logger } from "@/lib/logger";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number | null;
  currency: string;
  max_stores: number | null; // NULL = unlimited
  max_users: number | null; // NULL = unlimited
  max_products: number | null; // NULL = unlimited
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
  max_stores: number | null; // NULL = unlimited
  max_users: number | null; // NULL = unlimited
  max_products: number | null; // NULL = unlimited
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

// ─── Normalizer ─────────────────────────────────────────────

/**
 * Normalizes the various response formats from `get_organization_subscription` RPC
 * into a consistent `Subscription` object.
 *
 * Accepted formats:
 * 1. null / undefined → null
 * 2. Array from Supabase: [row] → unwrap first element
 * 3. Flat object with snake_case fields (subscription_id, plan_id, …)
 * 4. Nested object: { subscription: {...}, plan: {...} }
 * 5. Partial / legacy object with camelCase (plan, expiresAt, stripeCustomerId)
 */
export function normalizeSubscriptionResponse(data: unknown): Subscription | null {
  if (data == null) return null;

  // 2. Unwrap array
  const raw = Array.isArray(data) ? data[0] : data;
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;

  // Helper to read a field trying both snake_case and camelCase
  const get = (snake: string, camel?: string): unknown =>
    obj[snake] ?? (camel ? obj[camel] : undefined);

  // 4. Nested format: { subscription: {...}, plan: {...} }
  //    Also handles plan-only fallback: { plan: {...} } with no subscription
  if (obj.plan && typeof obj.plan === "object") {
    const sub = (obj.subscription && typeof obj.subscription === "object")
      ? obj.subscription as Record<string, unknown>
      : {} as Record<string, unknown>;
    const plan = obj.plan as Record<string, unknown>;

    return {
      subscription_id: (sub.id ?? sub.subscription_id ?? "") as string,
      plan_id: (sub.plan_id ?? plan.id ?? "croissance") as string,
      plan_name: (plan.name ?? "Croissance") as string,
      status: (sub.status ?? "active") as Subscription["status"],
      current_period_end: (sub.current_period_end ?? "") as string,
      trial_ends_at: (sub.trial_ends_at ?? null) as string | null,
      grace_period_ends_at: (sub.grace_period_ends_at ?? null) as string | null,
      max_stores: (plan.max_stores ?? null) as number | null,
      max_users: (plan.max_users ?? null) as number | null,
      max_products: (plan.max_products ?? null) as number | null,
      max_sales_per_month: (plan.max_sales_per_month ?? null) as number | null,
      has_advanced_reports: (plan.has_advanced_reports ?? false) as boolean,
      has_exports: (plan.has_exports ?? false) as boolean,
      has_supplier_management: (plan.has_supplier_management ?? false) as boolean,
      has_offline_advanced: (plan.has_offline_advanced ?? false) as boolean,
      has_api_access: (plan.has_api_access ?? false) as boolean,
      has_priority_support: (plan.has_priority_support ?? false) as boolean,
      has_custom_branding: (plan.has_custom_branding ?? false) as boolean,
      has_multi_currency: (plan.has_multi_currency ?? false) as boolean,
      has_ai_assistant: (plan.has_ai_assistant ?? false) as boolean,
      has_loyalty_program: (plan.has_loyalty_program ?? false) as boolean,
    };
  }

  // 3 & 5. Flat or partial/legacy object
  return {
    subscription_id: (get("subscription_id") ?? "") as string,
    plan_id: (get("plan_id") ?? get("plan") ?? "croissance") as string,
    plan_name: (get("plan_name") ?? "Croissance") as string,
    status: (get("status") ?? "active") as Subscription["status"],
    current_period_end: (get("current_period_end") ?? get("expiresAt") ?? "") as string,
    trial_ends_at: (get("trial_ends_at") ?? null) as string | null,
    grace_period_ends_at: (get("grace_period_ends_at") ?? null) as string | null,
    max_stores: (get("max_stores") ?? null) as number | null,
    max_users: (get("max_users") ?? null) as number | null,
    max_products: (get("max_products") ?? null) as number | null,
    max_sales_per_month: (get("max_sales_per_month") ?? null) as number | null,
    has_advanced_reports: (get("has_advanced_reports") ?? false) as boolean,
    has_exports: (get("has_exports") ?? false) as boolean,
    has_supplier_management: (get("has_supplier_management") ?? false) as boolean,
    has_offline_advanced: (get("has_offline_advanced") ?? false) as boolean,
    has_api_access: (get("has_api_access") ?? false) as boolean,
    has_priority_support: (get("has_priority_support") ?? false) as boolean,
    has_custom_branding: (get("has_custom_branding") ?? false) as boolean,
    has_multi_currency: (get("has_multi_currency") ?? false) as boolean,
    has_ai_assistant: (get("has_ai_assistant") ?? false) as boolean,
    has_loyalty_program: (get("has_loyalty_program") ?? false) as boolean,
  };
}

// ─── useSubscription ──────────────────────────────────────────

export function useSubscription() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_organization_subscription");
      if (error) {
        // Graceful fallback: if RPC doesn't exist, return null (starter plan assumed)
        logger.warn("[Subscription] get_organization_subscription failed:", error.message);
        return null;
      }
      return normalizeSubscriptionResponse(data);
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
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
      if (error) {
        // Graceful fallback: if RPC doesn't exist yet (404) or auth issue (400),
        // default to allowed=true to avoid blocking the entire UI
        logger.warn(`[PlanLimit] check_plan_limit failed (${limitType}):`, error.message);
        return {
          allowed: true,
          current_count: 0,
          limit_value: null,
          plan_id: "starter",
        } as PlanLimitCheck;
      }
      return data as PlanLimitCheck | null;
    },
    enabled: !!user && enabled,
    staleTime: 2 * 60 * 1000,
    retry: 1, // Don't retry infinitely on missing RPCs
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
      if (error) {
        // Graceful fallback: if RPC doesn't exist yet, default based on feature
        logger.warn(`[FeatureAccess] check_feature_access failed (${featureKey}):`, error.message);
        // Core features should be allowed by default; premium features blocked
        const coreFeatures: FeatureKey[] = ["pos", "stock_management", "customer_credit", "basic_reports"];
        return coreFeatures.includes(featureKey);
      }
      return (data as { allowed: boolean; plan_id: string } | null)?.allowed ?? false;
    },
    enabled: !!user && enabled,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

// ─── usePlans ──────────────────────────────────────────────────

export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_plans");
      if (error) {
        logger.warn("[Plans] get_plans failed:", error.message);
        return [] as Plan[];
      }
      return data as Plan[];
    },
    staleTime: 30 * 60 * 1000, // Plans rarely change
    retry: 1,
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
