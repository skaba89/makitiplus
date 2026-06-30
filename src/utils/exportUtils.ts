import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface SaleExportRow {
  sale_number: string;
  created_at: string;
  customer_name: string | null;
  payment_method: string;
  subtotal: number;
  total_amount: number;
  amount_paid: number;
  change_amount: number | null;
  seller_name: string | null;
}

interface ProductExportRow {
  name: string;
  category: string;
  price: number;
  cost_price: number | null;
  stock_quantity: number;
  min_stock_alert: number | null;
  unit: string | null;
  is_active: boolean | null;
}

interface ExpenseExportRow {
  expense_date: string;
  category: string;
  amount: number;
  payment_method: string | null;
  description: string | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Espèces",
  wave: "Wave",
  orange_money: "Orange Money",
  mtn_money: "MTN Money",
  moov_money: "Moov Money",
  mpesa: "M-Pesa",
  card: "Carte bancaire",
  credit: "À crédit",
};

const escapeCSV = (value: string | number | boolean | null | undefined): string => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const downloadCSV = (content: string, filename: string): void => {
  // Add BOM for Excel UTF-8 compatibility
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + content], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportSalesToCSV = (sales: SaleExportRow[], currencySymbol: string = "GNF"): void => {
  const sym = currencySymbol;
  const headers = [
    "N° Vente",
    "Date",
    "Heure",
    "Client",
    "Mode de paiement",
    `Sous-total (${sym})`,
    `Total (${sym})`,
    `Montant reçu (${sym})`,
    `Monnaie (${sym})`,
    "Vendeur",
  ];

  const rows = sales.map((sale) => {
    const date = new Date(sale.created_at);
    return [
      escapeCSV(sale.sale_number),
      escapeCSV(format(date, "dd/MM/yyyy", { locale: fr })),
      escapeCSV(format(date, "HH:mm", { locale: fr })),
      escapeCSV(sale.customer_name || "-"),
      escapeCSV(PAYMENT_LABELS[sale.payment_method] || sale.payment_method),
      escapeCSV(sale.subtotal),
      escapeCSV(sale.total_amount),
      escapeCSV(sale.amount_paid),
      escapeCSV(sale.change_amount || 0),
      escapeCSV(sale.seller_name || "-"),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const filename = `ventes_${format(new Date(), "yyyy-MM-dd")}.csv`;
  downloadCSV(csv, filename);
};

export const exportProductsToCSV = (products: ProductExportRow[], currencySymbol: string = "GNF"): void => {
  const sym = currencySymbol;
  const headers = [
    "Nom",
    "Catégorie",
    `Prix de vente (${sym})`,
    `Prix d'achat (${sym})`,
    "Stock",
    "Seuil d'alerte",
    "Unité",
    "Actif",
  ];

  const rows = products.map((product) => [
    escapeCSV(product.name),
    escapeCSV(product.category || "-"),
    escapeCSV(product.price),
    escapeCSV(product.cost_price || "-"),
    escapeCSV(product.stock_quantity),
    escapeCSV(product.min_stock_alert || "-"),
    escapeCSV(product.unit || "unité"),
    escapeCSV(product.is_active ? "Oui" : "Non"),
  ].join(","));

  const csv = [headers.join(","), ...rows].join("\n");
  const filename = `stock_${format(new Date(), "yyyy-MM-dd")}.csv`;
  downloadCSV(csv, filename);
};

export const exportExpensesToCSV = (expenses: ExpenseExportRow[], currencySymbol: string = "GNF"): void => {
  const sym = currencySymbol;
  const headers = [
    "Date",
    "Catégorie",
    `Montant (${sym})`,
    "Mode de paiement",
    "Description",
  ];

  const rows = expenses.map((expense) => [
    escapeCSV(format(new Date(expense.expense_date), "dd/MM/yyyy", { locale: fr })),
    escapeCSV(expense.category),
    escapeCSV(expense.amount),
    escapeCSV(expense.payment_method ? PAYMENT_LABELS[expense.payment_method] || expense.payment_method : "-"),
    escapeCSV(expense.description || "-"),
  ].join(","));

  const csv = [headers.join(","), ...rows].join("\n");
  const filename = `depenses_${format(new Date(), "yyyy-MM-dd")}.csv`;
  downloadCSV(csv, filename);
};
