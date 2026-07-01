/**
 * Shared type definitions for MalikiPlus.
 *
 * Centralises interfaces used across pages, components, hooks, and lib modules
 * so that we never rely on `any` for cross-cutting data shapes.
 */

import { Database } from "@/integrations/supabase/types";

// ─── Supabase row aliases ────────────────────────────────────────────────────

/** Full customer row from the `customers` table. */
export type Customer = Database["public"]["Tables"]["customers"]["Row"];

/** Full product row from the `products` table. */
export type Product = Database["public"]["Tables"]["products"]["Row"];

/** Full profile row from the `profiles` table. */
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/** Full supplier row from the `suppliers` table. */
export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];

// ─── Product with joined category ────────────────────────────────────────────

/** Product row with the `categories` relation joined (select: "*, categories(name, color, icon)"). */
export interface ProductWithCategory extends Product {
  categories?: {
    name: string;
    color: string | null;
    icon: string | null;
  } | null;
}

/** Product row with minimal category join used on the Dashboard (stock alerts). */
export interface ProductWithCategoryIcon extends Product {
  categories?: {
    icon: string | null;
  } | null;
}

// ─── Supabase Edge Function response shapes ──────────────────────────────────

/** Generic shape returned by Supabase Edge Functions (invoke). */
export interface EdgeFunctionResponse {
  error?: string;
  message?: string;
  [key: string]: unknown;
}

/** Response from admin-create-user / admin-manage-user / redeem-reset-token. */
export type AdminActionResponse = EdgeFunctionResponse;

/** Response from admin-send-reset-link (includes optional link fields). */
export interface ResetLinkResponse extends EdgeFunctionResponse {
  actionLink?: string;
  manualLink?: string;
}

// ─── Sync conflict ───────────────────────────────────────────────────────────

/** Row from the `sync_conflicts` table with typed data columns. */
export interface SyncConflictRow {
  id: string;
  entity_type: string;
  entity_label: string | null;
  device_id: string | null;
  local_data: Record<string, unknown>;
  remote_data: Record<string, unknown>;
  resolved_data: Record<string, unknown>;
  resolution_strategy: string;
  status: string;
  error_message: string | null;
  acknowledged: boolean;
  created_at: string;
}

// ─── Audit log ───────────────────────────────────────────────────────────────

/** Row from the `user_audit_log` table. */
export interface AuditLogEntry {
  id: string;
  actor_name: string | null;
  actor_id: string | null;
  target_user_name: string | null;
  target_user_id: string | null;
  action: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

// ─── RPC return types (Supabase RPCs are not in generated types) ────────────

/** Return type of the `get_product_stats` RPC. */
export interface ProductStatsRpc {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  categoryCounts: Record<string, number>;
}

/** Return type of a single row from the `get_categories` RPC. */
export interface CategoryRpcRow {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  description: string | null;
  sort_order: number | null;
  is_default: boolean | null;
  product_count: number;
}

/** Return type of the `get_customer_stats` RPC. */
export interface CustomerStatsRpc {
  totalCustomers: number;
  totalCredit: number;
  customersWithCredit: number;
}

/** Return type of the `get_expense_stats` RPC. */
export interface ExpenseStatsRpc {
  monthTotal: number;
  monthCount: number;
}

/** Return type of the `adjust_product_stock` RPC (single row). */
export interface AdjustStockRpcRow {
  new_quantity: number;
}

/** Return type of the `get_supplier_stats` RPC. */
export interface SupplierStatsRpc {
  totalSuppliers: number;
  activeSuppliers: number;
  totalProducts: number;
  totalSupplyValue: number;
}

/** A product row from the `get_supplier_with_products` RPC. */
export interface SupplierProductRpcRow {
  id: string;
  product_id: string;
  product_name: string;
  product_barcode: string | null;
  product_unit: string | null;
  supply_price: number | null;
  min_quantity: number;
  current_stock: number;
  notes: string | null;
  is_active: boolean;
}

// ─── Customer update mutation params ─────────────────────────────────────────

/** Params for the customer update mutation (id + partial fields). */
export interface CustomerUpdateParams {
  id: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

// ─── Supplier update mutation params ─────────────────────────────────────────

/** Params for the supplier update mutation (id + partial fields). */
export interface SupplierUpdateParams {
  id: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

// ─── Supplier with product stats ─────────────────────────────────────────────

/** Supplier row with aggregated product statistics. */
export interface SupplierWithStats extends Supplier {
  product_count?: number;
  total_stock_value?: number;
}
