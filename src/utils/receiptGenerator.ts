import jsPDF from "jspdf";

interface ReceiptItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export type ReceiptPaperSize = "58mm" | "80mm" | "A4";
export type ReceiptTemplate = "default" | "minimal" | "detailed" | "african";

export interface ReceiptData {
  saleNumber: string;
  date: Date;
  items: ReceiptItem[];
  subtotal: number;
  total: number;
  paymentMethod: string;
  amountPaid: number;
  change: number;
  customerName?: string;
  customerPhone?: string;
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  sellerName?: string;
  currencySymbol?: string;
  currencyPosition?: "before" | "after";
  logoUrl?: string | null;
  // Template & paper settings
  template?: ReceiptTemplate;
  paperSize?: ReceiptPaperSize;
  showLogo?: boolean;
  showTax?: boolean;
  footerText?: string;
  // Org info for detailed template
  organizationId?: string;
  taxRate?: number;
}

const paymentMethodLabels: Record<string, string> = {
  cash: "Espèces",
  wave: "Wave",
  orange_money: "Orange Money",
  mtn_money: "MTN Money",
  moov_money: "Moov Money",
  mpesa: "M-Pesa",
  card: "Carte bancaire",
  credit: "À crédit",
};

export const formatPriceWithCurrency = (
  price: number,
  symbol: string = "F",
  position: "before" | "after" = "after",
  forPdf: boolean = false
): string => {
  const hasDecimals = Math.abs(price - Math.round(price)) > 0.001;

  if (forPdf) {
    // jsPDF built-in fonts (Helvetica, Courier) cannot render Unicode spaces
    // (U+202F narrow no-break space, U+00A0 non-breaking space).
    // They appear as individual spaced characters or garbage.
    // Solution: use dot as thousand separator — widely used in Africa and 100% ASCII.
    const parts = Math.round(price).toString().split("");
    const neg = price < 0;
    if (neg) parts.shift(); // remove minus
    const digits = parts.reverse();
    const groups: string[] = [];
    for (let i = 0; i < digits.length; i++) {
      if (i > 0 && i % 3 === 0) groups.push(".");
      groups.push(digits[i]);
    }
    let intPart = groups.reverse().join("");
    if (neg) intPart = "-" + intPart;
    const formatted = hasDecimals
      ? intPart + "," + Math.abs(price - Math.round(price)).toFixed(2).substring(2)
      : intPart;
    return position === "before" ? `${symbol} ${formatted}` : `${formatted} ${symbol}`;
  }

  // For screen display (HTML) — full Unicode is fine
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(price);
  const cleanFormatted = formatted.replace(/[\u202F\u00A0]/g, " ");
  return position === "before" ? `${symbol} ${cleanFormatted}` : `${cleanFormatted} ${symbol}`;
};

// Legacy function for backward compatibility — uses F (display symbol) as default
export const formatPrice = (price: number): string => {
  return formatPriceWithCurrency(price, "F", "after");
};

// ─── Paper size configurations ─────────────────────────────────
const PAPER_CONFIGS: Record<ReceiptPaperSize, { width: number; defaultHeight: number; margin: number; baseFontSize: number; headerFontSize: number; titleFontSize: number }> = {
  "58mm": {
    width: 58,
    defaultHeight: 80,
    margin: 3,
    baseFontSize: 6.5,
    headerFontSize: 7.5,
    titleFontSize: 10,
  },
  "80mm": {
    width: 80,
    defaultHeight: 90,
    margin: 4,
    baseFontSize: 7.5,
    headerFontSize: 8.5,
    titleFontSize: 12,
  },
  A4: {
    width: 210,
    defaultHeight: 297,
    margin: 15,
    baseFontSize: 10,
    headerFontSize: 11,
    titleFontSize: 16,
  },
};

// ─── African template decorative helpers ───────────────────────
function drawAfricanBorder(doc: jsPDF, x: number, y: number, w: number, h: number, config: typeof PAPER_CONFIGS[ReceiptPaperSize]) {
  const m = config.margin;
  // Triangular pattern border (top and bottom)
  doc.setLineWidth(0.4);
  const triSize = config.width < 70 ? 2 : 3;
  // Top border pattern
  let cx = m;
  while (cx < config.width - m) {
    doc.setDrawColor(200, 150, 50);
    doc.line(cx, y, cx + triSize / 2, y - triSize);
    doc.line(cx + triSize / 2, y - triSize, cx + triSize, y);
    cx += triSize;
  }
  // Bottom border pattern
  cx = m;
  while (cx < config.width - m) {
    doc.line(cx, y + h, cx + triSize / 2, y + h + triSize);
    doc.line(cx + triSize / 2, y + h + triSize, cx + triSize, y + h);
    cx += triSize;
  }
  // Side lines
  doc.setDrawColor(34, 120, 60);
  doc.setLineWidth(0.3);
  doc.line(m, y, m, y + h);
  doc.line(config.width - m, y, config.width - m, y + h);
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
}

// ─── CLASSIC TEMPLATE (default) ────────────────────────────────
function generateClassicReceipt(data: ReceiptData, doc: jsPDF, config: typeof PAPER_CONFIGS[ReceiptPaperSize]): jsPDF {
  const symbol = data.currencySymbol || "F";
  const position = data.currencyPosition || "after";
  const fPrice = (p: number) => formatPriceWithCurrency(p, symbol, position, true);
  const { width: pw, margin: m } = config;
  const cw = pw - m * 2;

  let y = m + 3;
  const isSmall = pw < 70;

  // Helpers
  const centerText = (text: string, yPos: number, fontSize = config.baseFontSize, bold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const tw = doc.getTextWidth(text);
    doc.text(text, (pw - tw) / 2, yPos);
  };
  const rightText = (text: string, yPos: number) => {
    const tw = doc.getTextWidth(text);
    doc.text(text, pw - m - tw, yPos);
  };
  const dottedLine = (yPos: number) => {
    doc.setLineDashPattern([0.6, 0.6], 0);
    doc.setLineWidth(0.15);
    doc.line(m, yPos, pw - m, yPos);
    doc.setLineDashPattern([], 0);
  };
  const solidLine = (yPos: number, width = 0.2) => {
    doc.setLineWidth(width);
    doc.line(m, yPos, pw - m, yPos);
  };
  const wrapText = (txt: string, maxChars: number): string[] => {
    if (txt.length <= maxChars) return [txt];
    const words = txt.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > maxChars) {
        if (cur) lines.push(cur);
        cur = w;
      } else {
        cur = (cur + " " + w).trim();
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 2);
  };

  // ── Logo ──
  if (data.showLogo && data.logoUrl) {
    try {
      doc.addImage(data.logoUrl, "AUTO", (pw - 15) / 2, y - 2, 15, 15);
      y += 16;
    } catch {
      // Logo failed to load — skip
    }
  }

  // ── Header ──
  doc.setFillColor(0, 0, 0);
  doc.rect(m, y - 2, cw, 0.6, "F");
  y += 3;
  centerText(data.businessName.toUpperCase(), y, config.titleFontSize, true);
  y += isSmall ? 4 : 5;
  if (data.businessAddress) { centerText(data.businessAddress, y, config.headerFontSize - 1); y += isSmall ? 3 : 3.5; }
  if (data.businessPhone) { centerText(`Tel : ${data.businessPhone}`, y, config.headerFontSize - 1); y += isSmall ? 3 : 3.5; }

  y += 1.5;
  solidLine(y, 0.5);
  y += 1.2;
  solidLine(y, 0.2);
  y += 4;

  // ── Title ──
  centerText("TICKET DE CAISSE", y, config.headerFontSize + 1, true);
  y += 5;

  // ── Metadata ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(config.baseFontSize);
  doc.text(`N° ${data.saleNumber}`, m, y);
  rightText(data.date.toLocaleDateString("fr-FR"), y);
  y += 3.5;
  if (data.sellerName) {
    doc.text(`Vendeur : ${data.sellerName}`, m, y);
  }
  rightText(data.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), y);
  y += 3.5;
  if (data.customerName) {
    doc.text(`Client : ${data.customerName}`, m, y);
    y += 3.5;
  }

  y += 1;
  dottedLine(y);
  y += 3.5;

  // ── Column header ──
  const colQte = isSmall ? m + 26 : m + 38;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(config.baseFontSize);
  doc.text("Article", m, y);
  doc.text("Qté", colQte, y);
  rightText("Total", y);
  y += 2.5;
  dottedLine(y);
  y += 3.5;

  // ── Items ──
  const maxChars = isSmall ? 16 : 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(config.baseFontSize + 0.5);
  data.items.forEach((item) => {
    const lines = wrapText(item.product_name, maxChars);
    doc.text(lines[0], m, y);
    doc.text(`${item.quantity}`, colQte, y);
    rightText(fPrice(item.total_price), y);
    y += 3.5;
    if (lines[1]) {
      doc.text(lines[1], m, y);
      y += 3.5;
    }
    doc.setTextColor(120);
    doc.setFontSize(config.baseFontSize - 0.5);
    doc.text(`  ${item.quantity} x ${fPrice(item.unit_price)}`, m, y);
    doc.setTextColor(0);
    doc.setFontSize(config.baseFontSize + 0.5);
    y += 4;
  });

  y += 0.5;
  dottedLine(y);
  y += 4;

  // ── Totals ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(config.baseFontSize + 1);

  // Tax detail
  const tva = data.total - data.subtotal;
  const hasTax = Math.abs(tva) > 0.001;

  if (data.subtotal !== data.total) {
    doc.text("Sous-total", m, y);
    rightText(fPrice(data.subtotal), y);
    y += 4;
    if (hasTax && data.showTax !== false) {
      doc.text("TVA", m, y);
      rightText(fPrice(tva), y);
      y += 4;
    }
  }

  y += 0.5;
  solidLine(y, 0.5);
  y += 1.2;
  solidLine(y, 0.2);
  y += 4.5;

  doc.setFont("courier", "bold");
  doc.setFontSize(config.titleFontSize);
  doc.text("TOTAL", m, y);
  rightText(fPrice(data.total), y);
  y += 6;
  solidLine(y, 0.5);
  y += 1.2;
  solidLine(y, 0.2);
  y += 5;

  // ── Payment ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(config.baseFontSize + 0.5);
  doc.text("Mode de paiement", m, y);
  rightText(paymentMethodLabels[data.paymentMethod] || data.paymentMethod, y);
  y += 4;

  if (data.paymentMethod === "cash") {
    doc.text("Reçu", m, y);
    rightText(fPrice(data.amountPaid), y);
    y += 4;
    if (data.change > 0) {
      doc.setFont("helvetica", "bold");
      doc.text("Monnaie rendue", m, y);
      rightText(fPrice(data.change), y);
      doc.setFont("helvetica", "normal");
      y += 4;
    }
  }

  y += 2;
  dottedLine(y);
  y += 5;

  // ── Footer ──
  centerText("Merci de votre confiance !", y, config.headerFontSize, true);
  y += 4;
  centerText("À très bientôt", y, config.baseFontSize);
  y += 4;

  if (data.footerText) {
    const footerLines = wrapText(data.footerText, isSmall ? 24 : 36);
    footerLines.forEach((line) => {
      centerText(line, y, config.baseFontSize - 0.5);
      y += 3;
    });
    y += 1;
  }

  doc.setTextColor(150);
  centerText("Ticket édité par MakitiPlus", y, config.baseFontSize - 1);
  doc.setTextColor(0);

  return doc;
}

// ─── MINIMAL TEMPLATE ──────────────────────────────────────────
function generateMinimalReceipt(data: ReceiptData, doc: jsPDF, config: typeof PAPER_CONFIGS[ReceiptPaperSize]): jsPDF {
  const symbol = data.currencySymbol || "F";
  const position = data.currencyPosition || "after";
  const fPrice = (p: number) => formatPriceWithCurrency(p, symbol, position, true);
  const { width: pw, margin: m } = config;
  const isSmall = pw < 70;

  let y = m + 3;

  const centerText = (text: string, yPos: number, fontSize = config.baseFontSize, bold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const tw = doc.getTextWidth(text);
    doc.text(text, (pw - tw) / 2, yPos);
  };
  const rightText = (text: string, yPos: number) => {
    const tw = doc.getTextWidth(text);
    doc.text(text, pw - m - tw, yPos);
  };
  const solidLine = (yPos: number) => {
    doc.setLineWidth(0.1);
    doc.line(m, yPos, pw - m, yPos);
  };

  // ── Simple header ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(config.titleFontSize - 1);
  centerText(data.businessName.toUpperCase(), y);
  y += isSmall ? 4 : 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(config.baseFontSize - 0.5);
  centerText(`${data.saleNumber} | ${data.date.toLocaleDateString("fr-FR")} ${data.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`, y);
  y += 4;

  solidLine(y);
  y += 4;

  // ── Items (compact) ──
  doc.setFontSize(config.baseFontSize);
  const maxChars = isSmall ? 20 : 28;
  data.items.forEach((item) => {
    const name = item.product_name.length > maxChars
      ? item.product_name.substring(0, maxChars - 1) + "…"
      : item.product_name;
    doc.setFont("helvetica", "normal");
    doc.text(`${name} x${item.quantity}`, m, y);
    rightText(fPrice(item.total_price), y);
    y += isSmall ? 3 : 3.5;
  });

  y += 1;
  solidLine(y);
  y += 4;

  // ── Total (clean) ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(config.headerFontSize + 1);
  doc.text("Total", m, y);
  rightText(fPrice(data.total), y);
  y += 5;

  // ── Payment ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(config.baseFontSize);
  doc.text(paymentMethodLabels[data.paymentMethod] || data.paymentMethod, m, y);
  if (data.paymentMethod === "cash" && data.change > 0) {
    rightText(`Monnaie: ${fPrice(data.change)}`, y);
  }
  y += 5;

  // ── Footer ──
  if (data.footerText) {
    doc.setFontSize(config.baseFontSize - 0.5);
    centerText(data.footerText, y);
    y += 3;
  }

  doc.setTextColor(150);
  doc.setFontSize(config.baseFontSize - 1);
  centerText("MakitiPlus", y);
  doc.setTextColor(0);

  return doc;
}

// ─── DETAILED TEMPLATE ─────────────────────────────────────────
function generateDetailedReceipt(data: ReceiptData, doc: jsPDF, config: typeof PAPER_CONFIGS[ReceiptPaperSize]): jsPDF {
  const symbol = data.currencySymbol || "F";
  const position = data.currencyPosition || "after";
  const fPrice = (p: number) => formatPriceWithCurrency(p, symbol, position, true);
  const { width: pw, margin: m } = config;
  const cw = pw - m * 2;
  const isSmall = pw < 70;
  const isA4 = pw > 100;

  let y = m + 3;

  const centerText = (text: string, yPos: number, fontSize = config.baseFontSize, bold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const tw = doc.getTextWidth(text);
    doc.text(text, (pw - tw) / 2, yPos);
  };
  const rightText = (text: string, yPos: number) => {
    const tw = doc.getTextWidth(text);
    doc.text(text, pw - m - tw, yPos);
  };
  const leftText = (text: string, yPos: number, x?: number) => {
    doc.text(text, x ?? m, yPos);
  };
  const dottedLine = (yPos: number) => {
    doc.setLineDashPattern([0.6, 0.6], 0);
    doc.setLineWidth(0.15);
    doc.line(m, yPos, pw - m, yPos);
    doc.setLineDashPattern([], 0);
  };
  const solidLine = (yPos: number, width = 0.2) => {
    doc.setLineWidth(width);
    doc.line(m, yPos, pw - m, yPos);
  };

  // ── Logo ──
  if (data.showLogo && data.logoUrl) {
    try {
      const logoSize = isA4 ? 25 : 15;
      doc.addImage(data.logoUrl, "AUTO", (pw - logoSize) / 2, y - 2, logoSize, logoSize);
      y += logoSize + 3;
    } catch {
      // Logo failed to load — skip
    }
  }

  // ── Business info box ──
  if (isA4) {
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.roundedRect(m, y - 3, cw, isA4 ? 30 : 18, 1, 1);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(config.titleFontSize);
  centerText(data.businessName.toUpperCase(), y);
  y += isA4 ? 6 : 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(config.baseFontSize);
  if (data.businessAddress) { centerText(data.businessAddress, y); y += isA4 ? 4 : 3; }
  if (data.businessPhone) { centerText(`Tél : ${data.businessPhone}`, y); y += isA4 ? 4 : 3; }
  if (data.organizationId) {
    doc.setFontSize(config.baseFontSize - 1);
    doc.setTextColor(100);
    centerText(`NIF: ${data.organizationId.substring(0, 8).toUpperCase()}`, y);
    doc.setTextColor(0);
    y += isA4 ? 4 : 3;
  }

  y += 2;
  solidLine(y, 0.5);
  y += 1.2;
  solidLine(y, 0.2);
  y += 4;

  // ── FACTURE heading ──
  centerText("FACTURE / TICKET DE CAISSE", y, config.headerFontSize + 2, true);
  y += 3;
  centerText("Document fiscal - À conserver", y, config.baseFontSize - 1);
  y += 5;

  // ── Info block ──
  doc.setFontSize(config.baseFontSize);
  const infoY = y;
  doc.setFont("helvetica", "bold");
  leftText(`N° Facture : ${data.saleNumber}`, y);
  y += isA4 ? 5 : 3.5;
  leftText(`Date : ${data.date.toLocaleDateString("fr-FR")}`, y);
  rightText(`Heure : ${data.date.toLocaleTimeString("fr-FR")}`, y);
  y += isA4 ? 5 : 3.5;
  if (data.sellerName) {
    leftText(`Vendeur : ${data.sellerName}`, y);
    y += isA4 ? 5 : 3.5;
  }
  if (data.customerName) {
    leftText(`Client : ${data.customerName}`, y);
    y += isA4 ? 5 : 3.5;
  }
  if (data.customerPhone) {
    leftText(`Tél client : ${data.customerPhone}`, y);
    y += isA4 ? 5 : 3.5;
  }

  y += 2;
  dottedLine(y);
  y += 4;

  // ── Table header ──
  const colDesc = m;
  const colQty = isA4 ? m + 100 : (isSmall ? m + 22 : m + 36);
  const colUnit = isA4 ? m + 130 : (isSmall ? m + 30 : m + 48);
  const colTotal = pw - m;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(config.baseFontSize);
  leftText("Désignation", y, colDesc);
  leftText("Qté", y, colQty);
  leftText("P.U.", y, colUnit);
  doc.text("Montant", colTotal, y, { align: "right" });
  y += 2;
  solidLine(y, 0.3);
  y += 3;

  // ── Items ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(config.baseFontSize);
  data.items.forEach((item) => {
    const maxLen = isA4 ? 40 : (isSmall ? 14 : 20);
    const name = item.product_name.length > maxLen
      ? item.product_name.substring(0, maxLen - 1) + "…"
      : item.product_name;
    leftText(name, y, colDesc);
    leftText(`${item.quantity}`, y, colQty);
    leftText(fPrice(item.unit_price), y, colUnit);
    doc.text(fPrice(item.total_price), colTotal, y, { align: "right" });
    y += isA4 ? 5 : 3.5;
  });

  y += 1;
  solidLine(y, 0.3);
  y += 4;

  // ── Totals with full detail ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(config.baseFontSize);

  // Sous-total HT
  leftText("Sous-total HT", y);
  doc.text(fPrice(data.subtotal), colTotal, y, { align: "right" });
  y += isA4 ? 5 : 3.5;

  // TVA
  const tva = data.total - data.subtotal;
  if (Math.abs(tva) > 0.001 && data.showTax !== false) {
    const taxRate = data.taxRate || 18;
    leftText(`TVA (${taxRate}%)`, y);
    doc.text(fPrice(tva), colTotal, y, { align: "right" });
    y += isA4 ? 5 : 3.5;
  }

  // Remises / autres lignes possibles ici...

  y += 1;
  // Total box
  if (isA4) {
    doc.setFillColor(240, 240, 240);
    doc.rect(m, y - 3, cw, 10, "F");
  }
  solidLine(y - 1, 0.5);
  y += 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(config.headerFontSize + 2);
  leftText("TOTAL TTC", y);
  doc.text(fPrice(data.total), colTotal, y, { align: "right" });
  y += isA4 ? 7 : 5;
  solidLine(y, 0.5);
  y += 5;

  // ── Payment detail ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(config.baseFontSize);
  leftText(`Mode de règlement : ${paymentMethodLabels[data.paymentMethod] || data.paymentMethod}`, y);
  y += isA4 ? 5 : 3.5;

  if (data.paymentMethod === "cash") {
    leftText(`Montant reçu : ${fPrice(data.amountPaid)}`, y);
    y += isA4 ? 5 : 3.5;
    if (data.change > 0) {
      doc.setFont("helvetica", "bold");
      leftText(`Monnaie rendue : ${fPrice(data.change)}`, y);
      doc.setFont("helvetica", "normal");
      y += isA4 ? 5 : 3.5;
    }
  }

  y += 3;
  dottedLine(y);
  y += 5;

  // ── Legal mention ──
  doc.setFontSize(config.baseFontSize - 1);
  doc.setTextColor(100);
  centerText("Conformément à la réglementation fiscale en vigueur,", y);
  y += isA4 ? 4 : 3;
  centerText("ce document doit être conservé pendant 10 ans.", y);
  y += isA4 ? 5 : 4;
  doc.setTextColor(0);

  // ── Footer ──
  centerText("Merci de votre confiance !", y, config.headerFontSize, true);
  y += isA4 ? 5 : 4;

  if (data.footerText) {
    doc.setFontSize(config.baseFontSize);
    centerText(data.footerText, y);
    y += isA4 ? 5 : 3;
  }

  doc.setTextColor(150);
  doc.setFontSize(config.baseFontSize - 1);
  centerText("Ticket édité par MakitiPlus", y);
  doc.setTextColor(0);

  return doc;
}

// ─── AFRICAN TEMPLATE ──────────────────────────────────────────
function generateAfricanReceipt(data: ReceiptData, doc: jsPDF, config: typeof PAPER_CONFIGS[ReceiptPaperSize]): jsPDF {
  const symbol = data.currencySymbol || "F";
  const position = data.currencyPosition || "after";
  const fPrice = (p: number) => formatPriceWithCurrency(p, symbol, position, true);
  const { width: pw, margin: m } = config;
  const cw = pw - m * 2;
  const isSmall = pw < 70;

  let y = m + 6;

  const centerText = (text: string, yPos: number, fontSize = config.baseFontSize, bold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const tw = doc.getTextWidth(text);
    doc.text(text, (pw - tw) / 2, yPos);
  };
  const rightText = (text: string, yPos: number) => {
    const tw = doc.getTextWidth(text);
    doc.text(text, pw - m - tw, yPos);
  };
  const dottedLine = (yPos: number) => {
    doc.setLineDashPattern([0.6, 0.6], 0);
    doc.setLineWidth(0.15);
    doc.line(m, yPos, pw - m, yPos);
    doc.setLineDashPattern([], 0);
  };
  const wrapText = (txt: string, maxChars: number): string[] => {
    if (txt.length <= maxChars) return [txt];
    const words = txt.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > maxChars) {
        if (cur) lines.push(cur);
        cur = w;
      } else {
        cur = (cur + " " + w).trim();
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 2);
  };

  // ── Top decorative border ──
  drawAfricanBorder(doc, m, m + 2, cw, 0, config);

  // ── Logo ──
  if (data.showLogo && data.logoUrl) {
    try {
      const logoSize = isSmall ? 10 : 15;
      doc.addImage(data.logoUrl, "AUTO", (pw - logoSize) / 2, y - 2, logoSize, logoSize);
      y += logoSize + 3;
    } catch {
      // Logo failed
    }
  }

  // ── Header with warm color ──
  doc.setFillColor(200, 150, 50); // Gold band
  doc.rect(m, y - 2, cw, isSmall ? 6 : 8, "F");
  y += isSmall ? 3 : 4;
  doc.setTextColor(255, 255, 255);
  centerText(data.businessName.toUpperCase(), y, config.titleFontSize, true);
  doc.setTextColor(0);
  y += isSmall ? 5 : 7;

  // ── Business info ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(config.baseFontSize);
  if (data.businessAddress) { centerText(data.businessAddress, y); y += 3; }
  if (data.businessPhone) { centerText(`Tél : ${data.businessPhone}`, y); y += 3; }

  y += 2;

  // ── Green accent line ──
  doc.setFillColor(34, 120, 60);
  doc.rect(m, y, cw, 0.8, "F");
  y += 4;

  // ── Title ──
  centerText("~ TICKET DE CAISSE ~", y, config.headerFontSize + 1, true);
  y += 5;

  // ── Metadata ──
  doc.setFontSize(config.baseFontSize);
  doc.text(`N° ${data.saleNumber}`, m, y);
  rightText(data.date.toLocaleDateString("fr-FR"), y);
  y += 3.5;
  if (data.sellerName) {
    doc.text(`Vendeur : ${data.sellerName}`, m, y);
    rightText(data.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), y);
    y += 3.5;
  }
  if (data.customerName) {
    doc.text(`Client : ${data.customerName}`, m, y);
    y += 3.5;
  }

  y += 1;
  dottedLine(y);
  y += 3.5;

  // ── Column header ──
  const colQte = isSmall ? m + 26 : m + 38;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(config.baseFontSize);
  doc.text("Article", m, y);
  doc.text("Qté", colQte, y);
  rightText("Total", y);
  y += 2.5;

  // Gold line under header
  doc.setFillColor(200, 150, 50);
  doc.rect(m, y, cw, 0.4, "F");
  y += 3.5;

  // ── Items ──
  const maxChars = isSmall ? 16 : 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(config.baseFontSize + 0.5);
  data.items.forEach((item) => {
    const lines = wrapText(item.product_name, maxChars);
    doc.text(lines[0], m, y);
    doc.text(`${item.quantity}`, colQte, y);
    rightText(fPrice(item.total_price), y);
    y += 3.5;
    if (lines[1]) {
      doc.text(lines[1], m, y);
      y += 3.5;
    }
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(config.baseFontSize - 0.5);
    doc.text(`  ${item.quantity} x ${fPrice(item.unit_price)}`, m, y);
    doc.setTextColor(0);
    doc.setFontSize(config.baseFontSize + 0.5);
    y += 4;
  });

  y += 0.5;
  dottedLine(y);
  y += 4;

  // ── Totals ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(config.baseFontSize + 1);
  if (data.subtotal !== data.total) {
    doc.text("Sous-total", m, y);
    rightText(fPrice(data.subtotal), y);
    y += 4;
    const tva = data.total - data.subtotal;
    if (Math.abs(tva) > 0.001 && data.showTax !== false) {
      doc.text("TVA", m, y);
      rightText(fPrice(tva), y);
      y += 4;
    }
  }

  y += 0.5;
  // Total box with gold accent
  doc.setFillColor(34, 120, 60);
  doc.rect(m, y, cw, 0.8, "F");
  y += 1.5;
  doc.setFillColor(245, 235, 210); // Warm cream background
  doc.rect(m, y - 3, cw, 8, "F");
  doc.setFont("courier", "bold");
  doc.setFontSize(config.titleFontSize);
  doc.text("TOTAL", m + 2, y);
  rightText(fPrice(data.total), y);
  y += 6;
  doc.setFillColor(34, 120, 60);
  doc.rect(m, y, cw, 0.8, "F");
  y += 5;

  // ── Payment ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(config.baseFontSize + 0.5);
  doc.text("Mode de paiement", m, y);
  rightText(paymentMethodLabels[data.paymentMethod] || data.paymentMethod, y);
  y += 4;

  if (data.paymentMethod === "cash") {
    doc.text("Reçu", m, y);
    rightText(fPrice(data.amountPaid), y);
    y += 4;
    if (data.change > 0) {
      doc.setFont("helvetica", "bold");
      doc.text("Monnaie rendue", m, y);
      rightText(fPrice(data.change), y);
      doc.setFont("helvetica", "normal");
      y += 4;
    }
  }

  y += 2;
  dottedLine(y);
  y += 5;

  // ── African proverb / footer ──
  const proverbs = [
    "Petit à petit, l'oiseau fait son nid",
    "La patience est un arbre dont la racine est amère mais le fruit doux",
    "L'union fait la force",
  ];
  const proverb = proverbs[Math.floor(data.date.getTime() / 86400000) % proverbs.length];
  doc.setTextColor(34, 120, 60);
  doc.setFontSize(config.baseFontSize - 0.5);
  doc.setFont("helvetica", "italic");
  centerText(`"${proverb}"`, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);
  y += 4;

  centerText("Merci de votre confiance !", y, config.headerFontSize, true);
  y += 4;

  if (data.footerText) {
    const footerLines = wrapText(data.footerText, isSmall ? 24 : 36);
    footerLines.forEach((line) => {
      centerText(line, y, config.baseFontSize - 0.5);
      y += 3;
    });
    y += 1;
  }

  // ── Bottom decorative border ──
  drawAfricanBorder(doc, m, y + 1, cw, 0, config);

  doc.setTextColor(150);
  centerText("Ticket édité par MakitiPlus", y + 5, config.baseFontSize - 1);
  doc.setTextColor(0);

  return doc;
}

// ─── Main entry point ──────────────────────────────────────────
export const generateReceiptPDF = (data: ReceiptData): jsPDF => {
  const paperSize: ReceiptPaperSize = data.paperSize || "80mm";
  const template: ReceiptTemplate = data.template || "default";
  const config = PAPER_CONFIGS[paperSize];

  // Estimate height based on items count
  const estimatedHeight = Math.max(
    config.defaultHeight,
    config.defaultHeight + data.items.length * (paperSize === "A4" ? 10 : 6)
  );

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [config.width, template === "detailed" && paperSize === "A4" ? 297 : estimatedHeight],
  });

  // Dispatch to template
  switch (template) {
    case "minimal":
      return generateMinimalReceipt(data, doc, config);
    case "detailed":
      return generateDetailedReceipt(data, doc, config);
    case "african":
      return generateAfricanReceipt(data, doc, config);
    case "default":
    default:
      return generateClassicReceipt(data, doc, config);
  }
};

// ─── Text version for WhatsApp/SMS ─────────────────────────────
export const generateReceiptText = (data: ReceiptData): string => {
  const symbol = data.currencySymbol || "GNF";
  const position = data.currencyPosition || "after";
  const fPrice = (p: number) => formatPriceWithCurrency(p, symbol, position, true);
  const template = data.template || "default";

  const lines: string[] = [];

  switch (template) {
    case "minimal": {
      lines.push(data.businessName.toUpperCase());
      lines.push(`${data.saleNumber} | ${data.date.toLocaleDateString("fr-FR")} ${data.date.toLocaleTimeString("fr-FR")}`);
      lines.push("");
      data.items.forEach((item) => {
        lines.push(`${item.product_name} x${item.quantity} = ${fPrice(item.total_price)}`);
      });
      lines.push("");
      lines.push(`*Total: ${fPrice(data.total)}*`);
      lines.push(paymentMethodLabels[data.paymentMethod] || data.paymentMethod);
      if (data.footerText) lines.push(data.footerText);
      break;
    }
    case "detailed": {
      lines.push(`*${data.businessName.toUpperCase()}*`);
      if (data.businessAddress) lines.push(data.businessAddress);
      if (data.businessPhone) lines.push(`Tél: ${data.businessPhone}`);
      lines.push("");
      lines.push("=========================");
      lines.push("*FACTURE / TICKET DE CAISSE*");
      lines.push(`N°: ${data.saleNumber}`);
      lines.push(`Date: ${data.date.toLocaleDateString("fr-FR")} ${data.date.toLocaleTimeString("fr-FR")}`);
      if (data.sellerName) lines.push(`Vendeur: ${data.sellerName}`);
      if (data.customerName) lines.push(`Client: ${data.customerName}`);
      lines.push("=========================");
      lines.push("");
      lines.push("*DÉSIGNATION | QTÉ | P.U. | MONTANT*");
      data.items.forEach((item) => {
        lines.push(`${item.product_name} | ${item.quantity} | ${fPrice(item.unit_price)} | ${fPrice(item.total_price)}`);
      });
      lines.push("");
      lines.push("-------------------------");
      lines.push(`Sous-total HT: ${fPrice(data.subtotal)}`);
      const tva = data.total - data.subtotal;
      if (Math.abs(tva) > 0.001 && data.showTax !== false) {
        lines.push(`TVA: ${fPrice(tva)}`);
      }
      lines.push(`*TOTAL TTC: ${fPrice(data.total)}*`);
      lines.push(`Paiement: ${paymentMethodLabels[data.paymentMethod] || data.paymentMethod}`);
      if (data.paymentMethod === "cash" && data.change > 0) {
        lines.push(`Monnaie: ${fPrice(data.change)}`);
      }
      lines.push("-------------------------");
      lines.push("*Merci de votre confiance !*");
      if (data.footerText) lines.push(data.footerText);
      break;
    }
    case "african": {
      lines.push(`*${data.businessName.toUpperCase()}*`);
      if (data.businessAddress) lines.push(data.businessAddress);
      if (data.businessPhone) lines.push(`Tél: ${data.businessPhone}`);
      lines.push("");
      lines.push("~ TICKET DE CAISSE ~");
      lines.push(`N° ${data.saleNumber} | ${data.date.toLocaleDateString("fr-FR")}`);
      lines.push("-------------------------");
      lines.push("");
      data.items.forEach((item) => {
        lines.push(`• ${item.product_name}`);
        lines.push(`  ${item.quantity} x ${fPrice(item.unit_price)} = *${fPrice(item.total_price)}*`);
      });
      lines.push("");
      lines.push("-------------------------");
      if (data.subtotal !== data.total) {
        lines.push(`Sous-total: ${fPrice(data.subtotal)}`);
        const tva = data.total - data.subtotal;
        if (Math.abs(tva) > 0.001 && data.showTax !== false) {
          lines.push(`TVA: ${fPrice(tva)}`);
        }
      }
      lines.push(`*TOTAL: ${fPrice(data.total)}*`);
      lines.push(`Paiement: ${paymentMethodLabels[data.paymentMethod] || data.paymentMethod}`);
      if (data.paymentMethod === "cash" && data.change > 0) {
        lines.push(`Monnaie: ${fPrice(data.change)}`);
      }
      lines.push("");
      const proverbs = [
        "Petit à petit, l'oiseau fait son nid",
        "La patience est un arbre dont la racine est amère mais le fruit doux",
        "L'union fait la force",
      ];
      const proverb = proverbs[Math.floor(data.date.getTime() / 86400000) % proverbs.length];
      lines.push(`_"${proverb}"_`);
      lines.push("*Merci de votre confiance !*");
      if (data.footerText) lines.push(data.footerText);
      break;
    }
    default: { // classic
      lines.push(`*${data.businessName.toUpperCase()}*`);
      if (data.businessAddress) lines.push(data.businessAddress);
      if (data.businessPhone) lines.push(`Tél: ${data.businessPhone}`);
      lines.push("");
      lines.push("-----------------");
      lines.push(`*Ticket N°:* ${data.saleNumber}`);
      lines.push(`Date: ${data.date.toLocaleDateString("fr-FR")} ${data.date.toLocaleTimeString("fr-FR")}`);
      if (data.sellerName) lines.push(`Vendeur: ${data.sellerName}`);
      if (data.customerName) lines.push(`Client: ${data.customerName}`);
      lines.push("-----------------");
      lines.push("");
      lines.push("*ARTICLES:*");
      data.items.forEach((item) => {
        lines.push(`• ${item.product_name}`);
        lines.push(`  ${item.quantity} x ${fPrice(item.unit_price)} = *${fPrice(item.total_price)}*`);
      });
      lines.push("");
      lines.push("-----------------");
      if (data.subtotal !== data.total) {
        lines.push(`Sous-total: ${fPrice(data.subtotal)}`);
        const tva = data.total - data.subtotal;
        if (Math.abs(tva) > 0.001 && data.showTax !== false) {
          lines.push(`TVA: ${fPrice(tva)}`);
        }
      }
      lines.push(`*TOTAL: ${fPrice(data.total)}*`);
      lines.push(`Paiement: ${paymentMethodLabels[data.paymentMethod] || data.paymentMethod}`);
      if (data.paymentMethod === "cash") {
        lines.push(`Reçu: ${fPrice(data.amountPaid)}`);
        if (data.change > 0) {
          lines.push(`Monnaie: ${fPrice(data.change)}`);
        }
      }
      lines.push("");
      lines.push("-----------------");
      lines.push("*Merci de votre confiance !*");
      lines.push("À bientôt!");
      if (data.footerText) lines.push(data.footerText);
      break;
    }
  }

  return lines.join("\n");
};

export const shareViaWhatsApp = (data: ReceiptData, phoneNumber?: string): void => {
  const text = generateReceiptText(data);
  const encodedText = encodeURIComponent(text);
  const cleanPhone = phoneNumber?.replace(/[\s\-()]/g, "").replace(/^\+/, "") || "";
  const baseUrl = "https://wa.me/";
  const url = cleanPhone
    ? `${baseUrl}${cleanPhone}?text=${encodedText}`
    : `${baseUrl}?text=${encodedText}`;
  window.open(url, "_blank");
};

export const downloadReceipt = (data: ReceiptData): void => {
  const doc = generateReceiptPDF(data);
  const ext = data.paperSize === "A4" ? "facture" : "ticket";
  doc.save(`${ext}-${data.saleNumber}.pdf`);
};

export const printReceipt = (data: ReceiptData): void => {
  const doc = generateReceiptPDF(data);
  const pdfBlob = doc.output("blob");
  const pdfUrl = URL.createObjectURL(pdfBlob);
  const printWindow = window.open(pdfUrl);
  if (printWindow) {
    printWindow.onload = () => {
      printWindow.print();
    };
  }
};
