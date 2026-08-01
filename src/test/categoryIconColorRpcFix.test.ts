import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * "Je veux plus d'icônes dans la catégorie des produits car quand je
 * sélectionne une image de catégorie il me met sur le carton par défaut
 * après enregistrement."
 *
 * Cause racine : la migration 20260708090000_fix_all_returns_table_rpcs.sql
 * a redéfini get_categories() en perdant les colonnes icon/color/is_default
 * (présentes dans la version précédente, 20260702090000). useCategories.ts
 * fait `c.icon || "Package"` sur le résultat de la RPC -- comme la RPC ne
 * renvoie plus jamais `icon`, TOUTES les catégories retombaient sur
 * l'icône "carton" (Package), pas seulement celle qu'on venait de modifier.
 * Le bug était juste plus visible juste après enregistrement, car
 * invalidateQueries force un refetch immédiat via cette RPC cassée.
 *
 * Vérifié en direct sur le compte réel Diallo & Frères (transaction
 * BEGIN/ROLLBACK) : les 10 catégories réelles ont bien icon/color en
 * base, et avec le fix les 10 reviennent correctement via la RPC
 * (avant le fix, 0/10 -- confirmé par la définition encore déployée
 * en prod au moment du diagnostic : RETURNS TABLE(id, name,
 * description, sort_order, product_count), sans icon/color/is_default).
 */

const migrationSql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260801020000_fix_get_categories_missing_icon_color.sql"),
  "utf-8"
);

describe("Migration 20260801020000 — get_categories renvoie de nouveau icon/color/is_default", () => {
  it("le RETURNS TABLE inclut icon, color et is_default", () => {
    const returnsBlock = migrationSql.match(/RETURNS TABLE \([\s\S]*?\)/)?.[0] ?? "";
    expect(returnsBlock).toMatch(/\bicon TEXT\b/);
    expect(returnsBlock).toMatch(/\bcolor TEXT\b/);
    expect(returnsBlock).toMatch(/\bis_default BOOLEAN\b/);
  });

  it("le SELECT interne renvoie bien c.icon, c.color et c.is_default", () => {
    const selectBlock = migrationSql.match(/SELECT\s+c\.id[\s\S]*?FROM public\.categories c/)?.[0] ?? "";
    expect(selectBlock).toMatch(/c\.icon/);
    expect(selectBlock).toMatch(/c\.color/);
    expect(selectBlock).toMatch(/c\.is_default/);
  });

  it("reste scopé à l'organisation de l'appelant (pas de fuite cross-tenant)", () => {
    expect(migrationSql).toMatch(/WHERE c\.organization_id = public\.get_user_organization_id\(\)/);
  });

  it("est SECURITY DEFINER (nécessaire pour accéder à get_user_organization_id() de façon fiable)", () => {
    expect(migrationSql).toMatch(/SECURITY DEFINER/);
  });

  it("ne contient aucune instruction destructive", () => {
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(migrationSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migrationSql).not.toMatch(/DROP\s+TABLE/i);
  });
});

describe("useCategories.ts — le contrat CategoryRpcRow attend icon/color/is_default", () => {
  const hookSrc = fs.readFileSync(path.join(process.cwd(), "src/hooks/useCategories.ts"), "utf-8");
  const typesSrc = fs.readFileSync(path.join(process.cwd(), "src/types/index.ts"), "utf-8");

  it("le hook mappe c.icon et c.color depuis la ligne RPC", () => {
    expect(hookSrc).toMatch(/icon:\s*c\.icon/);
    expect(hookSrc).toMatch(/color:\s*c\.color/);
  });

  it("CategoryRpcRow déclare icon, color et is_default", () => {
    const rpcRowBlock = typesSrc.match(/export interface CategoryRpcRow \{[\s\S]*?\}/)?.[0] ?? "";
    expect(rpcRowBlock).toMatch(/icon: string \| null/);
    expect(rpcRowBlock).toMatch(/color: string \| null/);
    expect(rpcRowBlock).toMatch(/is_default: boolean \| null/);
  });
});

describe("Plus d'icônes disponibles pour les catégories (demande utilisateur)", () => {
  const categoryIconSrc = fs.readFileSync(path.join(process.cwd(), "src/components/ui/category-icon.tsx"), "utf-8");
  const categoriesPageSrc = fs.readFileSync(path.join(process.cwd(), "src/pages/Categories.tsx"), "utf-8");

  it("ICON_MAP contient largement plus que les 12 icônes d'origine", () => {
    const mapBlock = categoryIconSrc.match(/const ICON_MAP:[\s\S]*?\};/)?.[0] ?? "";
    const iconNames = Array.from(mapBlock.matchAll(/^\s*(\w+),?$/gm)).map((m) => m[1]);
    expect(iconNames.length).toBeGreaterThanOrEqual(30);
  });

  it("chaque icône listée dans PRESET_ICONS (Categories.tsx) est bien importée/mappée dans category-icon.tsx", () => {
    const presetMatch = categoriesPageSrc.match(/const PRESET_ICONS = \[([\s\S]*?)\];/)?.[1] ?? "";
    const presetIcons = Array.from(presetMatch.matchAll(/"(\w+)"/g)).map((m) => m[1]);
    expect(presetIcons.length).toBeGreaterThanOrEqual(30);
    for (const iconName of presetIcons) {
      expect(categoryIconSrc, `icône '${iconName}' utilisée dans PRESET_ICONS mais absente de category-icon.tsx`).toMatch(
        new RegExp(`\\b${iconName}\\b`)
      );
    }
  });
});
