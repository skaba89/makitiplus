import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const gate = readFileSync("scripts/admin/audit_purchase_receipt_cutover.sql.example", "utf8");
const candidate = readFileSync("scripts/admin/receive_purchase_order_once.sql.example", "utf8");

describe("Purchase order receipt deployment gate — review-only", () => {
  it("checks the new RPC, receipt ledger and strict ledger RLS", () => {
    expect(gate).toMatch(/new_idempotent_rpc_present/);
    expect(gate).toMatch(/receive_purchase_order_once\(uuid,jsonb,uuid,text\)/);
    expect(gate).toMatch(/receipt_ledger_present/);
    expect(gate).toMatch(/relrowsecurity AND relforcerowsecurity/);
  });

  it("blocks direct client access to the ledger and anonymous RPC access", () => {
    expect(gate).toMatch(/has_table_privilege\('authenticated',ledger,'SELECT'\)/);
    expect(gate).toMatch(/has_table_privilege\('authenticated',ledger,'INSERT'\)/);
    expect(gate).toMatch(/has_function_privilege\('anon',once_rpc,'EXECUTE'\)/);
  });

  it("verifies both historical RPC overloads cannot bypass deduplication", () => {
    expect(gate).toMatch(/receive_purchase_order\(uuid,jsonb\)'/);
    expect(gate).toMatch(/receive_purchase_order\(uuid,jsonb,text\)'/);
    expect(gate).toMatch(/legacy_2_authenticated_denied/);
    expect(gate).toMatch(/legacy_3_authenticated_denied/);
  });

  it("does not modify production grants or migrations", () => {
    expect(gate).not.toMatch(/^\s*(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE|TRUNCATE|COMMIT)\b/im);
    expect(gate).toMatch(/SELECT check_id,passed,details/);
    expect(candidate).toMatch(/Critical rollout blocker/);
  });
});
