/**
 * Export PDF de clôture de caisse — audit final hardening (2e prompt, P1).
 *
 * Génère un PDF A4 propre à partir du résumé retourné par le RPC
 * get_cash_closing_summary (voir CashSummary dans CashClosing.tsx).
 * Reprend le même contenu que le reçu HTML imprimable (handlePrint) mais
 * en PDF téléchargeable/partageable, avec le même moteur (jsPDF +
 * ensurePdfFont pour le support Unicode français/africain) que
 * receiptGenerator.ts.
 *
 * Ce module est délibérément agnostique i18n : toutes les chaînes
 * affichées sont passées par l'appelant via `labels` (même principe que
 * les autres utilitaires purs du dossier utils/) -- CashClosing.tsx reste
 * la seule source de vérité pour les traductions (namespace "cashClosing").
 */

export interface CashClosingPdfPaymentRow {
  method: string;
  label: string;
  amount: number;
}

export interface CashClosingPdfLabels {
  title: string;
  storeLabel: string;
  sellerLabel: string;
  approverLabel: string;
  openingLabel: string;
  closingLabel: string;
  statusLabel: string;
  paymentMethodColumn: string;
  amountColumn: string;
  totalSalesLabel: string;
  expensesLabel: string;
  expectedCashLabel: string;
  actualCashLabel: string;
  gapLabel: string;
  gapPerfect: string;
  notesLabel: string;
  generatedAtLabel: string;
  footerText: string;
}

export interface CashClosingPdfData {
  businessName: string;
  storeName?: string | null;
  sellerName?: string | null;
  approverName?: string | null;
  openedAt: string;
  closedAt: string | null;
  status: string;
  paymentBreakdown: CashClosingPdfPaymentRow[];
  totalSales: number;
  totalExpenses: number;
  expectedCash: number;
  actualCash: number | null;
  cashDifference: number | null;
  notes?: string | null;
  formatPrice: (amount: number) => string;
  formatDate: (iso: string) => string;
  labels: CashClosingPdfLabels;
}

export const generateCashClosingPDF = async (data: CashClosingPdfData) => {
  const { default: jsPDF } = await import("jspdf");
  const { ensurePdfFont, setPdfFont } = await import("@/utils/pdfFont");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await ensurePdfFont(doc);

  const { labels, formatPrice, formatDate } = data;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = 20;

  // ─── En-tête ─────────────────────────────────────────
  doc.setFontSize(18);
  setPdfFont(doc, "bold");
  doc.setTextColor(249, 115, 22); // orange (cohérent avec le reçu HTML #F97316)
  doc.text(labels.title, margin, y);
  doc.setTextColor(0);
  y += 8;

  doc.setFontSize(11);
  setPdfFont(doc, "normal");
  doc.text(data.businessName, margin, y);
  y += 6;

  const infoLine = (label: string, value: string) => {
    setPdfFont(doc, "bold");
    doc.text(`${label} :`, margin, y);
    setPdfFont(doc, "normal");
    doc.text(value, margin + doc.getTextWidth(`${label} : `), y);
    y += 6;
  };

  if (data.storeName) infoLine(labels.storeLabel, data.storeName);
  if (data.sellerName) infoLine(labels.sellerLabel, data.sellerName);
  infoLine(labels.statusLabel, data.status);
  infoLine(labels.openingLabel, formatDate(data.openedAt));
  infoLine(labels.closingLabel, data.closedAt ? formatDate(data.closedAt) : "—");
  if (data.approverName) infoLine(labels.approverLabel, data.approverName);

  y += 4;

  // ─── Tableau de répartition par mode de paiement ────
  const rows = data.paymentBreakdown.filter((r) => r.amount > 0);
  if (rows.length > 0) {
    const tableTop = y;
    const col1X = margin;
    const col2X = pageWidth - margin;

    doc.setFillColor(249, 115, 22);
    doc.rect(margin, y - 5, pageWidth - margin * 2, 7, "F");
    doc.setTextColor(255, 255, 255);
    setPdfFont(doc, "bold");
    doc.setFontSize(10);
    doc.text(labels.paymentMethodColumn, col1X + 2, y);
    doc.text(labels.amountColumn, col2X - 2, y, { align: "right" });
    doc.setTextColor(0);
    y += 7;

    setPdfFont(doc, "normal");
    for (const row of rows) {
      doc.text(row.label, col1X + 2, y);
      doc.text(formatPrice(row.amount), col2X - 2, y, { align: "right" });
      doc.setDrawColor(220);
      doc.line(margin, y + 2, pageWidth - margin, y + 2);
      y += 7;
    }
    doc.setDrawColor(0);
    doc.rect(margin, tableTop - 5, pageWidth - margin * 2, y - tableTop, "S");
    y += 4;
  }

  // ─── Totaux ──────────────────────────────────────────
  const totalLine = (label: string, value: string, bold = false) => {
    setPdfFont(doc, bold ? "bold" : "normal");
    doc.setFontSize(bold ? 13 : 11);
    doc.text(`${label} : ${value}`, pageWidth - margin, y, { align: "right" });
    y += bold ? 8 : 7;
  };

  totalLine(labels.totalSalesLabel, formatPrice(data.totalSales), true);
  totalLine(labels.expensesLabel, formatPrice(data.totalExpenses));
  totalLine(labels.expectedCashLabel, formatPrice(data.expectedCash));

  if (data.actualCash !== null) {
    totalLine(labels.actualCashLabel, formatPrice(data.actualCash));

    const diff = data.cashDifference ?? 0;
    const gapColor: [number, number, number] =
      diff === 0 ? [212, 237, 218] : diff > 0 ? [255, 243, 205] : [248, 215, 218];
    doc.setFillColor(...gapColor);
    doc.rect(margin, y - 5, pageWidth - margin * 2, 9, "F");
    setPdfFont(doc, "bold");
    doc.setFontSize(12);
    const gapText = `${labels.gapLabel} : ${diff === 0 ? labels.gapPerfect : formatPrice(diff)}`;
    doc.text(gapText, pageWidth / 2, y + 1, { align: "center" });
    y += 12;
  }

  // ─── Notes ───────────────────────────────────────────
  if (data.notes) {
    setPdfFont(doc, "bold");
    doc.setFontSize(10);
    doc.text(`${labels.notesLabel} :`, margin, y);
    y += 5;
    setPdfFont(doc, "normal");
    const splitNotes = doc.splitTextToSize(data.notes, pageWidth - margin * 2);
    doc.text(splitNotes, margin, y);
    y += splitNotes.length * 5 + 4;
  }

  // ─── Pied de page ────────────────────────────────────
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  setPdfFont(doc, "normal");
  doc.setTextColor(120);
  doc.text(`${labels.generatedAtLabel} : ${formatDate(new Date().toISOString())}`, margin, pageHeight - 15);
  doc.text(labels.footerText, margin, pageHeight - 10);
  doc.setTextColor(0);

  return doc;
};

export const downloadCashClosingPDF = async (data: CashClosingPdfData, filename: string): Promise<void> => {
  const doc = await generateCashClosingPDF(data);
  doc.save(filename);
};
