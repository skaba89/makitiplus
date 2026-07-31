import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * "Mobile money manuel" (audit stratégique, docs/production/
 * STRATEGIC_AUDIT_AFRICA_WORLD_LEADER.md §3.3) — payment_method n'était
 * qu'une étiquette (wave/orange_money/mtn_money/moov_money/mpesa) sans
 * aucune trace du numéro de transaction envoyé par l'opérateur. Ajout
 * d'un champ de référence optionnel, saisi manuellement par le vendeur
 * (aucune intégration API opérateur réelle).
 *
 * Découvert au passage : mtn_money/moov_money/mpesa étaient sélectionnables
 * (payment_method enum + country.mobilePayments, dont la Guinée --
 * marché pilote -- qui inclut mtn_money) mais n'avaient AUCUN
 * TabsContent dans POSPaymentDialog.tsx -- un vendeur qui sélectionnait
 * ces onglets voyait un contenu vide. Corrigé au même endroit que
 * l'ajout de la référence, avec un bloc générique au lieu de dupliquer
 * un TabsContent par méthode.
 */

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260731020000_add_mobile_money_payment_reference.sql"
);
// Normalise CRLF -> LF : git peut checkouter ces fichiers avec des fins de
// ligne CRLF sur Windows (core.autocrlf), ce qui casserait les regex/split
// sur \n ci-dessous si on ne normalisait pas d'abord.
const readNormalized = (p: string) => fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n");

const migrationSql = readNormalized(
  path.join(process.cwd(), "supabase/migrations/20260731020000_add_mobile_money_payment_reference.sql")
);

const dialogSrc = readNormalized(path.join(process.cwd(), "src/components/pos/POSPaymentDialog.tsx"));

const hookSrc = readNormalized(path.join(process.cwd(), "src/hooks/useOfflineSale.ts"));

const posSrc = readNormalized(path.join(process.cwd(), "src/pages/POS.tsx"));

describe("Migration 20260731020000 — payment_reference additive", () => {
  it("ajoute une colonne NULLABLE (pas de DEFAULT contraignant, pas de NOT NULL)", () => {
    expect(migrationSql).toMatch(/ADD COLUMN IF NOT EXISTS payment_reference TEXT/);
    expect(migrationSql).not.toMatch(/payment_reference TEXT NOT NULL/);
  });

  it("ne contient aucune instruction destructive", () => {
    expect(migrationSql).not.toMatch(/\bTRUNCATE\b/i);
    expect(migrationSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migrationSql).not.toMatch(/DROP\s+TABLE/i);
    expect(migrationSql).not.toMatch(/DROP\s+COLUMN/i);
  });

  it("DROP FUNCTION précède chaque CREATE OR REPLACE (évite la duplication d'overload)", () => {
    // Pattern déjà établi dans ce dépôt (20260712120000, 20260712195000,
    // 20260720150000) : ajouter un paramètre en fin de liste sans DROP
    // préalable crée une DEUXIÈME fonction surchargée au lieu de
    // remplacer l'existante, ce qui rend les appels RPC nommés ambigus
    // ("function is not unique") pour PostgREST.
    const fullSaleDropIndex = migrationSql.indexOf("DROP FUNCTION IF EXISTS public.create_full_sale");
    const fullSaleCreateIndex = migrationSql.indexOf("CREATE OR REPLACE FUNCTION public.create_full_sale");
    expect(fullSaleDropIndex).toBeGreaterThan(-1);
    expect(fullSaleDropIndex).toBeLessThan(fullSaleCreateIndex);

    const withLimitDropIndex = migrationSql.indexOf("DROP FUNCTION IF EXISTS public.create_sale_with_limit");
    const withLimitCreateIndex = migrationSql.indexOf("CREATE OR REPLACE FUNCTION public.create_sale_with_limit");
    expect(withLimitDropIndex).toBeGreaterThan(-1);
    expect(withLimitDropIndex).toBeLessThan(withLimitCreateIndex);
  });

  it("p_payment_reference est ajouté EN DERNIÈRE position avec DEFAULT NULL (rétrocompatible)", () => {
    const fullSaleSig = migrationSql.match(/CREATE OR REPLACE FUNCTION public\.create_full_sale\(([\s\S]*?)\)\s*\nRETURNS/)?.[1] ?? "";
    const params = fullSaleSig.trim().split(/,\n/).map((p) => p.trim()).filter(Boolean);
    expect(params[params.length - 1]).toMatch(/^p_payment_reference TEXT DEFAULT NULL$/);

    const withLimitSig = migrationSql.match(/CREATE OR REPLACE FUNCTION public\.create_sale_with_limit\(([\s\S]*?)\)\s*\nRETURNS/)?.[1] ?? "";
    const limitParams = withLimitSig.trim().split(/,\n/).map((p) => p.trim()).filter(Boolean);
    expect(limitParams[limitParams.length - 1]).toMatch(/^p_payment_reference TEXT DEFAULT NULL$/);
  });

  it("create_sale_with_limit relaie p_payment_reference à create_full_sale", () => {
    const callBlock = migrationSql.match(/v_sale_id := public\.create_full_sale\(([\s\S]*?)\);/)?.[1] ?? "";
    expect(callBlock).toMatch(/p_payment_reference/);
  });

  it("une chaîne vide/blanche est stockée comme NULL (NULLIF + TRIM), pas comme chaîne vide", () => {
    expect(migrationSql).toMatch(/NULLIF\(TRIM\(p_payment_reference\), ''\)/);
  });

  it("les GRANT EXECUTE couvrent les nouvelles signatures (16 et 14 arguments)", () => {
    const grants = migrationSql.match(/GRANT EXECUTE ON FUNCTION[\s\S]*?TO authenticated;/g) ?? [];
    expect(grants.length).toBeGreaterThanOrEqual(2);
    for (const grant of grants) {
      expect(grant).toMatch(/TEXT\s*\n?\)\s*TO authenticated;$/);
    }
  });
});

describe("POSPaymentDialog.tsx — champ référence + méthodes mobile money manquantes", () => {
  it("expose paymentReference dans la signature onConfirm", () => {
    expect(dialogSrc).toMatch(/paymentReference\?:\s*string/);
  });

  it("ne propose le champ référence que pour les méthodes mobile money (pas cash/card/credit)", () => {
    expect(dialogSrc).toMatch(/MOBILE_MONEY_METHODS\.has\(paymentMethod\)/);
  });

  it("couvre les 5 méthodes mobile money (wave/orange_money/mtn_money/moov_money/mpesa)", () => {
    for (const method of ["wave", "orange_money", "mtn_money", "moov_money", "mpesa"]) {
      expect(dialogSrc).toMatch(new RegExp(`["']${method}["']`));
    }
  });

  it("un TabsContent existe désormais pour chaque méthode mobile money (bug pré-existant corrigé)", () => {
    // Avant ce fix, seuls "wave" et "orange_money" avaient un TabsContent
    // dédié -- mtn_money/moov_money/mpesa (sélectionnables via
    // country.mobilePayments, dont la Guinée pour mtn_money) affichaient
    // un onglet vide. Le nouveau bloc générique .map() sur
    // MOBILE_MONEY_METHODS couvre les 5.
    expect(dialogSrc).toMatch(/paymentMethods\s*\n?\s*\.filter\(\(method\) => MOBILE_MONEY_METHODS\.has\(method\.value\)\)/);
  });

  it("réinitialise/trim la valeur saisie avant de la transmettre (pas de chaîne vide)", () => {
    expect(dialogSrc).toMatch(/paymentReference\.trim\(\)\s*\|\|\s*undefined/);
  });
});

describe("useOfflineSale.ts — paymentReference câblé en ligne ET hors-ligne", () => {
  it("le chemin en ligne transmet p_payment_reference à create_sale_with_limit", () => {
    const onlineRpcCall = hookSrc.match(/supabase\.rpc\("create_sale_with_limit",\s*\{([\s\S]*?)\}\);/)?.[1] ?? "";
    expect(onlineRpcCall).toMatch(/p_payment_reference:\s*paymentReference/);
  });

  it("le chemin hors-ligne inclut p_payment_reference dans la mutation mise en file", () => {
    const offlineEnqueue = hookSrc.match(/enqueueRPCMutation\(\{\s*rpcName:\s*"create_sale_with_limit",\s*data:\s*\{([\s\S]*?)\},\s*\n\s*userId/)?.[1] ?? "";
    expect(offlineEnqueue).toMatch(/p_payment_reference:\s*paymentReference/);
  });

  it("le select() de la vente en ligne inclut payment_reference (pour le reçu)", () => {
    expect(hookSrc).toMatch(/\.select\("id, sale_number, payment_method, amount_paid, customer_name, customer_phone, payment_reference"\)/);
  });

  it("la référence apparaît dans les données du reçu (receiptData)", () => {
    expect(hookSrc).toMatch(/paymentReference:\s*result\.sale\.payment_reference\s*\|\|\s*undefined/);
  });
});

describe("POS.tsx — la référence transite jusqu'à createSaleMutation", () => {
  it("le callback onConfirm accepte et transmet paymentReference", () => {
    const onConfirmBlock = posSrc.match(/onConfirm=\{[\s\S]*?paymentReference[\s\S]*?\}\}/)?.[0] ?? "";
    expect(onConfirmBlock).toMatch(/paymentReference/);
    expect(onConfirmBlock).toMatch(/createSaleMutation\.mutate\(\{[\s\S]*?paymentReference,/);
  });
});
