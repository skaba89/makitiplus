import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("scripts/admin/receive_purchase_order_once.sql.example", "utf8");

describe("Supplier receipts — review-only idempotency ledger contract", () => {
  it("requires a stable receipt UUID and authenticates tenant and actor", () => {
    expect(sql).toMatch(/p_receipt_id uuid/);
    expect(sql).toMatch(/p_receipt_id IS NULL/);
    expect(sql).toMatch(/v_actor_id := auth\.uid\(\)/);
    expect(sql).toMatch(/is_member_of_organization\(v_org_id\)/);
    expect(sql).toMatch(/role IN \('admin', 'manager'\)/);
  });

  it("keeps the receipt ledger private and keyed globally by receipt ID", () => {
    expect(sql).toMatch(/receipt_id uuid PRIMARY KEY/);
    expect(sql).toMatch(/request_payload jsonb NOT NULL/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON public\.purchase_order_receipt_requests FROM PUBLIC, anon, authenticated/);
  });

  it("locks the parent order, validates the saved request and only then returns success", () => {
    expect(sql).toMatch(/WHERE id=p_order_id AND organization_id=v_org_id FOR UPDATE/);
    expect(sql).toMatch(/receipt_id=p_receipt_id FOR UPDATE/);
    for (const field of ["organization_id", "purchase_order_id", "actor_id", "request_payload"]) {
      expect(sql).toContain("v_existing." + field + " IS DISTINCT FROM");
    }
    expect(sql).toMatch(/Conflit de rejeu de réception/);
    expect(sql).toMatch(/PERFORM public\.receive_purchase_order\(p_order_id,p_received_items,p_notes\)/);
  });

  it("explicitly flags the unprotected legacy entry point as rollout blocker", () => {
    expect(sql).toMatch(/Critical rollout blocker/);
    expect(sql).not.toMatch(/REVOKE EXECUTE ON FUNCTION public\.receive_purchase_order\(uuid,jsonb,text\)/);
    expect(sql).not.toMatch(/\bCOMMIT\s*;/i);
  });
});
