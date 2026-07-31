import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Écart trouvé lors de l'audit systématique des feature flags (audit
 * stratégique, docs/production/STRATEGIC_AUDIT_AFRICA_WORLD_LEADER.md
 * §3.5) : `advanced_reports` existe comme feature_key payant
 * (croissance+) mais Reports.tsx n'appliquait aucune distinction --
 * ProductKpisCard/CategoryKpisCard/SellerKpisCard étaient visibles à
 * tous les plans, y compris starter. Vérifié zéro régression réelle
 * avant correction : le seul abonné starter réel (org "KFM Groupe") a
 * 0 vente/0 produit/0 vendeur, donc aucun usage actif de ce contenu.
 */

const src = fs.readFileSync(path.join(process.cwd(), "src/pages/Reports.tsx"), "utf-8");

describe("Reports.tsx — advanced_reports gate les KPI détaillés", () => {
  it("ProductKpisCard/CategoryKpisCard/SellerKpisCard sont dans un FeatureGate('advanced_reports')", () => {
    const gateBlock = src.match(/<FeatureGate\s+feature="advanced_reports"[\s\S]*?<\/FeatureGate>/)?.[0] ?? "";
    expect(gateBlock).not.toBe("");
    expect(gateBlock).toMatch(/<ProductKpisCard\s*\/>/);
    expect(gateBlock).toMatch(/<CategoryKpisCard\s*\/>/);
    expect(gateBlock).toMatch(/<SellerKpisCard\s*\/>/);
  });

  it("EnhancedDashboardStats (basic_reports, tous plans) reste EN DEHORS du gate", () => {
    const gateBlock = src.match(/<FeatureGate\s+feature="advanced_reports"[\s\S]*?<\/FeatureGate>/)?.[0] ?? "";
    expect(gateBlock).not.toMatch(/EnhancedDashboardStats/);
    expect(src).toMatch(/<EnhancedDashboardStats\s*\/>/);
  });

  it("fournit un fallback d'upsell (pas un écran vide silencieux pour un plan non éligible)", () => {
    const gateBlock = src.match(/<FeatureGate\s+feature="advanced_reports"[\s\S]*?<\/FeatureGate>/)?.[0] ?? "";
    expect(gateBlock).toMatch(/fallback=\{/);
    expect(gateBlock).toMatch(/navigate\("\/dashboard\/billing"\)/);
  });
});
