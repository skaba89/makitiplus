/**
 * Schémas Zod partagés pour les formulaires métier.
 *
 * Ces schémas sont alignés sur les champs RÉELLEMENT utilisés dans les
 * composants forms (ProductForm, Customers.tsx, StockAdjustDialog,
 * CreditPaymentDialog). Ils peuvent être importés non-intrusivement
 * dans les handleSubmit existants pour valider avant envoi au backend.
 *
 * Référence audit : MED-6 (AUDIT-2026-007)
 *
 * Usage :
 *   import { validateProductForm, validateCustomerForm,
 *            validateStockAdjustment, validateCreditPayment } from "@/lib/schemas";
 *
 *   const result = validateProductForm(formData);
 *   if (!result.success) {
 *     toast({ variant: "destructive", title: "Erreur",
 *             description: Object.values(result.errors).join(", ") });
 *     return;
 *   }
 *   onSubmit(result.data);
 */

import { z } from "zod";

// ─── Product (aligné sur ProductForm.tsx) ─────────────────────────
// Champs utilisés dans src/components/products/ProductForm.tsx :
// name, price, cost_price, stock_quantity, min_stock_alert,
// category_id, supplier_id, barcode, unit, tax_rate
export const productFormSchema = z.object({
  name: z
    .string()
    .min(1, "Le nom est requis")
    .max(200, "Le nom ne peut pas dépasser 200 caracteurs")
    .trim(),
  price: z
    .number()
    .min(0, "Le prix de vente ne peut pas être négatif")
    .max(1_000_000_000, "Prix de vente trop élevé")
    .refine((v) => !Number.isNaN(v), "Prix de vente invalide"),
  cost_price: z
    .number()
    .min(0, "Le prix d'achat ne peut pas être négatif")
    .max(1_000_000_000, "Prix d'achat trop élevé")
    .refine((v) => !Number.isNaN(v), "Prix d'achat invalide"),
  stock_quantity: z
    .number()
    .int("Le stock doit être un entier")
    .min(0, "Le stock ne peut pas être négatif")
    .max(10_000_000, "Stock trop élevé"),
  min_stock_alert: z
    .number()
    .int("Le seuil d'alerte doit être un entier")
    .min(0, "Le seuil d'alerte ne peut pas être négatif")
    .max(1_000_000, "Seuil trop élevé"),
  category_id: z
    .string()
    .uuid("Catégorie invalide")
    .optional()
    .or(z.literal("")),
  supplier_id: z
    .string()
    .uuid("Fournisseur invalide")
    .optional()
    .or(z.literal("")),
  barcode: z
    .string()
    .max(100, "Le code-barres ne peut pas dépasser 100 caractères")
    .regex(/^[\w\-]*$/, "Code-barres invalide (alphanumérique, tirets uniquement)")
    .optional()
    .or(z.literal("")),
  unit: z
    .string()
    .max(50, "L'unité ne peut pas dépasser 50 caractères")
    .optional()
    .or(z.literal("")),
  tax_rate: z
    .number()
    .min(0, "Le taux de TVA ne peut pas être négatif")
    .max(100, "Le taux de TVA ne peut pas dépasser 100%")
    .nullable()
    .optional(),
});

export type ProductFormData = z.infer<typeof productFormSchema>;

// ─── Customer (aligné sur Customers.tsx) ──────────────────────────
// Champs utilisés : name, phone, email, address, notes
export const customerFormSchema = z.object({
  name: z
    .string()
    .min(1, "Le nom est requis")
    .max(200, "Le nom ne peut pas dépasser 200 caractères")
    .trim(),
  phone: z
    .string()
    .max(30, "Téléphone trop long")
    .regex(/^[\d\s\-\+()]*$/, "Téléphone invalide")
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .email("Email invalide")
    .max(255, "Email trop long")
    .optional()
    .or(z.literal("")),
  address: z
    .string()
    .max(500, "Adresse trop longue")
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .max(2000, "Notes trop longues")
    .optional()
    .or(z.literal("")),
});

export type CustomerFormData = z.infer<typeof customerFormSchema>;

// ─── Stock Adjustment (aligné sur StockAdjustDialog.tsx) ──────────
// Champs : productId, type ('restock' | 'adjustment' | 'loss'), quantity, reason
export const stockAdjustmentSchema = z.object({
  productId: z.string().uuid("Produit invalide"),
  type: z.enum(["restock", "adjustment", "loss"], {
    errorMap: () => ({ message: "Type d'ajustement invalide" }),
  }),
  quantity: z
    .number()
    .int("La quantité doit être un entier")
    .min(1, "La quantité doit être supérieure à 0")
    .max(1_000_000, "Quantité trop élevée"),
  reason: z
    .string()
    .min(1, "La raison est requise")
    .max(500, "Raison trop longue")
    .trim(),
  previousQuantity: z
    .number()
    .int()
    .min(0)
    .optional(),
});

export type StockAdjustmentData = z.infer<typeof stockAdjustmentSchema>;

// ─── Credit Payment (aligné sur CreditPaymentDialog.tsx) ──────────
// Champs : customerId, amount (string → number), description
export const creditPaymentSchema = z.object({
  customerId: z.string().uuid("Client invalide"),
  amount: z
    .number()
    .min(0.01, "Le montant doit être supérieur à 0")
    .max(1_000_000_000, "Montant trop élevé")
    .refine((v) => !Number.isNaN(v), "Montant invalide"),
  description: z
    .string()
    .max(500, "Description trop longue")
    .optional()
    .or(z.literal("")),
});

export type CreditPaymentData = z.infer<typeof creditPaymentSchema>;

// ─── Helpers : safe parse avec erreurs formatées ─────────────────

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string> };

/**
 * Valide des données avec un schéma Zod et retourne un objet d'erreurs
 * formaté { fieldName: "message" } prêt à être utilisé dans un toast.
 */
export function validateForm<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0]?.toString() ?? "_root";
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }
  return { success: false, errors };
}

// Wrappers typés par form pour usage direct
export const validateProductForm = (data: unknown): ValidationResult<ProductFormData> =>
  validateForm(productFormSchema, data);

export const validateCustomerForm = (data: unknown): ValidationResult<CustomerFormData> =>
  validateForm(customerFormSchema, data);

export const validateStockAdjustment = (data: unknown): ValidationResult<StockAdjustmentData> =>
  validateForm(stockAdjustmentSchema, data);

export const validateCreditPayment = (data: unknown): ValidationResult<CreditPaymentData> =>
  validateForm(creditPaymentSchema, data);

/**
 * Convertit un objet d'erreurs en chaîne lisible pour un toast.
 * Exemple : { name: "Requis", price: "Négatif" } → "name: Requis, price: Négatif"
 */
export function formatErrors(errors: Record<string, string>): string {
  return Object.entries(errors)
    .map(([field, msg]) => `${field}: ${msg}`)
    .join(", ");
}
