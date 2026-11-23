import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("scripts/admin/receive_purchase_order_guard.sql.example", "utf8");

describe("Purchase order SQL guard candidate — structural review", () => {
  it("keeps the existing API and checks authenticated tenant and receiver role", () => {
    expect(sql).toMatch(/FUNCTION public\.receive_purchase_order\(/i);
    expect(sql).toMatch(/p_received_items jsonb/i);
    expect(sql).toMatch(/p_notes text DEFAULT NULL/i);
    expect(sql).toMatch(/auth\.uid\(\)/);
    expect(sql).toMatch(/is_member_of_organization\(v_org_id\)/);
    expect(sql).toMatch(/ur\.role IN \('admin','manager'\)/);
  });

  it("serializes each purchase order before processing and rejects closed orders", () => {
    expect(sql).toMatch(/WHERE id = p_order_id AND organization_id = v_org_id FOR UPDATE/);
    expect(sql).toMatch(/v_order\.status NOT IN \('sent','confirmed','partial'\)/);
    expect(sql).toMatch(/jsonb_typeof\(p_received_items\)/);
  });

  it("validates order lines, duplicates, outstanding quantity and store scope", () => {
    expect(sql).toMatch(/v_product_id=ANY\(v_seen\)/);
    expect(sql).toMatch(/count\(\*\) FROM public\.purchase_order_items/);
    expect(sql).toMatch(/v_line\.quantity_ordered - COALESCE\(v_line\.quantity_received,0\)/);
    expect(sql).toMatch(/store_id IS NOT DISTINCT FROM v_order\.store_id/);
    expect(sql).toMatch(/RAISE EXCEPTION 'Produit hors organisation ou boutique'/);
  });

  it("does not pretend to guarantee partial receipt idempotency", () => {
    expect(sql).toMatch(/Remaining P0: incremental replay has no stable receipt UUID/);
    expect(sql).not.toMatch(/CREATE TABLE/);
    expect(sql).not.toMatch(/\bCOMMIT\s*;/i);
  });
});
