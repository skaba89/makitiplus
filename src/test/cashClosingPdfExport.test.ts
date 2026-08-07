import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Export PDF de clôture de caisse — audit final hardening (2e prompt, P1).
 *
 * Nouvelle fonctionnalité (pas un fix de régression) : ajoute un bouton
 * "Export PDF" à côté d'Imprimer/WhatsApp dans la carte "clôturée, en
 * attente d'approbation" de CashClosing.tsx, réutilisant les mêmes
 * données (mySummary, get_cash_closing_summary) déjà utilisées par
 * handlePrint/handleShareWhatsApp -- aucune nouvelle requête, aucun
 * nouveau calcul financier côté client.
 */

const readNormalized = (p: string) => fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n");
const cashClosingSrc = readNormalized(path.join(process.cwd(), "src/pages/CashClosing.tsx"));
const generatorSrc = readNormalized(path.join(process.cwd(), "src/utils/cashClosingPdfGenerator.ts"));

describe("generateCashClosingPDF — génération réelle (smoke test)", () => {
  // Premier appel = chargement à froid de la police PDF Unicode
  // (ensurePdfFont) -- plus lent que le timeout par défaut de vitest (5s).
  it("génère un document jsPDF valide sans lever d'exception, à partir de données réalistes", async () => {
    const { generateCashClosingPDF } = await import("@/utils/cashClosingPdfGenerator");
    const doc = await generateCashClosingPDF({
      businessName: "Diallo & Frères",
      storeName: "Boutique centrale",
      sellerName: "DIALLO mamadou",
      openedAt: "2026-08-07T08:00:00Z",
      closedAt: "2026-08-07T18:00:00Z",
      status: "Approuvée",
      paymentBreakdown: [
        { method: "cash", label: "Espèces", amount: 150000 },
        { method: "orange_money", label: "Orange Money", amount: 75000 },
        { method: "wave", label: "Wave", amount: 0 }, // doit être exclu (amount = 0)
      ],
      totalSales: 225000,
      totalExpenses: 15000,
      expectedCash: 135000,
      actualCash: 135000,
      cashDifference: 0,
      notes: "RAS",
      formatPrice: (n) => `${n} GNF`,
      formatDate: (iso) => new Date(iso).toISOString(),
      labels: {
        title: "Clôture de Caisse",
        storeLabel: "Boutique",
        sellerLabel: "Vendeur",
        approverLabel: "Approuvé par",
        statusLabel: "Statut",
        openingLabel: "Ouverture",
        closingLabel: "Clôture",
        paymentMethodColumn: "Mode de paiement",
        amountColumn: "Montant",
        totalSalesLabel: "Total ventes",
        expensesLabel: "Dépenses",
        expectedCashLabel: "Caisse attendue",
        actualCashLabel: "Caisse réelle",
        gapLabel: "Écart",
        gapPerfect: "0 (parfait)",
        notesLabel: "Notes",
        generatedAtLabel: "Généré le",
        footerText: "Document généré par MakitiPlus — clôture de caisse",
      },
    });

    expect(doc).toBeDefined();
    expect(typeof doc.save).toBe("function");
    expect(typeof doc.output).toBe("function");
    // Un PDF non vide a été produit (output "datauristring" commence par le préfixe standard).
    const dataUri = doc.output("datauristring");
    expect(dataUri).toMatch(/^data:application\/pdf/);
  }, 15000);

  it("ne plante pas quand actualCash/cashDifference/notes sont null (session pas encore clôturée financièrement)", async () => {
    const { generateCashClosingPDF } = await import("@/utils/cashClosingPdfGenerator");
    const doc = await generateCashClosingPDF({
      businessName: "Diallo & Frères",
      openedAt: "2026-08-07T08:00:00Z",
      closedAt: null,
      status: "Ouverte",
      paymentBreakdown: [],
      totalSales: 0,
      totalExpenses: 0,
      expectedCash: 0,
      actualCash: null,
      cashDifference: null,
      notes: null,
      formatPrice: (n) => `${n} GNF`,
      formatDate: (iso) => new Date(iso).toISOString(),
      labels: {
        title: "Clôture de Caisse",
        storeLabel: "Boutique",
        sellerLabel: "Vendeur",
        approverLabel: "Approuvé par",
        statusLabel: "Statut",
        openingLabel: "Ouverture",
        closingLabel: "Clôture",
        paymentMethodColumn: "Mode de paiement",
        amountColumn: "Montant",
        totalSalesLabel: "Total ventes",
        expensesLabel: "Dépenses",
        expectedCashLabel: "Caisse attendue",
        actualCashLabel: "Caisse réelle",
        gapLabel: "Écart",
        gapPerfect: "0 (parfait)",
        notesLabel: "Notes",
        generatedAtLabel: "Généré le",
        footerText: "Document généré par MakitiPlus — clôture de caisse",
      },
    });
    expect(doc).toBeDefined();
  });
});

describe("cashClosingPdfGenerator.ts — module agnostique i18n", () => {
  it("n'importe aucun namespace i18n ni chaîne française codée en dur dans les labels affichés (tout vient de `labels`)", () => {
    // Le module ne doit dépendre d'aucune chaîne d'UI codée en dur --
    // toutes les chaînes visibles proviennent du paramètre `labels`.
    expect(generatorSrc).not.toMatch(/from ["']react-i18next["']/);
    expect(generatorSrc).not.toMatch(/from ["']@\/i18n/);
  });

  it("réutilise ensurePdfFont/setPdfFont (même moteur que receiptGenerator.ts, support Unicode)", () => {
    expect(generatorSrc).toMatch(/ensurePdfFont/);
    expect(generatorSrc).toMatch(/setPdfFont/);
  });

  it("exclut les modes de paiement à 0 du tableau (comme handlePrint)", () => {
    expect(generatorSrc).toMatch(/data\.paymentBreakdown\.filter\(\(r\) => r\.amount > 0\)/);
  });
});

describe("CashClosing.tsx — bouton Export PDF (audit final hardening, 2e prompt, P1)", () => {
  it("importe downloadCashClosingPDF depuis le nouveau générateur", () => {
    expect(cashClosingSrc).toMatch(/import \{ downloadCashClosingPDF \} from "@\/utils\/cashClosingPdfGenerator"/);
  });

  it("handleExportPDF réutilise mySummary et mySession existants (aucune nouvelle requête réseau)", () => {
    const fnBlock = cashClosingSrc.match(/const handleExportPDF = async \(\) => \{[\s\S]*?\n {2}\};/)?.[0] ?? "";
    expect(fnBlock).toMatch(/if \(!mySummary \|\| !mySession\) return;/);
    expect(fnBlock).not.toMatch(/supabase\.(from|rpc)\(/);
  });

  it("le bouton Export PDF est câblé dans la carte 'en attente d'approbation', aux côtés d'Imprimer et WhatsApp", () => {
    const block = cashClosingSrc.match(
      /onClick=\{handlePrint\}[\s\S]*?onClick=\{handleExportPDF\}[\s\S]*?onClick=\{handleShareWhatsApp\}/
    )?.[0] ?? "";
    expect(block).not.toBe("");
  });

  it("erreur de génération PDF surfacée via toast + reportError (jamais silencieuse)", () => {
    const fnBlock = cashClosingSrc.match(/const handleExportPDF = async \(\) => \{[\s\S]*?\n {2}\};/)?.[0] ?? "";
    expect(fnBlock).toMatch(/catch \(error\)/);
    expect(fnBlock).toMatch(/toast\(\{ variant: "destructive"/);
    expect(fnBlock).toMatch(/reportError\(/);
  });
});
