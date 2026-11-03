import { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgSelector } from "@/hooks/useOrgSelector";
import { useOnlineStatus } from "@/contexts/OfflineContext";
import { getPendingMutations, rearmOneFailedMutation, type QueuedMutation } from "@/lib/offlineQueue";
import { formatQueuedAmount, getQueuedSaleNumber, makeQueueCsv } from "@/lib/offlineQueueView";
import { MANAGEMENT_ROLES } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle, Download, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function OfflineSalesQueue() {
  const { user, profile, userRole } = useAuth();
  const { effectiveOrgId } = useOrgSelector();
  const { isOnline, isSyncing, triggerSync } = useOnlineStatus();
  const { i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith("en");
  const orgId = effectiveOrgId || profile?.organization_id;
  const [rows, setRows] = useState<QueuedMutation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id || !orgId) { setRows([]); return; }
    try {
      const all = await getPendingMutations();
      // IndexedDB belongs to the physical browser. Never display another
      // account's local entries after sign-out or organization switching.
      setRows(all.filter((m) =>
        m.operation === "RPC" &&
        (m.rpcName === "create_sale_with_limit" || m.rpcName === "create_credit_sale_atomic" || m.rpcName === "increment_customer_credit_by_phone") &&
        m.userId === user.id && m.organizationId === orgId
      ));
      setError(null);
    } catch {
      setError(en ? "Unable to read local storage. Do not clear browser data." : "Lecture du stockage local impossible. Ne videz pas les données du navigateur.");
    }
  }, [user?.id, orgId, en]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 10_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  if (!userRole || !MANAGEMENT_ROLES.includes(userRole)) {
    return <DashboardLayout><p role="alert">{en ? "Access restricted." : "Accès restreint."}</p></DashboardLayout>;
  }

  const retryOne = async (row: QueuedMutation) => {
    if (!user?.id || !orgId || !isOnline || busy || isSyncing) return;
    setBusy(true);
    try {
      // Identity and organization checked again in the IndexedDB write.
      await rearmOneFailedMutation(row.id, user.id, orgId);
      await triggerSync();
      await refresh();
    } catch {
      setError(en ? "Unable to retry this entry." : "Impossible de relancer cette opération.");
    } finally { setBusy(false); }
  };

  const exportCsv = () => {
    const csv = makeQueueCsv(rows);
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "makitiplus-offline-queue.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const overdue = rows.filter(m => Date.now() - new Date(m.createdAt).getTime() > 86_400_000);
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{en ? "Offline sales on this device" : "Ventes hors ligne de cet appareil"}</h1>
          <p className="text-sm text-muted-foreground">{en
            ? "Local pending sales and credits only. This is not a consolidated store-wide list."
            : "Ventes et crédits stockés localement uniquement. Ce n'est pas une liste consolidée des autres appareils."}</p>
        </div>
        {overdue.length > 0 && <div role="alert" className="border border-orange-500 rounded p-3">
          <AlertTriangle className="inline h-4 w-4 mr-2" />
          {en ? `${overdue.length} entries are older than 24 hours.` : `${overdue.length} opération(s) en attente depuis plus de 24 h.`}
        </div>}
        {error && <div role="alert" className="text-destructive">{error}</div>}
        <Card>
          <CardHeader>
            <CardTitle>{en ? "Local queue" : "File locale"} ({rows.length})</CardTitle>
            <CardDescription>{en
              ? "Never clear site data while a sale is pending. Retrying may also synchronize other pending items."
              : "Ne supprimez jamais les données du navigateur pendant une vente en attente. Réessayer peut aussi synchroniser d'autres opérations en attente."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-4">
              <Button variant="outline" onClick={() => void refresh()}><RefreshCw className="h-4 w-4 mr-2" />{en ? "Refresh" : "Actualiser"}</Button>
              <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}><Download className="h-4 w-4 mr-2" />CSV</Button>
              <Button disabled={!isOnline || isSyncing || busy || rows.length === 0} onClick={() => void triggerSync()}>{en ? "Synchronize all" : "Tout synchroniser"}</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b text-left">
                  <th className="p-2">{en ? "Sale / transaction" : "Vente / opération"}</th>
                  <th className="p-2">{en ? "Amount" : "Montant"}</th>
                  <th className="p-2">{en ? "Date" : "Date"}</th>
                  <th className="p-2">{en ? "Status" : "Statut"}</th>
                  <th className="p-2">{en ? "Attempts" : "Essais"}</th>
                  <th className="p-2">{en ? "Error" : "Erreur"}</th>
                  <th className="p-2">{en ? "Action" : "Action"}</th>
                </tr></thead>
                <tbody>{rows.map(row => <tr className="border-b" key={row.id}>
                  <td className="p-2">{getQueuedSaleNumber(row) || row.rpcName}</td>
                  <td className="p-2">{formatQueuedAmount(row)}</td>
                  <td className="p-2 whitespace-nowrap">{new Date(row.createdAt).toLocaleString(en ? "en-GB" : "fr-FR")}</td>
                  <td className="p-2">{row.status}</td>
                  <td className="p-2">{row.retryCount}</td>
                  <td className="p-2 max-w-xs break-words">{row.error || "—"}</td>
                  <td className="p-2">
                    <Button variant="outline" size="sm" onClick={() => void retryOne(row)}
                      disabled={row.status !== "failed" || !isOnline || busy || isSyncing}>
                      {en ? "Retry" : "Réessayer"}
                    </Button>
                  </td>
                </tr>)}</tbody>
              </table>
              {rows.length === 0 && <p className="text-muted-foreground p-4">{en ? "No pending sales on this device." : "Aucune vente en attente sur cet appareil."}</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
