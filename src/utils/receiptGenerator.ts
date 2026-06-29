 import jsPDF from "jspdf";
 
 interface ReceiptItem {
   product_name: string;
   quantity: number;
   unit_price: number;
   total_price: number;
 }
 
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
  symbol: string = "GNF",
  position: "before" | "after" = "after"
): string => {
  // Affiche 2 décimales si le prix n'est pas entier (utile pour TVA, monnaie)
  const hasDecimals = Math.abs(price - Math.round(price)) > 0.001;
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(price);
  return position === "before" ? `${symbol} ${formatted}` : `${formatted} ${symbol}`;
};

// Legacy function for backward compatibility
export const formatPrice = (price: number): string => {
  return formatPriceWithCurrency(price, "GNF", "after");
};
 
export const generateReceiptPDF = (data: ReceiptData): jsPDF => {
  const symbol = data.currencySymbol || "GNF";
  const position = data.currencyPosition || "after";
  const fPrice = (p: number) => formatPriceWithCurrency(p, symbol, position);

  // Largeur 80mm (imprimante thermique standard)
  const pageWidth = 80;
  const margin = 4;
  const contentWidth = pageWidth - margin * 2;
  // Hauteur dynamique : on estime puis on rogne
  const estimatedHeight = 90 + data.items.length * 8 + (data.subtotal !== data.total ? 10 : 0);
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [pageWidth, estimatedHeight],
  });

  let y = 6;

  // Helpers ------------------------------------------------------------
  const centerText = (text: string, yPos: number, fontSize = 9, bold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const tw = doc.getTextWidth(text);
    doc.text(text, (pageWidth - tw) / 2, yPos);
  };
  const rightText = (text: string, yPos: number) => {
    const tw = doc.getTextWidth(text);
    doc.text(text, pageWidth - margin - tw, yPos);
  };
  const dottedLine = (yPos: number) => {
    doc.setLineDashPattern([0.6, 0.6], 0);
    doc.setLineWidth(0.15);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    doc.setLineDashPattern([], 0);
  };
  const solidLine = (yPos: number, width = 0.2) => {
    doc.setLineWidth(width);
    doc.line(margin, yPos, pageWidth - margin, yPos);
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
    return lines.slice(0, 2); // max 2 lignes par article
  };

  // En-tête : nom boutique en gros + cadre + infos -------------------
  // Bandeau supérieur épais (style imprimante thermique pro)
  doc.setFillColor(0, 0, 0);
  doc.rect(margin, y - 3, contentWidth, 0.6, "F");
  y += 2;
  centerText(data.businessName.toUpperCase(), y, 13, true);
  y += 5;
  if (data.businessAddress) { centerText(data.businessAddress, y, 7.5); y += 3.5; }
  if (data.businessPhone)   { centerText(`Tel : ${data.businessPhone}`, y, 7.5); y += 3.5; }

  y += 1.5;
  // Double trait (look thermique pro)
  solidLine(y, 0.5);
  y += 1.2;
  solidLine(y, 0.2);
  y += 4;

  // Bandeau "TICKET DE CAISSE"
  centerText("TICKET DE CAISSE", y, 9, true);
  y += 5;

  // Métadonnées (N° + date/heure + vendeur + client)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`N° ${data.saleNumber}`, margin, y);
  rightText(data.date.toLocaleDateString("fr-FR"), y);
  y += 3.5;
  if (data.sellerName) {
    doc.text(`Vendeur : ${data.sellerName}`, margin, y);
  }
  rightText(data.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), y);
  y += 3.5;
  if (data.customerName) {
    doc.text(`Client : ${data.customerName}`, margin, y);
    y += 3.5;
  }

  y += 1;
  dottedLine(y);
  y += 3.5;

  // En-tête colonnes
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("Article", margin, y);
  doc.text("Qté", margin + 38, y);
  rightText("Total", y);
  y += 2.5;
  dottedLine(y);
  y += 3.5;

  // Articles
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  data.items.forEach((item) => {
    const lines = wrapText(item.product_name, 22);
    doc.text(lines[0], margin, y);
    doc.text(`${item.quantity}`, margin + 38, y);
    rightText(fPrice(item.total_price), y);
    y += 3.5;
    // 2e ligne : nom long OU détail unitaire
    if (lines[1]) {
      doc.text(lines[1], margin, y);
      y += 3.5;
    }
    doc.setTextColor(120);
    doc.setFontSize(7);
    doc.text(`  ${item.quantity} × ${fPrice(item.unit_price)}`, margin, y);
    doc.setTextColor(0);
    doc.setFontSize(8);
    y += 4;
  });

  y += 0.5;
  dottedLine(y);
  y += 4;

  // Totaux
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  if (data.subtotal !== data.total) {
    doc.text("Sous-total", margin, y);
    rightText(fPrice(data.subtotal), y);
    y += 4;
    const tva = data.total - data.subtotal;
    if (Math.abs(tva) > 0.001) {
      doc.text("TVA", margin, y);
      rightText(fPrice(tva), y);
      y += 4;
    }
  }

  y += 0.5;
  // Encadrement TOTAL — visuel "boxed" comme les caisses pro
  solidLine(y, 0.5);
  y += 1.2;
  solidLine(y, 0.2);
  y += 4.5;

  doc.setFont("courier", "bold"); // monospace pour aligner parfaitement
  doc.setFontSize(12);
  doc.text("TOTAL", margin, y);
  rightText(fPrice(data.total), y);
  y += 6;
  solidLine(y, 0.5);
  y += 1.2;
  solidLine(y, 0.2);
  y += 5;

  // Paiement
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Mode de paiement", margin, y);
  rightText(paymentMethodLabels[data.paymentMethod] || data.paymentMethod, y);
  y += 4;

  if (data.paymentMethod === "cash") {
    doc.text("Reçu", margin, y);
    rightText(fPrice(data.amountPaid), y);
    y += 4;
    if (data.change > 0) {
      doc.setFont("helvetica", "bold");
      doc.text("Monnaie rendue", margin, y);
      rightText(fPrice(data.change), y);
      doc.setFont("helvetica", "normal");
      y += 4;
    }
  }

  y += 2;
  dottedLine(y);
  y += 5;

  // Pied
  centerText("Merci de votre confiance !", y, 9, true);
  y += 4;
  centerText("À très bientôt", y, 7.5);
  y += 4;
  doc.setTextColor(150);
  centerText("Ticket édité par MakitiPlus", y, 6.5);
  doc.setTextColor(0);

  return doc;
};
 
export const generateReceiptText = (data: ReceiptData): string => {
  const symbol = data.currencySymbol || "GNF";
  const position = data.currencyPosition || "after";
  const fPrice = (p: number) => formatPriceWithCurrency(p, symbol, position);
  
  const lines: string[] = [];
  
  // Header
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
  
  // Items
  lines.push("*ARTICLES:*");
  data.items.forEach((item) => {
    lines.push(`• ${item.product_name}`);
    lines.push(`  ${item.quantity} x ${fPrice(item.unit_price)} = *${fPrice(item.total_price)}*`);
  });
  lines.push("");
  lines.push("-----------------");
  
  // Total
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
  
  return lines.join("\n");
};

export const shareViaWhatsApp = (data: ReceiptData, phoneNumber?: string): void => {
  const text = generateReceiptText(data);
  const encodedText = encodeURIComponent(text);
  
  // Clean phone number (remove spaces, dashes, etc.)
  const cleanPhone = phoneNumber?.replace(/[\s\-()]/g, "").replace(/^\+/, "") || "";
  
  // WhatsApp URL
  const baseUrl = "https://wa.me/";
  const url = cleanPhone 
    ? `${baseUrl}${cleanPhone}?text=${encodedText}`
    : `${baseUrl}?text=${encodedText}`;
  
  window.open(url, "_blank");
};

 export const downloadReceipt = (data: ReceiptData): void => {
   const doc = generateReceiptPDF(data);
   doc.save(`ticket-${data.saleNumber}.pdf`);
 };
 
 export const printReceipt = (data: ReceiptData): void => {
   const doc = generateReceiptPDF(data);
   // Open in new window for printing
   const pdfBlob = doc.output("blob");
   const pdfUrl = URL.createObjectURL(pdfBlob);
   const printWindow = window.open(pdfUrl);
   if (printWindow) {
     printWindow.onload = () => {
       printWindow.print();
     };
   }
 };