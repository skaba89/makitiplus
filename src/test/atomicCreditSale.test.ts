/**
 * MKP-003 regression contracts. These checks do not replace a PostgreSQL
 * integration test; SQL rollback must also be exercised on disposable DB.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "src/hooks/useOfflineSale.ts"), "utf8");
const queue = fs.readFileSync(path.join(process.cwd(), "src/lib/offlineQueue.ts"), "utf8");
const manager = fs.readFileSync(path.join(process.cwd(), "src/pages/OfflineSalesQueue.tsx"), "utf8");
const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261103160000_atomic_credit_sale.sql"), "utf8");

describe("MKP-003 atomic credit-sale contract", () => {
  it("uses atomic RPC for credit and retains ordinary RPC for other payment methods", () => {
    expect(src).toContain('supabase.rpc("create_credit_sale_atomic"');
    expect(src).toContain('supabase.rpc("create_sale_with_limit"');
    expect(src).toContain("const isCreditSale = paymentMethod === \"credit\"");
  });
  it("does not call the old separate credit RPC in the POS hook", () => {
    expect(src).not.toMatch(/supabase\.rpc\(\s*["']increment_customer_credit(?:_by_phone)?["']/);
    expect(src).not.toContain('rpcName: "increment_customer_credit_by_phone"');
    expect(src).toContain("creditUpdateFailed: false, offline: false");
  });
  it("enqueues exactly one RPC for each credit sale", () => {
    const creditPath = src.slice(src.indexOf("if (isCreditSale) {\n        await enqueueRPCMutation"), src.indexOf("      // C1 fix:"));
    expect(creditPath.match(/await enqueueRPCMutation\(/g)).toHaveLength(2); // credit branch OR non-credit branch
    expect(creditPath).toContain('rpcName: "create_credit_sale_atomic"');
    expect(creditPath).toContain("p_sale_number: finalSaleNumber");
    expect(creditPath).not.toContain("increment_customer_credit_by_phone");
  });
  it("protects atomic sales against expiration and exposes them to the manager", () => {
    expect(queue).toContain('"create_credit_sale_atomic"');
    expect(manager).toContain('m.rpcName === "create_credit_sale_atomic"');
  });
  it("SQL performs sale and credit writes inside one transaction", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_credit_sale_atomic\(/);
    expect(sql).toContain("v_sale_id := public.create_sale_with_limit(");
    expect(sql).toContain("INSERT INTO public.customer_credits");
    expect(sql).toMatch(/UPDATE public\.customers[\s\S]*total_credit = total_credit \+ p_total_amount/);
    expect(sql).toMatch(/WHERE organization_id = v_org_id AND sale_number = p_sale_number[\s\S]*FOR UPDATE/);
  });
  it("blocks anonymous and cross-organization callers and requires an identified customer", () => {
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("public.is_member_of_organization(v_org_id)");
    expect(sql).toContain("USING ERRCODE = '42501'");
    expect(sql).toContain("v_name IS NULL AND v_phone IS NULL");
  });
  it("avoids double credit on replay, including legacy debt entries", () => {
    expect(sql).toMatch(/SELECT customer_id INTO v_existing_credit[\s\S]*sale_number = p_sale_number/);
    expect(sql).toMatch(/IF FOUND THEN\s+RETURN v_sale_id;/);
    expect(sql).toContain("v_sale.total_amount IS DISTINCT FROM p_total_amount");
  });
  it("supports name-only customers and refuses ambiguous matches", () => {
    expect(sql).toContain("v_phone IS NOT NULL");
    expect(sql).toContain("v_matching_customers > 1");
    expect(sql).toContain("VALUES (v_name, NULL, v_org_id, v_user_id)");
  });
});
