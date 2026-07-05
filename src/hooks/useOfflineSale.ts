/**
 * useOfflineSale — Offline-first sale creation for MakitiPlus POS
 *
 * When online: uses the atomic `create_sale_with_limit` RPC (existing flow).
 * When offline: enqueues the sale into IndexedDB for later sync and
 * generates a local receipt so the merchant can continue serving customers.
 *
 * The offline sale is stored as two queued mutations:
 *   1. INSERT into `sales` (with all sale fields)
 *   2. INSERT into `sale_items` (with all item fields)
 * Plus optionally:
 *   3. INSERT into `customer_credits` (if credit sale)
 *
 * On reconnect, `flushQueue()` from OfflineContext will push these
 * mutations to Supabase in order.
 *
 * IMPORTANT: The offline path does NOT call `create_sale_with_limit` RPC.
 * Instead it enqueues raw INSERT mutations. This means:
 *   - No plan quota check offline (acceptable for pilot — merchants
 *     are on unlimited trials or known plans)
 *   - No atomic stock decrement (stock is adjusted when the queued
 *     sale is synced, which could lead to temporary overselling)
 *   - Sale numbers use the `VTE-{uuid}` fallback format to avoid
 *     collisions with the server-side sequential generator
 */

import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoContext";
import { useOnlineStatus } from "@/contexts/OfflineContext";
import { enqueueMutation, cacheData, OFFLINE_STORES } from "@/lib/offlineQueue";
import { useOrgTaxRate } from "@/hooks/useOrgTaxRate";
import { computeTax } from "@/lib/taxUtils";
import { useCurrency } from "@/hooks/useCurrency";
import { useBranding } from "@/contexts/BrandingContext";
import { useThemeSettings } from "@/contexts/ThemeContext";
import { usePOSCartStore, useCartTotal } from "@/contexts/POSCartContext";
import { reportError } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { ReceiptData } from "@/utils/receiptGenerator";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export interface OfflineSaleResult {
  sale: {
    id: string;
    sale_number: string;
    payment_method: PaymentMethod;
    amount_paid: number;
    customer_name: string | null;
    customer_phone: string | null;
  };
  changeAmount: number;
  creditUpdateFailed: boolean;
  offline: boolean;
}

export interface SaleCompleteData {
  receiptData: ReceiptData;
  result: OfflineSaleResult;
}

export function useOfflineSale(options?: {
  onSaleComplete?: (data: SaleCompleteData) => void;
}) {
  const { user, profile } = useAuth();
  const { blockMutation } = useDemo();
  const { isOnline } = useOnlineStatus();
  const { toast } = useToast();
  const orgTaxRate = useOrgTaxRate();
  const { currency } = useCurrency();
  const { branding } = useBranding();
  const { settings } = useThemeSettings();
  const queryClient = useQueryClient();
  const cart = usePOSCartStore((s) => s.items);
  const cartTotal = useCartTotal();
  const clearCart = usePOSCartStore((s) => s.clearCart);
  const lastSubmitRef = useRef(0);

  const createSaleMutation = useMutation({
    mutationFn: async ({
      paymentMethod,
      amountPaid,
      customerName,
      customerPhone,
    }: {
      paymentMethod: PaymentMethod;
      amountPaid: number;
      customerName?: string;
      customerPhone?: string;
    }): Promise<OfflineSaleResult> => {
      if (blockMutation("Enregistrer une vente")) {
        throw new Error("Mode démo — les ventes sont désactivées");
      }

      if (Date.now() - lastSubmitRef.current < 2000) {
        throw new Error("Vente déjà en cours de traitement");
      }
      lastSubmitRef.current = Date.now();

      // ─── Sale number ──────────────────────────────────────
      let finalSaleNumber = "";
      if (isOnline) {
        try {
          const { data: saleNumber, error: rpcError } = await supabase.rpc("generate_sale_number");
          if (!rpcError && saleNumber) {
            finalSaleNumber = saleNumber;
          }
        } catch {
          // RPC unavailable, use fallback
        }
      }
      // Fallback: always available offline
      if (!finalSaleNumber) {
        const uid = crypto.randomUUID().replace(/-/g, "").substring(0, 12).toUpperCase();
        finalSaleNumber = `VTE-${uid}`;
      }

      // ─── Compute amounts ──────────────────────────────────
      const subtotal = cart.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0
      );
      const taxAmount = cart.reduce((sum, item) => {
        const t = computeTax(item.product.price, item.product.tax_rate, orgTaxRate);
        return sum + t.taxAmount * item.quantity;
      }, 0);
      const totalAmount = subtotal;
      const htAmount = subtotal - taxAmount;
      const changeAmount = amountPaid - totalAmount;

      const saleItems = cart.map((item) => ({
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price,
        total_price: item.product.price * item.quantity,
      }));

      const orgId = profile?.organization_id || null;

      // ─── ONLINE PATH: Atomic RPC ─────────────────────────
      if (isOnline) {
        const { data: rpcSaleId, error: rpcError } = await supabase.rpc("create_sale_with_limit", {
          p_sale_number: finalSaleNumber,
          p_subtotal: htAmount,
          p_tax_amount: taxAmount,
          p_total_amount: totalAmount,
          p_payment_method: paymentMethod,
          p_amount_paid: amountPaid,
          p_change_amount: changeAmount > 0 ? changeAmount : 0,
          p_customer_name: customerName || null,
          p_customer_phone: customerPhone || null,
          p_seller_name: profile?.owner_name || null,
          p_items: saleItems,
        });

        if (rpcError || !rpcSaleId) {
          throw new Error(
            `Impossible de créer la vente (RPC create_sale_with_limit) : ${rpcError?.message || "Réponse vide"}. Veuillez réessayer.`
          );
        }

        // Fetch sale record for receipt
        const { data: sale } = await supabase
          .from("sales")
          .select("id, sale_number, payment_method, amount_paid, customer_name, customer_phone")
          .eq("id", rpcSaleId)
          .single();

        if (!sale) {
          throw new Error("Vente créée mais introuvable. Veuillez réessayer.");
        }

        // Handle credit sales (same logic as before)
        let creditUpdateFailed = false;
        if (paymentMethod === "credit" && totalAmount > 0) {
          let customerId: string | null = null;
          if (customerPhone) {
            const upsertData: Record<string, unknown> = {
              name: customerName || customerPhone,
              phone: customerPhone,
            };
            if (orgId) upsertData.organization_id = orgId;
            const { data: upsertedCustomer, error: custErr } = await supabase
              .from("customers")
              .upsert(upsertData as never, {
                onConflict: "phone,organization_id",
                ignoreDuplicates: false,
              })
              .select("id")
              .maybeSingle();
            if (!custErr && upsertedCustomer) {
              customerId = upsertedCustomer.id;
            }
          } else if (customerName) {
            const { data: existingCustomer } = await supabase
              .from("customers")
              .select("id")
              .eq("name", customerName)
              .eq("organization_id", orgId)
              .maybeSingle();
            if (existingCustomer) {
              customerId = existingCustomer.id;
            }
          }

          if (customerId) {
            const creditInsert: Record<string, unknown> = {
              user_id: user?.id ?? "",
              customer_id: customerId,
              sale_id: sale.id,
              amount: totalAmount,
              type: "credit",
              description: `Vente crédit ${finalSaleNumber}`,
            };
            if (orgId) creditInsert.organization_id = orgId;
            await supabase.from("customer_credits").insert(creditInsert as never);
            const { error: creditUpdateError } = await supabase.rpc("increment_customer_credit", {
              p_customer_id: customerId,
              p_amount: totalAmount,
            });
            if (creditUpdateError) {
              reportError(new Error(`increment_customer_credit RPC failed: ${creditUpdateError.message}`));
              creditUpdateFailed = true;
            }
          }
        }

        return { sale, changeAmount, creditUpdateFailed, offline: false };
      }

      // ─── OFFLINE PATH: Enqueue to IndexedDB ──────────────
      logger.info(`[OfflineSale] Enqueueing sale ${finalSaleNumber} for later sync`);

      const saleId = crypto.randomUUID();
      const now = new Date().toISOString();

      // 1. Enqueue the sale INSERT
      await enqueueMutation({
        table: "sales",
        operation: "INSERT",
        data: {
          id: saleId,
          sale_number: finalSaleNumber,
          subtotal: htAmount,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          payment_method: paymentMethod,
          amount_paid: amountPaid,
          change_amount: changeAmount > 0 ? changeAmount : 0,
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          seller_name: profile?.owner_name || null,
          status: "completed",
          created_at: now,
          user_id: user?.id,
          organization_id: orgId,
        },
        userId: user?.id,
        organizationId: orgId,
      });

      // 2. Enqueue each sale_item INSERT
      for (const item of saleItems) {
        await enqueueMutation({
          table: "sale_items",
          operation: "INSERT",
          data: {
            id: crypto.randomUUID(),
            sale_id: saleId,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price,
            created_at: now,
            organization_id: orgId,
          },
          userId: user?.id,
          organizationId: orgId,
        });
      }

      // 3. If credit sale, enqueue customer credit
      let creditUpdateFailed = false;
      if (paymentMethod === "credit" && totalAmount > 0) {
        // For offline credit sales, we enqueue a customer_credits entry
        // The customer upsert will happen on sync — for now we just track the credit
        await enqueueMutation({
          table: "customer_credits",
          operation: "INSERT",
          data: {
            id: crypto.randomUUID(),
            user_id: user?.id ?? "",
            customer_id: null, // Will be resolved on sync
            sale_id: saleId,
            amount: totalAmount,
            type: "credit",
            description: `Vente crédit hors-ligne ${finalSaleNumber}`,
            created_at: now,
            organization_id: orgId,
          },
          userId: user?.id,
          organizationId: orgId,
        });
        creditUpdateFailed = false; // Not failed, just deferred
      }

      // 4. Cache the sale locally for receipt generation
      try {
        await cacheData(OFFLINE_STORES.SALE_CACHE, [{
          id: saleId,
          sale_number: finalSaleNumber,
          payment_method: paymentMethod,
          amount_paid: amountPaid,
          change_amount: changeAmount > 0 ? changeAmount : 0,
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          total_amount: totalAmount,
          subtotal: htAmount,
          tax_amount: taxAmount,
          created_at: now,
          offline: true,
          _cachedAt: now,
        }]);
      } catch (e) {
        logger.warn("[OfflineSale] Failed to cache sale for receipt:", e);
      }

      return {
        sale: {
          id: saleId,
          sale_number: finalSaleNumber,
          payment_method: paymentMethod,
          amount_paid: amountPaid,
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
        },
        changeAmount,
        creditUpdateFailed,
        offline: true,
      };
    },
    onSuccess: (result) => {
      // Compute receipt data from cart (before clearing)
      const receiptTaxAmount = cart.reduce((sum, item) => {
        const t = computeTax(item.product.price, item.product.tax_rate, orgTaxRate);
        return sum + t.taxAmount * item.quantity;
      }, 0);
      const receiptSubtotal = cartTotal - receiptTaxAmount;

      const receiptData: ReceiptData = {
        saleNumber: result.sale.sale_number,
        date: new Date(),
        items: cart.map((item) => ({
          product_name: item.product.name,
          quantity: item.quantity,
          unit_price: item.product.price,
          total_price: item.product.price * item.quantity,
        })),
        subtotal: receiptSubtotal,
        total: cartTotal,
        paymentMethod: result.sale.payment_method,
        amountPaid: result.sale.amount_paid,
        change: result.changeAmount > 0 ? result.changeAmount : 0,
        customerName: result.sale.customer_name || undefined,
        customerPhone: result.sale.customer_phone || undefined,
        businessName: profile?.business_name || "Ma Boutique",
        businessAddress: profile?.address || undefined,
        businessPhone: profile?.phone || undefined,
        sellerName: profile?.owner_name || undefined,
        currencySymbol: currency.displaySymbol || currency.symbol,
        currencyPosition: currency.position,
        logoUrl: settings?.logo_url || branding.logoUrl,
        template: branding.receiptTemplate,
        paperSize: (settings?.extra_settings as Record<string, string>)?.receiptPaperSize as ReceiptData["paperSize"] || "80mm",
        showLogo: settings?.receipt_show_logo ?? true,
        showTax: settings?.receipt_show_tax ?? true,
        footerText: result.offline
          ? `⚠ HORS-LIGNE — Sera synchronisé à la reconnexion\n${settings?.receipt_footer || ""}`
          : settings?.receipt_footer || undefined,
        organizationId: profile?.organization_id ?? undefined,
        taxRate: orgTaxRate,
      };

      // Clear cart AFTER receipt data is computed
      clearCart();

      // Invalidate queries so product stock counts refresh
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });

      if (result.offline) {
        toast({
          title: "Vente enregistrée hors-ligne",
          description: `Vente ${result.sale.sale_number} enregistrée. Elle sera synchronisée à la reconnexion.`,
          duration: 5000,
        });
      }

      if (result.creditUpdateFailed && !result.offline) {
        toast({
          variant: "destructive",
          title: "Vente enregistrée, crédit en attente",
          description: "La vente est validée mais la mise à jour du crédit client a échoué. Vérifiez les crédits du client.",
          duration: 8000,
        });
      }

      // Notify the parent component (POS.tsx) to open receipt dialog
      options?.onSaleComplete?.({ receiptData, result });
    },
    onError: (error: unknown) => {
      let message = "Impossible d'enregistrer la vente";
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === "object" && error !== null) {
        const err = error as Record<string, unknown>;
        if (typeof err.message === "string") {
          message = err.message;
        }
      }
      const isPlanLimit = message.includes("Limite") || message.includes("plan") || message.includes("Upgrad");
      toast({
        variant: "destructive",
        title: isPlanLimit ? "Limite atteinte" : "Erreur de vente",
        description: isPlanLimit
          ? "Limite de ventes mensuelles atteinte pour votre plan. Upgradez votre abonnement."
          : message,
      });
      if (!isPlanLimit) {
        reportError(error instanceof Error ? error : new Error(message));
      }
    },
  });

  return createSaleMutation;
}
