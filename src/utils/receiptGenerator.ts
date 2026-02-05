 import jsPDF from "jspdf";
 
 interface ReceiptItem {
   product_name: string;
   quantity: number;
   unit_price: number;
   total_price: number;
 }
 
 interface ReceiptData {
   saleNumber: string;
   date: Date;
   items: ReceiptItem[];
   subtotal: number;
   total: number;
   paymentMethod: string;
   amountPaid: number;
   change: number;
   customerName?: string;
   businessName: string;
   businessAddress?: string;
   businessPhone?: string;
   sellerName?: string;
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
 
 export const formatPrice = (price: number): string => {
   return new Intl.NumberFormat("fr-FR").format(price) + " FCFA";
 };
 
 export const generateReceiptPDF = (data: ReceiptData): jsPDF => {
   // Receipt width: 80mm (typical thermal printer width)
   const doc = new jsPDF({
     orientation: "portrait",
     unit: "mm",
     format: [80, 200], // 80mm wide, variable height
   });
 
   const pageWidth = 80;
   const margin = 5;
   const contentWidth = pageWidth - margin * 2;
   let y = 10;
 
   // Helper function to center text
   const centerText = (text: string, yPos: number, fontSize: number = 10) => {
     doc.setFontSize(fontSize);
     const textWidth = doc.getTextWidth(text);
     doc.text(text, (pageWidth - textWidth) / 2, yPos);
   };
 
   // Header
   doc.setFont("helvetica", "bold");
   centerText(data.businessName.toUpperCase(), y, 14);
   y += 5;
 
   doc.setFont("helvetica", "normal");
   if (data.businessAddress) {
     centerText(data.businessAddress, y, 8);
     y += 4;
   }
   if (data.businessPhone) {
     centerText(`Tél: ${data.businessPhone}`, y, 8);
     y += 4;
   }
 
   // Separator line
   y += 2;
   doc.setLineWidth(0.1);
   doc.line(margin, y, pageWidth - margin, y);
   y += 4;
 
   // Receipt info
   doc.setFontSize(9);
   doc.text(`N°: ${data.saleNumber}`, margin, y);
   y += 4;
   doc.text(`Date: ${data.date.toLocaleDateString("fr-FR")}`, margin, y);
   doc.text(`${data.date.toLocaleTimeString("fr-FR")}`, pageWidth - margin - 15, y);
   y += 4;
 
   if (data.sellerName) {
     doc.text(`Vendeur: ${data.sellerName}`, margin, y);
     y += 4;
   }
 
   if (data.customerName) {
     doc.text(`Client: ${data.customerName}`, margin, y);
     y += 4;
   }
 
   // Separator line
   y += 2;
   doc.line(margin, y, pageWidth - margin, y);
   y += 4;
 
   // Items header
   doc.setFont("helvetica", "bold");
   doc.setFontSize(8);
   doc.text("Article", margin, y);
   doc.text("Qté", margin + 35, y);
   doc.text("Prix", margin + 45, y);
   doc.text("Total", margin + 58, y);
   y += 3;
   doc.line(margin, y, pageWidth - margin, y);
   y += 4;
 
   // Items
   doc.setFont("helvetica", "normal");
   data.items.forEach((item) => {
     // Product name (might need truncation)
     const name = item.product_name.length > 18 
       ? item.product_name.substring(0, 18) + "..." 
       : item.product_name;
     doc.text(name, margin, y);
     doc.text(item.quantity.toString(), margin + 37, y);
     doc.text(item.unit_price.toLocaleString("fr-FR"), margin + 45, y);
     doc.text(item.total_price.toLocaleString("fr-FR"), margin + 58, y);
     y += 4;
   });
 
   // Separator line
   y += 2;
   doc.line(margin, y, pageWidth - margin, y);
   y += 4;
 
   // Totals
   doc.setFont("helvetica", "bold");
   doc.setFontSize(10);
   doc.text("TOTAL:", margin, y);
   doc.text(formatPrice(data.total), pageWidth - margin - doc.getTextWidth(formatPrice(data.total)), y);
   y += 6;
 
   doc.setFont("helvetica", "normal");
   doc.setFontSize(9);
   doc.text(`Paiement: ${paymentMethodLabels[data.paymentMethod] || data.paymentMethod}`, margin, y);
   y += 4;
 
   if (data.paymentMethod === "cash") {
     doc.text(`Reçu: ${formatPrice(data.amountPaid)}`, margin, y);
     y += 4;
     if (data.change > 0) {
       doc.text(`Monnaie: ${formatPrice(data.change)}`, margin, y);
       y += 4;
     }
   }
 
   // Footer
   y += 4;
   doc.line(margin, y, pageWidth - margin, y);
   y += 6;
 
   centerText("Merci de votre confiance !", y, 9);
   y += 4;
   centerText("À bientôt", y, 8);
 
   return doc;
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