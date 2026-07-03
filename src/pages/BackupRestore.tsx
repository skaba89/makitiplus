/**
 * Backup & Restore Page — Data protection for organizations
 *
 * Features:
 * - List backups with status filtering
 * - Create manual backups (full org snapshot)
 * - Restore from a backup (auto-creates pre-restore backup)
 * - Download backup as JSON file
 * - Delete old backups
 * - Stats cards (total, completed, size, last backup)
 * - Gated by FeatureGate("backup_restore")
 */

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoContext";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { FeatureGate } from "@/components/saas/PlanLimitGuard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  Upload,
  Trash2,
  RotateCcw,
  HardDrive,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
  Plus,
  Search,
  FileArchive,
  AlertTriangle,
  Database,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { reportError } from "@/lib/sentry";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────

type BackupStatus = "pending" | "in_progress" | "completed" | "failed" | "restoring";
type BackupType = "manual" | "auto" | "pre_restore";

interface BackupRow {
  id: string;
  backup_number: string;
  status: BackupStatus;
  backup_type: BackupType;
  description: string | null;
  table_counts: Record<string, number>;
  total_records: number;
  file_size_kb: number | null;
  created_by: string | null;
  created_by_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface BackupStatsRow {
  total_backups: number;
  completed_backups: number;
  total_size_kb: number;
  last_backup_at: string | null;
}

// ─── Helpers ────────────────────────────────────────────────

function formatFileSize(kb: number | null): string {
  if (kb === null) return "—";
  if (kb < 1024) return `${kb} Ko`;
  return `${(kb / 1024).toFixed(1)} Mo`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "dd MMM yyyy à HH:mm", { locale: fr });
}

function statusBadge(status: BackupStatus) {
  const config: Record<BackupStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
    pending: { label: "En attente", variant: "outline", icon: Clock },
    in_progress: { label: "En cours", variant: "secondary", icon: Loader2 },
    completed: { label: "Terminé", variant: "default", icon: CheckCircle2 },
    failed: { label: "Échoué", variant: "destructive", icon: XCircle },
    restoring: { label: "Restauration", variant: "secondary", icon: RotateCcw },
  };
  const c = config[status];
  const Icon = c.icon;
  return (
    <Badge variant={c.variant} className="gap-1">
      <Icon className={`h-3 w-3 ${status === "in_progress" ? "animate-spin" : ""}`} />
      {c.label}
    </Badge>
  );
}

function typeBadge(type: BackupType) {
  const labels: Record<BackupType, string> = {
    manual: "Manuel",
    auto: "Automatique",
    pre_restore: "Avant restauration",
  };
  const variants: Record<BackupType, "outline" | "secondary" | "default"> = {
    manual: "outline",
    auto: "secondary",
    pre_restore: "default",
  };
  return <Badge variant={variants[type]}>{labels[type]}</Badge>;
}

// ─── Component ──────────────────────────────────────────────

const BackupRestore = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { blockMutation } = useDemo();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupRow | null>(null);
  const [description, setDescription] = useState("");
  const [importedData, setImportedData] = useState<object | null>(null);
  const [importFileName, setImportFileName] = useState("");

  // ─── Queries ─────────────────────────────────────────────

  const { data: backups = [], isLoading: backupsLoading } = useQuery({
    queryKey: ["backups"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_backups", { p_limit: 100, p_offset: 0 });
      if (error) throw error;
      return (data || []) as BackupRow[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["backup-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_backup_stats");
      if (error) throw error;
      return data?.[0] as BackupStatsRow | undefined;
    },
  });

  // ─── Mutations ───────────────────────────────────────────

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_backup", {
        p_description: description || null,
        p_backup_type: "manual",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      queryClient.invalidateQueries({ queryKey: ["backup-stats"] });
      setCreateDialogOpen(false);
      setDescription("");
      toast({
        title: "Sauvegarde créée",
        description: "La sauvegarde complète a été réalisée avec succès",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Impossible de créer la sauvegarde : ${error.message}`,
      });
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const { data, error } = await supabase.rpc("restore_backup", {
        p_backup_id: backupId,
        p_tables: null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      queryClient.invalidateQueries({ queryKey: ["backup-stats"] });
      // Invalidate all data queries since we just restored
      queryClient.invalidateQueries();
      setRestoreDialogOpen(false);
      setSelectedBackup(null);
      toast({
        title: "Restauration réussie",
        description: `Les données ont été restaurées avec succès. ${data?.total_restored || 0} enregistrements restaurés.`,
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur de restauration",
        description: `La restauration a échoué : ${error.message}`,
      });
    },
  });

  const deleteBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const { data, error } = await supabase.rpc("delete_backup", { p_backup_id: backupId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      queryClient.invalidateQueries({ queryKey: ["backup-stats"] });
      setDeleteDialogOpen(false);
      setSelectedBackup(null);
      toast({
        title: "Sauvegarde supprimée",
        description: "La sauvegarde a été définitivement supprimée",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Impossible de supprimer : ${error.message}`,
      });
    },
  });

  // ─── Handlers ────────────────────────────────────────────

  const handleDownload = async (backup: BackupRow) => {
    try {
      const { data, error } = await supabase.rpc("get_backup_details", { p_backup_id: backup.id });
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Données introuvables");

      const backupData = data[0].backup_data;
      if (!backupData) throw new Error("Les données de sauvegarde sont vides");

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `makitiplus-backup-${backup.backup_number}-${format(new Date(), "yyyy-MM-dd")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "Téléchargement", description: "Fichier de sauvegarde téléchargé" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de télécharger",
      });
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        setImportedData(json);
        setImportFileName(file.name);
        toast({ title: "Fichier chargé", description: `${file.name} prêt pour import` });
      } catch {
        toast({
          variant: "destructive",
          title: "Fichier invalide",
          description: "Le fichier doit être un JSON valide",
        });
      }
    };
    reader.readAsText(file);
  };

  const handleImportRestore = async () => {
    if (!importedData) return;
    // Import is done by first creating a backup from the imported data,
    // then restoring from it. For now, we'll show a coming-soon notice
    // since the server RPC expects data already in the backups table.
    toast({
      title: "Import externe",
      description: "Cette fonctionnalité sera bientôt disponible. Utilisez les sauvegardes du système pour l'instant.",
    });
    setImportedData(null);
    setImportFileName("");
  };

  // ─── Filtering ───────────────────────────────────────────

  const filteredBackups = backups.filter((b) => {
    const matchesSearch =
      !search ||
      b.backup_number.toLowerCase().includes(search.toLowerCase()) ||
      (b.description || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // ─── Render ──────────────────────────────────────────────

  return (
    <DashboardLayout>
      <FeatureGate
        feature="backup_restore"
        fallback={
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Shield className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Sauvegarde & Restauration</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              La sauvegarde et restauration de données est disponible à partir du plan Enterprise.
              Protégez vos données contre les pertes accidentelles.
            </p>
            <Button onClick={() => (navigate("/dashboard/billing"))}>
              Voir les abonnements
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Database className="h-6 w-6" />
                Sauvegarde & Restauration
              </h1>
              <p className="text-muted-foreground">
                Protégez vos données avec des sauvegardes complètes et une restauration en un clic
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Importer
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportFile}
              />
              <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Nouvelle sauvegarde
              </Button>
            </div>
          </div>

          {/* Import banner */}
          {importedData && (
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
              <CardContent className="flex items-center gap-3 p-4">
                <FileArchive className="h-5 w-5 text-blue-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Fichier prêt : {importFileName}</p>
                  <p className="text-xs text-muted-foreground">
                    Cliquez sur Restaurer pour importer ces données
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setImportedData(null); setImportFileName(""); }}>
                    Annuler
                  </Button>
                  <Button size="sm" onClick={handleImportRestore} className="gap-1">
                    <RotateCcw className="h-3 w-3" />
                    Restaurer
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
                    <HardDrive className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total sauvegardes</p>
                    <p className="text-2xl font-bold">{stats?.total_backups || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-950 rounded-lg">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Réussies</p>
                    <p className="text-2xl font-bold">{stats?.completed_backups || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-950 rounded-lg">
                    <FileArchive className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Espace utilisé</p>
                    <p className="text-2xl font-bold">{formatFileSize(stats?.total_size_kb || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-950 rounded-lg">
                    <Clock className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Dernière sauvegarde</p>
                    <p className="text-sm font-bold">
                      {stats?.last_backup_at
                        ? format(new Date(stats.last_backup_at), "dd MMM HH:mm", { locale: fr })
                        : "Aucune"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par numéro ou description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="completed">Terminé</SelectItem>
                <SelectItem value="in_progress">En cours</SelectItem>
                <SelectItem value="failed">Échoué</SelectItem>
                <SelectItem value="restoring">Restauration</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Backups Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5" />
                Historique des sauvegardes
              </CardTitle>
              <CardDescription>
                Toutes les sauvegardes de votre organisation, y compris les sauvegardes automatiques créées avant chaque restauration
              </CardDescription>
            </CardHeader>
            <CardContent>
              {backupsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredBackups.length === 0 ? (
                <div className="text-center py-12">
                  <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-medium">Aucune sauvegarde</p>
                  <p className="text-muted-foreground mb-4">
                    Créez votre première sauvegarde pour protéger vos données
                  </p>
                  <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Créer une sauvegarde
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>N°</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Enregistrements</TableHead>
                        <TableHead>Taille</TableHead>
                        <TableHead>Créé par</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBackups.map((backup) => (
                        <TableRow key={backup.id}>
                          <TableCell className="font-mono font-medium">
                            {backup.backup_number}
                          </TableCell>
                          <TableCell>{typeBadge(backup.backup_type)}</TableCell>
                          <TableCell>{statusBadge(backup.status)}</TableCell>
                          <TableCell>
                            <span className="font-medium">{backup.total_records}</span>
                            <span className="text-muted-foreground text-xs ml-1">
                              dans {Object.keys(backup.table_counts || {}).length} tables
                            </span>
                          </TableCell>
                          <TableCell>{formatFileSize(backup.file_size_kb)}</TableCell>
                          <TableCell>{backup.created_by_name || "—"}</TableCell>
                          <TableCell className="text-sm">
                            {formatDate(backup.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {backup.status === "completed" && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDownload(backup)}
                                    title="Télécharger"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setSelectedBackup(backup);
                                      setRestoreDialogOpen(true);
                                    }}
                                    title="Restaurer"
                                    className="text-orange-600 hover:text-orange-700"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedBackup(backup);
                                  setDeleteDialogOpen(true);
                                }}
                                title="Supprimer"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/10">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <Shield className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    Comment fonctionne la sauvegarde ?
                  </p>
                  <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                    <li>
                      • <strong>Sauvegarde complète</strong> : capture toutes vos données (produits, ventes, clients, fournisseurs, etc.)
                    </li>
                    <li>
                      • <strong>Sauvegarde automatique</strong> : une sauvegarde est automatiquement créée avant chaque restauration
                    </li>
                    <li>
                      • <strong>Téléchargement</strong> : exportez vos données au format JSON pour les stocker hors ligne
                    </li>
                    <li>
                      • <strong>Restauration</strong> : remplace les données actuelles par celles de la sauvegarde sélectionnée
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── Create Backup Dialog ─────────────────────── */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Nouvelle sauvegarde
              </DialogTitle>
              <DialogDescription>
                Créez une sauvegarde complète de toutes les données de votre organisation.
                Cette opération peut prendre quelques secondes selon le volume de données.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="backup-desc">Description (optionnel)</Label>
                <Textarea
                  id="backup-desc"
                  placeholder="ex: Sauvegarde avant inventaire annuel"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-1">Données incluses :</p>
                <div className="grid grid-cols-2 gap-1 text-muted-foreground text-xs">
                  <span>✓ Produits & catégories</span>
                  <span>✓ Ventes & dépenses</span>
                  <span>✓ Clients & crédits</span>
                  <span>✓ Fournisseurs & commandes</span>
                  <span>✓ Transferts de stock</span>
                  <span>✓ Programme fidélité</span>
                  <span>✓ Paramètres boutique</span>
                  <span>✓ Magasins</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={() => { if (blockMutation("Créer une sauvegarde")) return; createBackupMutation.mutate(); }}
                disabled={createBackupMutation.isPending}
                className="gap-2"
              >
                {createBackupMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sauvegarde en cours...
                  </>
                ) : (
                  <>
                    <HardDrive className="h-4 w-4" />
                    Créer la sauvegarde
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Restore Confirmation Dialog ──────────────── */}
        <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-orange-600">
                <AlertTriangle className="h-5 w-5" />
                Confirmer la restauration
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    Vous êtes sur le point de restaurer la sauvegarde{" "}
                    <strong>{selectedBackup?.backup_number}</strong>.
                    Cela remplacera toutes vos données actuelles par celles de cette sauvegarde.
                  </p>
                  <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg text-sm">
                    <p className="font-medium text-orange-800 dark:text-orange-200 mb-1">
                      ⚠️ Attention
                    </p>
                    <ul className="text-orange-700 dark:text-orange-300 space-y-1 text-xs">
                      <li>• Une sauvegarde automatique sera créée avant la restauration</li>
                      <li>• Les données actuelles seront remplacées</li>
                      <li>• Cette action est irréversible une fois terminée</li>
                      <li>• Tous les utilisateurs seront affectés</li>
                    </ul>
                  </div>
                  {selectedBackup && (
                    <div className="text-sm text-muted-foreground">
                      <p>
                        Sauvegarde du{" "}
                        <strong>{formatDate(selectedBackup.created_at)}</strong> —{" "}
                        {selectedBackup.total_records} enregistrements,{" "}
                        {formatFileSize(selectedBackup.file_size_kb)}
                      </p>
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSelectedBackup(null)}>
                Annuler
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (selectedBackup) {
                    if (blockMutation("Restaurer la sauvegarde")) return;
                    restoreBackupMutation.mutate(selectedBackup.id);
                  }
                }}
                disabled={restoreBackupMutation.isPending}
                className="bg-orange-600 hover:bg-orange-700 gap-2"
              >
                {restoreBackupMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Restauration en cours...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    Confirmer la restauration
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ─── Delete Confirmation Dialog ───────────────── */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer la sauvegarde</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer la sauvegarde{" "}
                <strong>{selectedBackup?.backup_number}</strong> ? Cette action est définitive
                et les données ne pourront pas être récupérées.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSelectedBackup(null)}>
                Annuler
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (selectedBackup) {
                    if (blockMutation("Supprimer la sauvegarde")) return;
                    deleteBackupMutation.mutate(selectedBackup.id);
                  }
                }}
                disabled={deleteBackupMutation.isPending}
                className="bg-destructive hover:bg-destructive/90 gap-2"
              >
                {deleteBackupMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Suppression...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Supprimer définitivement
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </FeatureGate>
    </DashboardLayout>
  );
};

export default BackupRestore;
