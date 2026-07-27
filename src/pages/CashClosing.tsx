/**
 * Cash Closing — Clôture de caisse en fin de journée
 *
 * Permet au gérant de :
 * - Voir le total des ventes par mode de paiement (espèces, Wave, Orange Money, crédit)
 * - Compter la caisse réelle (saisir le montant physique)
 * - Calculer l'écart (attendu vs réel)
 * - Enregistrer la clôture
 * - Imprimer le rapport
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { useCurrency } from "@/hooks/useCurrency";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { CurrencyDisplaySelector } from "@/components/ui/currency-display-selector";
import { useToast } from "@/hooks/use-toast";
import { reportError } from "@/lib/sentry";
import { extractErrorMessage } from "@/lib/extractErrorMessage";
import { Wallet, Printer, CheckCircle, AlertTriangle, TrendingUp, Banknote, History, Info } from "lucide-react";
import { startOfDay, endOfDay, format } from "date-fns";
import { fr } from "date-fns/locale";

const CASH_CLOSING_DESCRIPTION_PREFIX = "Clôture de caisse ";

interface CashClosingMetadata {
  date: string;
  total_sales: number;
  cash_sales: number;
  expenses: number;
  expected_cash: number;
  actual_cash: number;
  difference: number;
  notes: string | null;
}

interface CashClosingLogEntry {
  id: string;
  created_at: string;
  metadata: CashClosingMetadata;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Espèces",
  wave: "Wave",
  orange_money: "Orange Money",
  mtn_money: "MTN Money",
  credit: "Crédit",
};

const PAYMENT_ICONS: Record<string, string> = {
  cash: "💵",
  wave: "📱",
  orange_money: "🟠",
  mtn_money: "🟡",
  credit: "⏰",
};

export default function CashClosing() {
  const { user, profile } = useAuth();
  const { formatPrice } = useCurrency();
  const { effectiveOrgId } = useOrgSelector();
  const {
    formatDisplayPrice,
    displayCurrencyCode,
    orgCurrencyCode,
    setDisplayCurrency,
    ratesLoading,
    refreshRates,
    isConverted,
  } = useDisplayCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date();
  const dayStart = startOfDay(today).toISOString();
  const dayEnd = endOfDay(today).toISOString();

  // Ventes du jour par mode de paiement
  const { data: salesByMethod, isLoading } = useQuery({
    queryKey: ["cash-closing", user?.id, dayStart],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      try {
        const { data, error } = await supabase
          .from("sales")
          .select("total_amount, payment_method, amount_paid, change_amount")
          .eq("organization_id", effectiveOrgId)
          .gte("created_at", dayStart)
          .lte("created_at", dayEnd);

        if (error) return [];

        // Grouper par mode de paiement
        const grouped: Record<string, { total: number; count: number }> = {};
        (data || []).forEach((sale) => {
          const method = sale.payment_method as string;
          if (!grouped[method]) grouped[method] = { total: 0, count: 0 };
          grouped[method].total += Number(sale.total_amount);
          grouped[method].count += 1;
        });

        return Object.entries(grouped).map(([method, stats]) => ({
          method,
          total: stats.total,
          count: stats.count,
        }));
      } catch {
        return [];
      }
    },
    enabled: !!user,
    retry: 1,
  });

  // Dépenses du jour
  const { data: expensesToday } = useQuery({
    queryKey: ["expenses-today", user?.id, dayStart],
    queryFn: async () => {
      if (!effectiveOrgId) return 0;
      try {
        const { data, error } = await supabase
          .from("expenses")
          .select("amount")
          .eq("organization_id", effectiveOrgId)
          .eq("expense_date", format(today, "yyyy-MM-dd"));
        if (error) return 0;
        return (data || []).reduce((sum, e) => sum + Number(e.amount), 0);
      } catch {
        return 0;
      }
    },
    enabled: !!user,
    retry: 1,
  });

  const totalSales = (salesByMethod || []).reduce((sum, s) => sum + s.total, 0);
  const cashSales = (salesByMethod || []).find((s) => s.method === "cash")?.total ?? 0;
  const totalExpenses = expensesToday ?? 0;
  const expectedCash = cashSales - totalExpenses;

  // Historique des clôtures — lecture seule, ne touche pas à la logique de clôture existante
  const { data: closingHistory } = useQuery({
    queryKey: ["cash-closing-history", user?.id, effectiveOrgId],
    queryFn: async (): Promise<CashClosingLogEntry[]> => {
      if (!effectiveOrgId) return [];
      try {
        const { data, error } = await supabase
          .from("user_activity_logs")
          .select("id, created_at, metadata")
          .eq("organization_id", effectiveOrgId)
          .eq("action", "settings_updated")
          .like("description", `${CASH_CLOSING_DESCRIPTION_PREFIX}%`)
          .order("created_at", { ascending: false })
          .limit(30);
        if (error) return [];
        return (data || [])
          .filter((entry) => entry.metadata && typeof entry.metadata === "object")
          .map((entry) => ({
            id: entry.id,
            created_at: entry.created_at,
            metadata: entry.metadata as unknown as CashClosingMetadata,
          }));
      } catch {
        return [];
      }
    },
    enabled: !!user && !!effectiveOrgId,
    retry: 1,
  });

  const todayDateStr = format(today, "yyyy-MM-dd");
  const alreadyClosedToday = (closingHistory || []).some((c) => c.metadata?.date === todayDateStr);

  const [actualCash, setActualCash] = useState<string>("");
  const [notes, setNotes] = useState("");

  const difference = (parseFloat(actualCash) || 0) - expectedCash;

  const handleClose = useMutation({
    mutationFn: async () => {
      // Enregistrer la clôture dans user_activity_logs. La table s'appelait
      // "app_activity" dans un commentaire précédent mais n'a jamais existé
      // sous ce nom — l'insertion échouait donc silencieusement à chaque
      // clôture de caisse (erreur avalée par `if (error) return [];`
      // ci-dessous auparavant, sans jamais remonter à l'utilisateur).
      // "settings_updated" est réutilisé faute d'une valeur "cash_closing"
      // dans l'ENUM app_activity_action (aucune valeur dédiée n'existe côté
      // schéma) — imprécis mais fonctionnel ; `description` porte le vrai
      // libellé. Ajouter la valeur d'ENUM dédiée est un changement de schéma
      // additif à part, non fait ici.
      const { error } = await supabase.from("user_activity_logs").insert({
        user_id: user?.id ?? "",
        action: "settings_updated",
        description: `Clôture de caisse ${format(today, "yyyy-MM-dd")}`,
        metadata: {
          date: format(today, "yyyy-MM-dd"),
          total_sales: totalSales,
          cash_sales: cashSales,
          expenses: totalExpenses,
          expected_cash: expectedCash,
          actual_cash: parseFloat(actualCash) || 0,
          difference: difference,
          sales_by_method: salesByMethod,
          notes: notes || null,
        } as never,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-closing"] });
      queryClient.invalidateQueries({ queryKey: ["cash-closing-history"] });
      toast({
        title: "Caisse clôturée",
        description: difference === 0
          ? "Aucun écart — caisse parfaite !"
          : difference > 0
          ? `Excédent de ${formatPrice(Math.abs(difference))}`
          : `Manque de ${formatPrice(Math.abs(difference))}`,
      });
      setActualCash("");
      setNotes("");
    },
    onError: (error: unknown) => {
      const msg = extractErrorMessage(error);
      toast({ variant: "destructive", title: "Erreur", description: msg });
      reportError(error instanceof Error ? error : new Error(msg));
    },
  });

  const handlePrint = () => {
    const itemsHtml = (salesByMethod || [])
      .map(
        (s) => `
        <tr>
          <td style="padding:8px;">${PAYMENT_ICONS[s.method] || ""} ${PAYMENT_LABELS[s.method] || s.method}</td>
          <td style="padding:8px;text-align:center;">${s.count}</td>
          <td style="padding:8px;text-align:right;">${formatPrice(s.total)}</td>
        </tr>`
      )
      .join("");

    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Clôture de caisse ${format(today, "dd/MM/yyyy")}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #F97316; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th { background: #F97316; color: white; padding: 8px; }
        td { border: 1px solid #ddd; }
        .total { font-size: 20px; font-weight: bold; text-align: right; margin: 10px 0; }
        .ecart { font-size: 18px; margin: 10px 0; padding: 10px; border-radius: 5px; }
      </style></head><body>
        <h1>Clôture de Caisse</h1>
        <p><strong>Date :</strong> ${format(today, "EEEE dd MMMM yyyy", { locale: fr })}</p>
        <p><strong>Boutique :</strong> ${profile?.business_name || ""}</p>
        <table>
          <thead><tr><th>Mode de paiement</th><th>Nombre</th><th>Montant</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div class="total">Total ventes : ${formatPrice(totalSales)}</div>
        <div class="total">Dépenses : ${formatPrice(totalExpenses)}</div>
        <div class="total">Caisse attendue : ${formatPrice(expectedCash)}</div>
        <div class="total">Caisse réelle : ${formatPrice(parseFloat(actualCash) || 0)}</div>
        <div class="ecart" style="background: ${difference === 0 ? "#d4edda" : difference > 0 ? "#fff3cd" : "#f8d7da"};">
          Écart : ${difference === 0 ? "0 (parfait)" : difference > 0 ? `+${formatPrice(difference)} (excédent)` : `${formatPrice(difference)} (manque)`}
        </div>
        ${notes ? `<p><strong>Notes :</strong> ${notes}</p>` : ""}
      </body></html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="h-6 w-6 text-primary" />
              Clôture de Caisse
            </h1>
            <p className="text-muted-foreground mt-1">
              {format(today, "EEEE dd MMMM yyyy", { locale: fr })}
            </p>
          </div>
          <CurrencyDisplaySelector
            orgCurrencyCode={orgCurrencyCode}
            displayCurrencyCode={displayCurrencyCode}
            onDisplayCurrencyChange={setDisplayCurrency}
            ratesLoading={ratesLoading}
            onRefreshRates={refreshRates}
          />
        </div>

        {alreadyClosedToday && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30">
            <Info className="h-5 w-5 text-warning shrink-0" />
            <p className="text-sm">
              La caisse a déjà été clôturée aujourd'hui. Une nouvelle clôture ajoutera une entrée
              supplémentaire à l'historique — assurez-vous que c'est intentionnel (ex : correction).
            </p>
          </div>
        )}

        {/* Résumé des ventes par mode de paiement */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Ventes du jour par mode de paiement
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-center py-4">Chargement...</p>
            ) : (salesByMethod || []).length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Aucune vente aujourd'hui
              </p>
            ) : (
              <div className="space-y-2">
                {(salesByMethod || []).map((s) => (
                  <div
                    key={s.method}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{PAYMENT_ICONS[s.method] || "💰"}</span>
                      <div>
                        <p className="font-medium">
                          {PAYMENT_LABELS[s.method] || s.method}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.count} vente(s)
                        </p>
                      </div>
                    </div>
                    <span className="font-bold text-lg">
                      {formatDisplayPrice(s.total, { showOriginal: isConverted })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Résumé financier */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="card-elevated">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-1">Total ventes</div>
              <div className="text-2xl font-bold text-primary">
                {formatDisplayPrice(totalSales, { showOriginal: isConverted })}
              </div>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-1">Dépenses</div>
              <div className="text-2xl font-bold text-destructive">
                {formatDisplayPrice(totalExpenses, { showOriginal: isConverted })}
              </div>
            </CardContent>
          </Card>
          <Card className="card-elevated border-primary/30">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-1">
                Caisse attendue (espèces - dépenses)
              </div>
              <div className="text-2xl font-bold text-primary">
                {formatDisplayPrice(expectedCash, { showOriginal: isConverted })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Saisie de la caisse réelle */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              Comptage de la caisse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="actual-cash">
                Montant réel en caisse (espèces physiques)
              </Label>
              <Input
                id="actual-cash"
                type="number"
                min="0"
                placeholder="Ex: 500000"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                className="text-lg font-bold"
              />
            </div>

            {actualCash && (
              <div
                className={`p-4 rounded-lg flex items-center gap-3 ${
                  difference === 0
                    ? "bg-success/10"
                    : difference > 0
                    ? "bg-warning/10"
                    : "bg-destructive/10"
                }`}
              >
                {difference === 0 ? (
                  <CheckCircle className="h-6 w-6 text-success" />
                ) : (
                  <AlertTriangle
                    className={`h-6 w-6 ${
                      difference > 0 ? "text-warning" : "text-destructive"
                    }`}
                  />
                )}
                <div>
                  <p className="font-bold">
                    {difference === 0
                      ? "Caisse parfaite — aucun écart"
                      : difference > 0
                      ? `Excédent de ${formatDisplayPrice(Math.abs(difference), { showOriginal: isConverted })}`
                      : `Manque de ${formatDisplayPrice(Math.abs(difference), { showOriginal: isConverted })}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Attendu : {formatDisplayPrice(expectedCash, { showOriginal: isConverted })} | Réel : {" "}
                    {formatDisplayPrice(parseFloat(actualCash) || 0, { showOriginal: isConverted })}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="closing-notes">Notes (optionnel)</Label>
              <Input
                id="closing-notes"
                placeholder="Ex: Bons de caisse, explications d'écart..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleClose.mutate()}
                disabled={!actualCash || handleClose.isPending}
                className="gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                {handleClose.isPending ? "Clôture..." : "Clôturer la caisse"}
              </Button>
              <Button
                variant="outline"
                onClick={handlePrint}
                disabled={!actualCash}
                className="gap-2"
              >
                <Printer className="h-4 w-4" />
                Imprimer le rapport
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Historique des clôtures — lecture seule */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5" />
              Historique des clôtures
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(closingHistory || []).length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Aucune clôture enregistrée pour le moment
              </p>
            ) : (
              <div className="space-y-2">
                {(closingHistory || []).map((entry) => {
                  const diff = entry.metadata.difference ?? 0;
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-sm">
                          {format(new Date(entry.created_at), "EEEE dd MMMM yyyy", { locale: fr })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Ventes : {formatDisplayPrice(entry.metadata.total_sales ?? 0, { showOriginal: isConverted })}
                          {entry.metadata.notes ? ` · ${entry.metadata.notes}` : ""}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-bold ${
                          diff === 0 ? "text-success" : diff > 0 ? "text-warning" : "text-destructive"
                        }`}
                      >
                        {diff === 0 ? "Parfait" : diff > 0 ? `+${formatDisplayPrice(diff, { showOriginal: isConverted })}` : formatDisplayPrice(diff, { showOriginal: isConverted })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
