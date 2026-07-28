/**
 * Cash Closing — Clôture de caisse (sessions)
 *
 * Réécriture complète (P3 du plan cash-closing-complete-no-regression) :
 * remplace l'ancienne clôture "instantanée" par un vrai cycle de session
 * (ouverture -> clôture -> approbation), porté par les RPC serveur définies
 * dans 20260727150000_create_cash_register_sessions.sql. Aucun calcul
 * financier n'est fait côté client — tout vient de get_cash_closing_summary.
 *
 * Vues par rôle :
 * - vendeur      : ouvre/clôture SA PROPRE session, ne voit que son historique
 * - manager/admin: pareil + vue équipe (sessions ouvertes, clôtures en attente
 *                  d'approbation) + historique complet de l'organisation
 * - comptable    : lecture seule (historique, export), aucune action
 * - super_admin  : lecture seule, audit uniquement (n'ouvre pas de caisse)
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { useStore } from "@/contexts/StoreContext";
import { useOnlineStatus } from "@/contexts/OfflineContext";
import { useCurrency } from "@/hooks/useCurrency";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { CurrencyDisplaySelector } from "@/components/ui/currency-display-selector";
import { useToast } from "@/hooks/use-toast";
import { reportError } from "@/lib/sentry";
import { extractErrorMessage } from "@/lib/extractErrorMessage";
import {
  Wallet, Printer, CheckCircle, AlertTriangle, TrendingUp, Banknote,
  History, Users, ThumbsUp, ThumbsDown, Lock, Download, MessageCircle, Store as StoreIcon, WifiOff,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CASH_CLOSING_REVIEW_ROLES } from "@/types";
import { toCSV } from "@/utils/csvParser";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Espèces", wave: "Wave", orange_money: "Orange Money",
  mtn_money: "MTN Money", moov_money: "Moov Money", mpesa: "M-Pesa",
  card: "Carte", credit: "Crédit",
};

const PAYMENT_ICONS: Record<string, string> = {
  cash: "💵", wave: "📱", orange_money: "🟠", mtn_money: "🟡",
  moov_money: "🔵", mpesa: "🟢", card: "💳", credit: "⏰",
};

interface CashSummary {
  session_id: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  total_sales: number;
  cash_sales: number;
  wave_sales: number;
  orange_money_sales: number;
  mtn_money_sales: number;
  moov_money_sales: number;
  mpesa_sales: number;
  card_sales: number;
  credit_sales: number;
  transaction_count: number;
  products_sold: number;
  by_seller: { user_id: string; total: number; count: number }[] | null;
  cash_expenses: number;
  total_expenses: number;
  expected_cash: number;
  actual_cash: number | null;
  cash_difference: number | null;
  notes: string | null;
}

type SessionRow = {
  id: string; status: string; opened_at: string; closed_at: string | null;
  opened_by: string; store_id: string | null; opening_cash: number;
  actual_cash: number | null; cash_difference: number | null;
  total_sales: number; notes: string | null;
};

export default function CashClosing() {
  const { user, profile, userRole } = useAuth();
  const { formatPrice } = useCurrency();
  const { effectiveOrgId } = useOrgSelector();
  const { currentStore, stores, isLoading: storeLoading } = useStore();
  const { pendingCount: offlinePendingCount } = useOnlineStatus();
  const {
    formatDisplayPrice, displayCurrencyCode, orgCurrencyCode,
    setDisplayCurrency, ratesLoading, refreshRates, isConverted,
  } = useDisplayCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isReviewer = userRole ? CASH_CLOSING_REVIEW_ROLES.includes(userRole) : false;
  const canApprove = userRole === "admin" || userRole === "manager";
  const canOperate = userRole === "admin" || userRole === "manager" || userRole === "vendeur";
  const isReadOnlyAudit = userRole === "super_admin";

  const [openingCash, setOpeningCash] = useState("");
  const [actualCash, setActualCash] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmCloseWithPending, setConfirmCloseWithPending] = useState(false);
  const [managerNotesBySession, setManagerNotesBySession] = useState<Record<string, string>>({});

  // ─── Filtres historique (P1) ─────────────────────────────────
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterUserId, setFilterUserId] = useState<string>("");
  const [filterStoreId, setFilterStoreId] = useState<string>("");

  // ─── Noms des vendeurs de l'organisation (manager/admin/comptable/super_admin
  // uniquement — un vendeur n'a besoin de voir que le sien, déjà connu). ────
  const { data: orgProfiles } = useQuery({
    queryKey: ["cash-org-profiles", effectiveOrgId],
    queryFn: async (): Promise<{ user_id: string; owner_name: string }[]> => {
      const { data, error } = await supabase.from("profiles").select("user_id, owner_name");
      if (error) return [];
      return data ?? [];
    },
    enabled: !!user && (isReviewer || isReadOnlyAudit),
  });
  const userNameById = new Map((orgProfiles ?? []).map((p) => [p.user_id, p.owner_name]));
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));
  const getSellerName = (userId: string) => userNameById.get(userId) || userId.slice(0, 8);
  const getStoreName = (storeId: string | null) => (storeId ? storeNameById.get(storeId) || "Magasin inconnu" : "—");

  // ─── Ma session ouverte (si je peux opérer une caisse) ─────────
  // Erreurs RPC (P0.3) : jamais masquées en tableau vide/null — une RPC cassée,
  // non déployée ou bloquée par RLS doit se voir dans l'UI (error state React
  // Query), pas ressembler à "aucune session".
  const { data: mySessions, error: mySessionsError } = useQuery({
    queryKey: ["cash-my-session", user?.id, effectiveOrgId, currentStore?.id],
    queryFn: async (): Promise<SessionRow[]> => {
      if (!canOperate || !user) return [];
      const { data, error } = await supabase.rpc("get_cash_register_sessions", {
        p_user_id: user.id, p_status: "open",
        ...(currentStore?.id ? { p_store_id: currentStore.id } : {}),
      });
      if (error) {
        const err = new Error(`RPC get_cash_register_sessions failed: ${error.message}`);
        reportError(err);
        throw err;
      }
      return (data ?? []) as unknown as SessionRow[];
    },
    enabled: !!user && canOperate,
    retry: 1,
  });
  const mySession = mySessions?.[0] ?? null;

  const { data: mySummary, isLoading: summaryLoading, error: mySummaryError } = useQuery({
    queryKey: ["cash-summary", mySession?.id],
    queryFn: async (): Promise<CashSummary | null> => {
      if (!mySession) return null;
      const { data, error } = await supabase.rpc("get_cash_closing_summary", {
        p_session_id: mySession.id,
      });
      if (error) {
        const err = new Error(`RPC get_cash_closing_summary failed: ${error.message}`);
        reportError(err);
        throw err;
      }
      return data as unknown as CashSummary;
    },
    enabled: !!mySession,
    refetchInterval: mySession ? 30_000 : false,
  });

  // ─── Vue équipe (manager/admin) : sessions ouvertes + en attente d'approbation
  const { data: teamOpenSessions, error: teamOpenError } = useQuery({
    queryKey: ["cash-team-open", effectiveOrgId, user?.id],
    queryFn: async (): Promise<SessionRow[]> => {
      const { data, error } = await supabase.rpc("get_cash_register_sessions", { p_status: "open" });
      if (error) {
        const err = new Error(`RPC get_cash_register_sessions failed: ${error.message}`);
        reportError(err);
        throw err;
      }
      return ((data ?? []) as unknown as SessionRow[]).filter((s) => s.opened_by !== user?.id);
    },
    enabled: !!user && canApprove,
  });

  const { data: pendingApprovals, error: pendingApprovalsError } = useQuery({
    queryKey: ["cash-pending-approvals", effectiveOrgId],
    queryFn: async (): Promise<SessionRow[]> => {
      const { data, error } = await supabase.rpc("get_cash_register_sessions", { p_status: "closed" });
      if (error) {
        const err = new Error(`RPC get_cash_register_sessions failed: ${error.message}`);
        reportError(err);
        throw err;
      }
      return (data ?? []) as unknown as SessionRow[];
    },
    enabled: !!user && canApprove,
  });

  // ─── Historique (tous rôles avec accès) ─────────────────────────
  // Filtres (P1) : la RPC supporte déjà p_store_id/p_user_id/p_status/
  // p_from_date/p_to_date -- aucune migration nécessaire, uniquement le
  // câblage des filtres UI vers des paramètres déjà exposés côté serveur.
  const { data: history, error: historyError } = useQuery({
    queryKey: ["cash-history", effectiveOrgId, user?.id, isReviewer, filterFromDate, filterToDate, filterStatus, filterUserId, filterStoreId],
    queryFn: async (): Promise<SessionRow[]> => {
      const { data, error } = await supabase.rpc("get_cash_register_sessions", {
        ...(filterFromDate ? { p_from_date: filterFromDate } : {}),
        ...(filterToDate ? { p_to_date: filterToDate } : {}),
        ...(filterStatus ? { p_status: filterStatus } : {}),
        ...(filterUserId ? { p_user_id: filterUserId } : {}),
        ...(filterStoreId ? { p_store_id: filterStoreId } : {}),
      });
      if (error) {
        const err = new Error(`RPC get_cash_register_sessions failed: ${error.message}`);
        reportError(err);
        throw err;
      }
      return (data ?? []) as unknown as SessionRow[];
    },
    enabled: !!user,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["cash-my-session"] });
    queryClient.invalidateQueries({ queryKey: ["cash-summary"] });
    queryClient.invalidateQueries({ queryKey: ["cash-team-open"] });
    queryClient.invalidateQueries({ queryKey: ["cash-pending-approvals"] });
    queryClient.invalidateQueries({ queryKey: ["cash-history"] });
  };

  const openMutation = useMutation({
    mutationFn: async () => {
      // P0.1 : une session doit toujours être liée à un magasin explicite
      // quand l'organisation EST multi-magasin — sans ça, plusieurs magasins
      // pourraient mélanger leurs ventes dans une même session (store_id NULL).
      // Ne jamais bloquer les organisations mono-magasin (ex. Diallo & Frères,
      // qui n'a aucune ligne dans `stores` — StoreContext.stores reste vide et
      // currentStore restera toujours null pour elles, ce n'est pas un état
      // d'erreur) : on ne bloque que si l'organisation A des magasins définis
      // mais qu'aucun n'est actuellement sélectionné.
      if (!storeLoading && stores.length > 0 && !currentStore?.id) {
        throw new Error("Sélectionnez un magasin avant d'ouvrir la caisse.");
      }
      const { error } = await supabase.rpc("open_cash_register_session", {
        p_store_id: currentStore?.id,
        p_opening_cash: parseFloat(openingCash) || 0,
        p_notes: notes || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setOpeningCash("");
      setNotes("");
      toast({ title: "Caisse ouverte", description: "Session de caisse démarrée." });
    },
    onError: (error: unknown) => {
      const msg = extractErrorMessage(error);
      toast({ variant: "destructive", title: "Erreur", description: msg });
      reportError(error instanceof Error ? error : new Error(msg));
    },
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!mySession) throw new Error("Aucune session ouverte");
      const { error } = await supabase.rpc("close_cash_register_session", {
        p_session_id: mySession.id,
        p_actual_cash: parseFloat(actualCash) || 0,
        p_notes: notes || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Caisse clôturée", description: "En attente d'approbation si applicable." });
      setActualCash("");
      setNotes("");
      setConfirmCloseWithPending(false);
    },
    onError: (error: unknown) => {
      const msg = extractErrorMessage(error);
      toast({ variant: "destructive", title: "Erreur", description: msg });
      reportError(error instanceof Error ? error : new Error(msg));
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.rpc("approve_cash_register_session", {
        p_session_id: sessionId, p_manager_notes: managerNotesBySession[sessionId] || undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_data, sessionId) => {
      setManagerNotesBySession((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      invalidateAll();
      toast({ title: "Clôture approuvée" });
    },
    onError: (error: unknown) => {
      const msg = extractErrorMessage(error);
      toast({ variant: "destructive", title: "Erreur", description: msg });
      reportError(error instanceof Error ? error : new Error(msg));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const reason = managerNotesBySession[sessionId] || "";
      if (!reason.trim()) throw new Error("Une raison de rejet est obligatoire");
      const { error } = await supabase.rpc("reject_cash_register_session", {
        p_session_id: sessionId, p_rejection_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: (_data, sessionId) => {
      setManagerNotesBySession((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      invalidateAll();
      toast({ title: "Clôture rejetée" });
    },
    onError: (error: unknown) => {
      const msg = extractErrorMessage(error);
      toast({ variant: "destructive", title: "Erreur", description: msg });
      reportError(error instanceof Error ? error : new Error(msg));
    },
  });

  const handlePrint = () => {
    if (!mySummary) return;
    const rows = [
      ["cash", mySummary.cash_sales], ["wave", mySummary.wave_sales],
      ["orange_money", mySummary.orange_money_sales], ["mtn_money", mySummary.mtn_money_sales],
      ["moov_money", mySummary.moov_money_sales], ["mpesa", mySummary.mpesa_sales],
      ["card", mySummary.card_sales], ["credit", mySummary.credit_sales],
    ].filter(([, v]) => (v as number) > 0);
    const itemsHtml = rows.map(([m, v]) => `
      <tr><td style="padding:8px;">${PAYMENT_ICONS[m as string] || ""} ${PAYMENT_LABELS[m as string] || m}</td>
      <td style="padding:8px;text-align:right;">${formatPrice(v as number)}</td></tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Clôture de caisse</title>
      <style>body{font-family:Arial,sans-serif;margin:20px}h1{color:#F97316}
      table{width:100%;border-collapse:collapse;margin:15px 0}th{background:#F97316;color:#fff;padding:8px}
      td{border:1px solid #ddd}.total{font-size:18px;font-weight:bold;text-align:right;margin:8px 0}
      .ecart{font-size:16px;margin:10px 0;padding:10px;border-radius:5px}</style></head><body>
      <h1>Clôture de Caisse</h1>
      <p><strong>Boutique :</strong> ${profile?.business_name || ""}</p>
      <p><strong>Ouverture :</strong> ${format(new Date(mySummary.opened_at), "dd/MM/yyyy HH:mm", { locale: fr })}</p>
      <p><strong>Clôture :</strong> ${mySummary.closed_at ? format(new Date(mySummary.closed_at), "dd/MM/yyyy HH:mm", { locale: fr }) : "—"}</p>
      <table><thead><tr><th>Mode de paiement</th><th>Montant</th></tr></thead><tbody>${itemsHtml}</tbody></table>
      <div class="total">Total ventes : ${formatPrice(mySummary.total_sales)}</div>
      <div class="total">Dépenses : ${formatPrice(mySummary.total_expenses)}</div>
      <div class="total">Caisse attendue : ${formatPrice(mySummary.expected_cash)}</div>
      ${mySummary.actual_cash !== null ? `<div class="total">Caisse réelle : ${formatPrice(mySummary.actual_cash)}</div>
      <div class="ecart" style="background:${mySummary.cash_difference === 0 ? "#d4edda" : (mySummary.cash_difference ?? 0) > 0 ? "#fff3cd" : "#f8d7da"};">
        Écart : ${mySummary.cash_difference === 0 ? "0 (parfait)" : `${formatPrice(mySummary.cash_difference ?? 0)}`}</div>` : ""}
      ${mySummary.notes ? `<p><strong>Notes :</strong> ${mySummary.notes}</p>` : ""}
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const handleExportHistoryCSV = () => {
    if (!history || history.length === 0) return;
    const rows = [
      ["vendeur", "magasin", "date_ouverture", "date_cloture", "statut", "total_ventes", "montant_reel", "ecart", "notes"],
      ...history.map((s) => [
        getSellerName(s.opened_by),
        getStoreName(s.store_id),
        format(new Date(s.opened_at), "yyyy-MM-dd HH:mm"),
        s.closed_at ? format(new Date(s.closed_at), "yyyy-MM-dd HH:mm") : "",
        s.status,
        String(s.total_sales ?? 0),
        s.actual_cash !== null ? String(s.actual_cash) : "",
        s.cash_difference !== null ? String(s.cash_difference) : "",
        s.notes ?? "",
      ]),
    ];
    const blob = new Blob(["﻿" + toCSV(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clotures-caisse-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShareWhatsApp = () => {
    if (!mySummary) return;
    const phone = prompt("Numéro WhatsApp du destinataire (ex: 224622000000):");
    if (!phone) return;
    const cleanPhone = phone.replace(/[\s+\-()]/g, "");
    const msg = `📊 *Clôture de caisse — ${profile?.business_name || ""}*

Ouverture : ${format(new Date(mySummary.opened_at), "dd/MM/yyyy HH:mm")}
Total ventes : ${formatPrice(mySummary.total_sales)}
Dépenses : ${formatPrice(mySummary.total_expenses)}
Caisse attendue : ${formatPrice(mySummary.expected_cash)}
${mySummary.actual_cash !== null ? `Caisse réelle : ${formatPrice(mySummary.actual_cash)}\nÉcart : ${formatPrice(mySummary.cash_difference ?? 0)}` : ""}
${mySummary.notes ? `Notes : ${mySummary.notes}` : ""}

— MakitiPlus`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const roleLabel = userRole === "vendeur" ? "Vendeur" : userRole === "manager" ? "Manager"
    : userRole === "admin" ? "Administrateur" : userRole === "comptable" ? "Comptable" : "Super admin";

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="h-6 w-6 text-primary" /> Clôture de Caisse
            </h1>
            <p className="text-muted-foreground mt-1">{roleLabel}</p>
          </div>
          <CurrencyDisplaySelector
            orgCurrencyCode={orgCurrencyCode} displayCurrencyCode={displayCurrencyCode}
            onDisplayCurrencyChange={setDisplayCurrency} ratesLoading={ratesLoading}
            onRefreshRates={refreshRates}
          />
        </div>

        {isReadOnlyAudit && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted border">
            <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Vue audit — un super_admin ne gère pas de caisse opérationnelle de magasin.
            </p>
          </div>
        )}

        {/* P0.3 : une RPC en échec ne doit jamais ressembler à "aucune donnée" —
            on l'affiche explicitement plutôt que de laisser une liste vide
            se faire passer pour "pas de session". */}
        {(mySessionsError || mySummaryError || teamOpenError || pendingApprovalsError || historyError) && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-medium text-sm text-destructive">Impossible de charger les sessions de caisse.</p>
              <p className="text-xs text-muted-foreground">
                Les données ne sont pas vides : le service de clôture caisse a échoué. Réessayez ou contactez le support.
              </p>
            </div>
          </div>
        )}

        {/* ─── Ma session ─────────────────────────────────────── */}
        {canOperate && !mySession && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Banknote className="h-5 w-5" /> Ouvrir ma caisse
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {stores.length > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border text-sm">
                  <StoreIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  {currentStore ? (
                    <span>Magasin : <strong>{currentStore.name}</strong></span>
                  ) : (
                    <span className="text-warning">Aucun magasin sélectionné — sélectionnez un magasin avant d'ouvrir la caisse.</span>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="opening-cash">Fond de caisse initial</Label>
                <Input
                  id="opening-cash" type="number" min="0" placeholder="Ex: 50000"
                  value={openingCash} onChange={(e) => setOpeningCash(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="open-notes">Notes (optionnel)</Label>
                <Input id="open-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button
                onClick={() => openMutation.mutate()}
                disabled={openMutation.isPending || (stores.length > 0 && !currentStore?.id)}
                className="gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                {openMutation.isPending ? "Ouverture…" : "Ouvrir la caisse"}
              </Button>
            </CardContent>
          </Card>
        )}

        {canOperate && mySession && mySummary && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" /> Session en cours
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stores.length > 0 && (
                  <p className="text-sm font-medium flex items-center gap-1.5 mb-1">
                    <StoreIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    {stores.find((s) => s.id === mySession?.store_id)?.name || currentStore?.name || "Magasin inconnu"}
                  </p>
                )}
                <p className="text-sm text-muted-foreground mb-3">
                  Ouverte le {format(new Date(mySummary.opened_at), "EEEE dd MMMM yyyy 'à' HH:mm", { locale: fr })}
                  {" · "}Fond initial : {formatDisplayPrice(mySummary.opening_cash, { showOriginal: isConverted })}
                </p>
                <div className="space-y-2">
                  {(["cash", "wave", "orange_money", "mtn_money", "moov_money", "mpesa", "card", "credit"] as const)
                    .map((m) => {
                      const key = `${m}_sales` as keyof CashSummary;
                      const v = (mySummary[key] as number) ?? 0;
                      if (v <= 0 && mySummary.transaction_count === 0) return null;
                      return (
                        <div key={m} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm">
                          <span>{PAYMENT_ICONS[m]} {PAYMENT_LABELS[m]}</span>
                          <span className="font-medium">{formatDisplayPrice(v, { showOriginal: isConverted })}</span>
                        </div>
                      );
                    })}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Total ventes</p>
                    <p className="font-bold text-primary">{formatDisplayPrice(mySummary.total_sales, { showOriginal: isConverted })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Transactions</p>
                    <p className="font-bold">{mySummary.transaction_count}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Dépenses</p>
                    <p className="font-bold text-destructive">{formatDisplayPrice(mySummary.total_expenses, { showOriginal: isConverted })}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {mySummary.status === "open" ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Banknote className="h-5 w-5" /> Comptage de la caisse
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-sm text-muted-foreground">Caisse attendue (espèces)</p>
                    <p className="text-xl font-bold text-primary">
                      {formatDisplayPrice(mySummary.expected_cash, { showOriginal: isConverted })}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="actual-cash">Montant réel en caisse (espèces physiques)</Label>
                    <Input
                      id="actual-cash" type="number" min="0" placeholder="Ex: 500000"
                      value={actualCash} onChange={(e) => setActualCash(e.target.value)}
                      className="text-lg font-bold"
                    />
                  </div>
                  {actualCash && (
                    <div className={`p-4 rounded-lg flex items-center gap-3 ${
                      (parseFloat(actualCash) - mySummary.expected_cash) === 0 ? "bg-success/10"
                        : (parseFloat(actualCash) - mySummary.expected_cash) > 0 ? "bg-warning/10" : "bg-destructive/10"
                    }`}>
                      {(parseFloat(actualCash) - mySummary.expected_cash) === 0
                        ? <CheckCircle className="h-6 w-6 text-success" />
                        : <AlertTriangle className="h-6 w-6 text-warning" />}
                      <p className="font-bold">
                        Écart : {formatDisplayPrice(parseFloat(actualCash) - mySummary.expected_cash, { showOriginal: isConverted })}
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="close-notes">Notes (optionnel)</Label>
                    <Input id="close-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>

                  {/* P0.4 : sécurité offline — une clôture calculée pendant que des
                      ventes ne sont pas encore synchronisées serait fausse (elles
                      manqueraient au total). On avertit fortement et on exige une
                      confirmation explicite plutôt que de bloquer sans recours
                      (un vendeur peut être définitivement hors-ligne). IndexedDB
                      n'est jamais touché ici — seule la lecture du compteur. */}
                  {offlinePendingCount > 0 && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 space-y-3">
                      <div className="flex items-start gap-2">
                        <WifiOff className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        <p className="text-sm text-destructive">
                          Attention : {offlinePendingCount} vente{offlinePendingCount > 1 ? "s" : ""} hors-ligne
                          {offlinePendingCount > 1 ? " ne sont" : " n'est"} pas encore synchronisée{offlinePendingCount > 1 ? "s" : ""}.
                          La clôture peut être incorrecte. Synchronisez les ventes avant de clôturer.
                          Vos ventes hors-ligne ne seront pas supprimées.
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={confirmCloseWithPending}
                          onCheckedChange={(v) => setConfirmCloseWithPending(v === true)}
                        />
                        Je confirme vouloir clôturer malgré les ventes non synchronisées
                      </label>
                    </div>
                  )}

                  <Button
                    onClick={() => closeMutation.mutate()}
                    disabled={!actualCash || closeMutation.isPending || (offlinePendingCount > 0 && !confirmCloseWithPending)}
                    className="gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {closeMutation.isPending ? "Clôture…" : "Clôturer la caisse"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                <div>
                  <p className="font-medium text-sm">Clôturée, en attente d'approbation</p>
                  <p className="text-xs text-muted-foreground">
                    Écart : {formatDisplayPrice(mySummary.cash_difference ?? 0, { showOriginal: isConverted })}
                  </p>
                </div>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
                    <Printer className="h-4 w-4" /> Imprimer
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleShareWhatsApp} className="gap-2">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        {canOperate && mySession && summaryLoading && (
          <p className="text-muted-foreground text-center py-4">Chargement de la session…</p>
        )}

        {/* ─── Vue équipe (manager/admin) ─────────────────────── */}
        {canApprove && (
          <>
            {(teamOpenSessions?.length ?? 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" /> Caisses ouvertes de l'équipe ({teamOpenSessions?.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {teamOpenSessions?.map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg text-sm">
                      <div>
                        <p className="font-medium">{getSellerName(s.opened_by)}</p>
                        <p className="text-xs text-muted-foreground">
                          {getStoreName(s.store_id)} · Ouverte le {format(new Date(s.opened_at), "dd/MM HH:mm", { locale: fr })}
                        </p>
                      </div>
                      <Badge variant="outline">Ouverte</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {(pendingApprovals?.length ?? 0) > 0 && (
              <Card className="border-warning/40">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-warning">
                    <ThumbsUp className="h-5 w-5" /> Clôtures en attente d'approbation ({pendingApprovals?.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pendingApprovals?.map((s) => {
                    const hasGap = s.cash_difference !== null && s.cash_difference !== 0;
                    const managerNote = managerNotesBySession[s.id] || "";
                    return (
                      <div key={s.id} className="p-3 bg-warning/5 rounded-lg space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{getSellerName(s.opened_by)}</p>
                            <p className="text-xs text-muted-foreground">
                              {getStoreName(s.store_id)} · Clôturée le {s.closed_at ? format(new Date(s.closed_at), "dd/MM HH:mm", { locale: fr }) : "—"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Ventes : {formatDisplayPrice(s.total_sales, { showOriginal: isConverted })}
                              {hasGap ? ` · Écart : ${formatDisplayPrice(s.cash_difference as number, { showOriginal: isConverted })}` : ""}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button
                              size="sm"
                              onClick={() => approveMutation.mutate(s.id)}
                              disabled={approveMutation.isPending || rejectMutation.isPending || (hasGap && !managerNote.trim())}
                            >
                              Approuver
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-destructive hover:text-destructive"
                              onClick={() => rejectMutation.mutate(s.id)}
                              disabled={approveMutation.isPending || rejectMutation.isPending || !managerNote.trim()}
                            >
                              <ThumbsDown className="h-3.5 w-3.5" /> Rejeter
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`manager-note-${s.id}`} className="text-xs">
                            Note manager {hasGap ? "(obligatoire pour approuver — écart non nul)" : "(obligatoire pour rejeter)"}
                          </Label>
                          <Input
                            id={`manager-note-${s.id}`}
                            value={managerNote}
                            onChange={(e) => setManagerNotesBySession((prev) => ({ ...prev, [s.id]: e.target.value }))}
                            placeholder="Ex : rendu de monnaie incorrect signalé par le vendeur"
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ─── Historique ──────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5" /> Historique des sessions
            </CardTitle>
            {(history?.length ?? 0) > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportHistoryCSV} className="gap-2">
                <Download className="h-4 w-4" /> Exporter CSV
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filtres (P1) — la RPC get_cash_register_sessions supporte déjà
                store/user/status/date, aucune migration nécessaire ici. */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="space-y-1">
                <Label htmlFor="filter-from" className="text-xs">Du</Label>
                <Input id="filter-from" type="date" value={filterFromDate} onChange={(e) => setFilterFromDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="filter-to" className="text-xs">Au</Label>
                <Input id="filter-to" type="date" value={filterToDate} onChange={(e) => setFilterToDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Statut</Label>
                <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous statuts</SelectItem>
                    <SelectItem value="open">Ouverte</SelectItem>
                    <SelectItem value="closed">En attente</SelectItem>
                    <SelectItem value="approved">Approuvée</SelectItem>
                    <SelectItem value="rejected">Rejetée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isReviewer && (orgProfiles?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Vendeur</Label>
                  <Select value={filterUserId || "all"} onValueChange={(v) => setFilterUserId(v === "all" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous vendeurs</SelectItem>
                      {orgProfiles?.map((p) => (
                        <SelectItem key={p.user_id} value={p.user_id}>{p.owner_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {stores.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Magasin</Label>
                  <Select value={filterStoreId || "all"} onValueChange={(v) => setFilterStoreId(v === "all" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous magasins</SelectItem>
                      {stores.map((st) => (
                        <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {(history?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-center py-4">Aucune session enregistrée</p>
            ) : (
              <div className="space-y-2">
                {history?.slice(0, 30).map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">
                        {isReviewer ? `${getSellerName(s.opened_by)} · ` : ""}
                        {format(new Date(s.opened_at), "EEEE dd MMMM yyyy", { locale: fr })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {stores.length > 0 ? `${getStoreName(s.store_id)} · ` : ""}
                        Ouverte {format(new Date(s.opened_at), "HH:mm", { locale: fr })}
                        {s.closed_at ? ` · Clôturée ${format(new Date(s.closed_at), "HH:mm", { locale: fr })}` : ""}
                        {" · "}Ventes : {formatDisplayPrice(s.total_sales, { showOriginal: isConverted })}
                        {s.notes ? ` · ${s.notes}` : ""}
                      </p>
                    </div>
                    <Badge variant={
                      s.status === "approved" ? "default" : s.status === "closed" ? "outline" : "secondary"
                    }>
                      {s.status === "open" ? "Ouverte" : s.status === "closed" ? "En attente" : s.status === "approved" ? "Approuvée" : s.status === "rejected" ? "Rejetée" : s.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
