/**
 * Schémas Zod partagés pour les formulaires métier.
 *
 * Ces schémas sont utilisés côté frontend pour valider les entrées utilisateur
 * avant envoi au backend, et peuvent être réutilisés côté backend (edge functions)
 * pour valider les payloads reçus.
 *
 * Référence audit : MED-6 (AUDIT-2026-007)
 * - Avant : aucun formulaire métier n'utilisait zod. Seul Auth.tsx l'avait.
 * - Après : ces schémas shared peuvent être importés par ProductForm,
 *   CustomerDetailDialog, StockAdjustDialog, CreditPaymentDialog.
 */

import { z } from "zod";

// ─── Product ──────────────────────────────────────────────────────
export const productSchema = z.object({
  name: z
    .string()
    .min(1, "Le nom est requis")
    .max(200, "Le nom ne peut pas dépasser 200 caractères")
    .trim(),
  barcode: z
    .string()
    .max(100, "Le code-barres ne peut pas dépasser 100 caractères")
    .regex(/^[\w\-]*$/, "Code-barres invalide (alphanumérique, tirets uniquement)")
    .optional()
    .or(z.literal("")),
  category_id: z.string().uuid("Catégorie invalide").optional().nullable(),
  unit: z
    .string()
    .max(50, "L'unité ne peut pas dépasser 50 caractères")
    .optional()
    .or(z.literal("")),
  sale_price: z
    .number()
    .min(0, "Le prix de vente ne peut pas être négatif")
    .max(1_000_000_000, "Prix de vente trop élevé")
    .refine((v) => !Number.isNaN(v), "Prix de vente invalide"),
  cost_price: z
    .number()
    .min(0, "Le prix d'achat ne peut pas être négatif")
    .max(1_000_000_000, "Prix d'achat trop élevé")
    .optional()
    .refine((v) => v === undefined || !Number.isNaN(v), "Prix d'achat invalide"),
  stock_quantity: z
    .number()
    .int("Le stock doit être un entier")
    .min(0, "Le stock ne peut pas être négatif")
    .max(10_000_000, "Stock trop élevé"),
  low_stock_threshold: z
    .number()
    .int("Le seuil doit être un entier")
    .min(0, "Le seuil ne peut pas être négatif")
    .max(1_000_000, "Seuil trop élevé")
    .optional(),
  is_active: z.boolean().optional().default(true),
  description: z
    .string()
    .max(2000, "La description ne peut pas dépasser 2000 caractères")
    .optional()
    .or(z.literal("")),
});

export type ProductFormData = z.infer<typeof productSchema>;

// ─── Customer ─────────────────────────────────────────────────────
export const customerSchema = z.object({
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
  credit_limit: z
    .number()
    .min(0, "La limite de crédit ne peut pas être négative")
    .max(1_000_000_000, "Limite trop élevée")
    .optional(),
  notes: z
    .string()
    .max(2000, "Notes trop longues")
    .optional()
    .or(z.literal("")),
});

export type CustomerFormData = z.infer<typeof customerSchema>;

// ─── Stock Adjustment ─────────────────────────────────────────────
export const stockAdjustmentSchema = z.object({
  product_id: z.string().uuid("Produit invalide"),
  new_quantity: z
    .number()
    .int("La quantité doit être un entier")
    .min(0, "La quantité ne peut pas être négative")
    .max(10_000_000, "Quantité trop élevée"),
  reason: z
    .string()
    .min(1, "La raison est requise")
    .max(500, "Raison trop longue")
    .trim(),
  notes: z
    .string()
    .max(1000, "Notes trop longues")
    .optional()
    .or(z.literal("")),
});

export type StockAdjustmentFormData = z.infer<typeof stockAdjustmentSchema>;

// ─── Credit Payment ───────────────────────────────────────────────
export const creditPaymentSchema = z.object({
  customer_id: z.string().uuid("Client invalide"),
  amount: z
    .number()
    .min(0.01, "Le montant doit être supérieur à 0")
    .max(1_000_000_000, "Montant trop élevé")
    .refine((v) => !Number.isNaN(v), "Montant invalide"),
  payment_method: z.enum(["cash", "mobile_money", "card", "bank_transfer"], {
    errorMap: () => ({ message: "Moyen de paiement invalide" }),
  }),
  notes: z
    .string()
    .max(500, "Notes trop longues")
    .optional()
    .or(z.literal("")),
});

export type CreditPaymentFormData = z.infer<typeof creditPaymentSchema>;

// ─── Helper : safe parse with formatted errors ───────────────────
/**
 * Valide des données avec un schéma Zod et retourne un objet d'erreurs
 * formaté { fieldName: "message" } prêt à être utilisé par react-hook-form.
 */
export function validateForm<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
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
