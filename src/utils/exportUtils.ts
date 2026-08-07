import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface SaleExportRow {
  sale_number: string;
  created_at: string;
  customer_name: string | null;
  payment_method: string;
  payment_reference?: string | null;
  subtotal: number;
  total_amount: number;
  discount_amount: number | null;
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
  expiry_date: string | null;
  barcode: string | null;
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
    "Référence transaction",
    `Sous-total (${sym})`,
    `Remise (${sym})`,
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
      escapeCSV(sale.payment_reference || "-"),
      escapeCSV(sale.subtotal),
      escapeCSV(sale.discount_amount || 0),
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
    "Code-barres",
    `Prix de vente (${sym})`,
    `Prix d'achat (${sym})`,
    `Marge unitaire (${sym})`,
    "Marge (%)",
    "Stock",
    "Seuil d'alerte",
    "Unité",
    "Actif",
    "Date de péremption",
    "Valeur stock (vente)",
    "Valeur stock (achat)",
  ];

  const rows = products.map((product) => {
    const costPrice = Number(product.cost_price || 0);
    const margin = costPrice > 0 ? product.price - costPrice : 0;
    const marginPct = costPrice > 0 ? Math.round((margin / product.price) * 100) : 0;
    const stockValueSale = product.price * product.stock_quantity;
    const stockValueCost = costPrice * product.stock_quantity;
    const expiryDate = product.expiry_date
      ? format(new Date(product.expiry_date), "dd/MM/yyyy", { locale: fr })
      : "-";

    return [
      escapeCSV(product.name),
      escapeCSV(product.category || "-"),
      escapeCSV(product.barcode || "-"),
      escapeCSV(product.price),
      escapeCSV(product.cost_price || "-"),
      escapeCSV(costPrice > 0 ? margin : "-"),
      escapeCSV(costPrice > 0 ? `${marginPct}%` : "-"),
      escapeCSV(product.stock_quantity),
      escapeCSV(product.min_stock_alert || "-"),
      escapeCSV(product.unit || "unité"),
      escapeCSV(product.is_active ? "Oui" : "Non"),
      escapeCSV(expiryDate),
      escapeCSV(stockValueSale),
      escapeCSV(costPrice > 0 ? stockValueCost : "-"),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const filename = `stock_${format(new Date(), "yyyy-MM-dd")}.csv`;
  downloadCSV(csv, filename);
};

interface CustomerExportRow {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  total_credit: number;
  notes: string | null;
  created_at: string;
}

export const exportCustomersToCSV = (customers: CustomerExportRow[], currencySymbol: string = "GNF"): void => {
  const sym = currencySymbol;
  const headers = [
    "Nom",
    "Téléphone",
    "Email",
    "Adresse",
    `Crédit total (${sym})`,
    "Notes",
    "Date de création",
  ];

  const rows = customers.map((customer) => [
    escapeCSV(customer.name),
    escapeCSV(customer.phone || "-"),
    escapeCSV(customer.email || "-"),
    escapeCSV(customer.address || "-"),
    escapeCSV(customer.total_credit),
    escapeCSV(customer.notes || "-"),
    escapeCSV(format(new Date(customer.created_at), "dd/MM/yyyy", { locale: fr })),
  ].join(","));

  const csv = [headers.join(","), ...rows].join("\n");
  const filename = `clients_${format(new Date(), "yyyy-MM-dd")}.csv`;
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
