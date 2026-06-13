import { describe, it, expect } from "vitest";
import { buildProductSearchIndex } from "@/lib/productSearchIndex";
import { computeTax } from "@/lib/taxUtils";

describe("buildProductSearchIndex", () => {
  const products = [
    { id: "1", name: "Coca Cola 33cl", barcode: "5449000000996" },
    { id: "2", name: "Coca Zéro 50cl", barcode: "5449000054227" },
    { id: "3", name: "Pepsi Max", barcode: "1234567890123" },
    { id: "4", name: "Café Nescafé", barcode: null },
    { id: "5", name: "Fanta Orange", barcode: "9876543210987" },
  ];

  it("finds products by name prefix", () => {
    const idx = buildProductSearchIndex(products);
    const r = idx.search("coc");
    expect(r.length).toBe(2);
    expect(r.map((p) => p.id).sort()).toEqual(["1", "2"]);
  });

  it("ranks exact prefix higher than substring", () => {
    const idx = buildProductSearchIndex(products);
    const r = idx.search("coca");
    expect(r[0].name.toLowerCase().startsWith("coca")).toBe(true);
  });

  it("finds products by barcode prefix", () => {
    const idx = buildProductSearchIndex(products);
    const r = idx.search("54490");
    expect(r.length).toBe(2);
  });

  it("is accent-insensitive", () => {
    const idx = buildProductSearchIndex(products);
    const r = idx.search("cafe");
    expect(r.some((p) => p.id === "4")).toBe(true);
  });

  it("returns empty for empty query", () => {
    const idx = buildProductSearchIndex(products);
    expect(idx.search("")).toEqual([]);
  });

  it("respects limit", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      name: `Produit ${i}`,
    }));
    const idx = buildProductSearchIndex(many);
    expect(idx.search("produit", 5).length).toBe(5);
  });
});

describe("computeTax", () => {
  it("returns no tax when rate is 0", () => {
    const t = computeTax(1000, null, 0);
    expect(t.rate).toBe(0);
    expect(t.ht).toBe(1000);
    expect(t.ttc).toBe(1000);
    expect(t.taxAmount).toBe(0);
  });

  it("computes HT from TTC with org rate", () => {
    const t = computeTax(1180, null, 18);
    expect(t.rate).toBe(18);
    expect(t.ttc).toBe(1180);
    expect(Math.round(t.ht)).toBe(1000);
    expect(Math.round(t.taxAmount)).toBe(180);
  });

  it("product rate overrides org rate", () => {
    const t = computeTax(1100, 10, 18);
    expect(t.rate).toBe(10);
    expect(Math.round(t.ht)).toBe(1000);
  });

  it("treats negative rate as 0", () => {
    const t = computeTax(500, -5, 0);
    expect(t.rate).toBe(0);
    expect(t.ht).toBe(500);
  });
});
