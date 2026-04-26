import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Database } from "@/integrations/supabase/types";
import { AuditLogPanel } from "@/components/users/AuditLogPanel";
import { SecurityDiagnosticPanel } from "@/components/users/SecurityDiagnosticPanel";
import { PasswordStrengthMeter } from "@/components/users/PasswordStrengthMeter";
import { checkPassword } from "@/lib/passwordPolicy";
import {
  Loader2,
  UserPlus,
  Trash2,
  Shield,
  MoreVertical,
  UserX,
  UserCheck,
  History,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  KeyRound,
  Download,
  Power,
  Mail,
  MessageSquare,
  Hourglass,
  Link as LinkIcon,
  Copy,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

type AppRole = Database["public"]["Enums"]["app_role"];

interface UserRow {
  user_id: string;
  email: string | null;
  owner_name: string;
  business_name: string | null;
  phone: string | null;
  role: AppRole;
  is_active: boolean;
  is_test_account: boolean;
  test_expires_at: string | null;
  last_login_at: string | null;
  deactivated_at: string | null;
  deactivation_reason: string | null;
  created_at: string;
}

interface AuditRow {
  id: string;
  actor_name: string | null;
  target_user_name: string | null;
  action: string;
  details: any;
  created_at: string;
}

const roleLabels: Record<AppRole, string> = {
  admin: "Administrateur",
  manager: "Manager",
  vendeur: "Vendeur",
  comptable: "Comptable",
};

const roleColors: Record<AppRole, string> = {
  admin: "bg-primary text-primary-foreground",
  manager: "bg-accent text-accent-foreground",
  vendeur: "bg-secondary text-secondary-foreground",
  comptable: "bg-muted text-muted-foreground",
};

const actionLabels: Record<string, { label: string; tone: string }> = {
  user_created: { label: "Création", tone: "bg-primary/10 text-primary" },
  user_deactivated: { label: "Désactivation", tone: "bg-destructive/10 text-destructive" },
  user_reactivated: { label: "Réactivation", tone: "bg-accent/10 text-accent-foreground" },
  user_deleted_permanently: { label: "Suppression définitive", tone: "bg-destructive/15 text-destructive" },
};

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr });
  } catch {
    return "—";
  }
};

const Users = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null);
  const [deactivationReason, setDeactivationReason] = useState("");
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetMode, setResetMode] = useState<"manual" | "email" | "sms">("email");
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [magicLink, setMagicLink] = useState<string | null>(null);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<AppRole>("vendeur");
  const [requireEmailVerification, setRequireEmailVerification] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role, created_at");
      if (rolesError) throw rolesError;

      const userIds = (roles ?? []).map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, owner_name, business_name, phone, is_active, is_test_account, test_expires_at, last_login_at, deactivated_at, deactivation_reason")
        .in(
          "user_id",
          userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]
        );

      // Fetch emails via edge function (admin only)
      let emailMap: Record<string, string> = {};
      try {
        const { data: emailRes } = await supabase.functions.invoke("admin-list-user-emails", {
          body: { userIds },
        });
        if (emailRes?.emails) emailMap = emailRes.emails;
      } catch {
        // Non-blocking: emails are optional in the UI
      }

      const merged: UserRow[] = (roles ?? []).map((r) => {
        const p: any = profiles?.find((pp) => pp.user_id === r.user_id);
        return {
          user_id: r.user_id,
          email: emailMap[r.user_id] ?? null,
          owner_name: p?.owner_name ?? "—",
          business_name: p?.business_name ?? null,
          phone: p?.phone ?? null,
          role: r.role,
          is_active: p?.is_active ?? true,
          is_test_account: p?.is_test_account ?? false,
          test_expires_at: p?.test_expires_at ?? null,
          last_login_at: p?.last_login_at ?? null,
          deactivated_at: p?.deactivated_at ?? null,
          deactivation_reason: p?.deactivation_reason ?? null,
          created_at: r.created_at,
        };
      });
      setUsers(merged);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de charger les utilisateurs",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_audit_log")
        .select("id, actor_name, target_user_name, action, details, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setAudit((data ?? []) as AuditRow[]);
    } catch {
      // silent
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadAudit();
  }, []);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setOwnerName("");
    setPhone("");
    setRole("vendeur");
    setRequireEmailVerification(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const pwdCheck = checkPassword(password);
    if (!pwdCheck.ok) {
      toast({
        variant: "destructive",
        title: "Mot de passe non conforme",
        description: pwdCheck.errors.join(" • "),
      });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: { email, password, ownerName, phone, role, requireEmailVerification },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Erreur");
      }
      toast({
        title: "Utilisateur créé",
        description: requireEmailVerification
          ? `${ownerName} doit confirmer son email avant de se connecter`
          : `${ownerName} (${roleLabels[role]}) peut se connecter immédiatement`,
      });
      resetForm();
      setDialogOpen(false);
      loadUsers();
      loadAudit();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: err.message || "Impossible de créer l'utilisateur",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const callManage = async (
    target: UserRow,
    action: "deactivate" | "reactivate" | "delete",
    reason?: string
  ) => {
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { userId: target.user_id, action, reason },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Erreur");
      }
      const labels = {
        deactivate: "Utilisateur désactivé",
        reactivate: "Utilisateur réactivé",
        delete: "Utilisateur supprimé définitivement",
      };
      toast({ title: labels[action] });
      loadUsers();
      loadAudit();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: err.message || "Action impossible",
      });
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    await callManage(deactivateTarget, "deactivate", deactivationReason || undefined);
    setDeactivateTarget(null);
    setDeactivationReason("");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await callManage(deleteTarget, "delete");
    setDeleteTarget(null);
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;

    // Magic link mode (email or SMS)
    if (resetMode === "email" || resetMode === "sms") {
      setResetting(true);
      try {
        const { data, error } = await supabase.functions.invoke("admin-send-reset-link", {
          body: {
            userId: resetTarget.user_id,
            channel: resetMode,
            redirectTo: `${window.location.origin}/auth`,
          },
        });
        if (error || (data as any)?.error) {
          throw new Error((data as any)?.error || error?.message || "Erreur");
        }
        if ((data as any)?.actionLink) setMagicLink((data as any).actionLink);
        if ((data as any)?.manualLink) setMagicLink((data as any).manualLink);
        toast({
          title: "Lien envoyé",
          description: (data as any)?.message ?? "Lien à usage unique envoyé",
        });
        loadAudit();
      } catch (err: any) {
        toast({ variant: "destructive", title: "Erreur", description: err.message });
      } finally {
        setResetting(false);
      }
      return;
    }

    // Manual mode
    const pwdCheck = checkPassword(newPassword);
    if (!pwdCheck.ok) {
      toast({ variant: "destructive", title: "Mot de passe non conforme", description: pwdCheck.errors.join(" • ") });
      return;
    }
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { userId: resetTarget.user_id, action: "reset_password", newPassword },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Erreur");
      }
      toast({
        title: "Mot de passe réinitialisé",
        description: `Nouveau mot de passe défini pour ${resetTarget.owner_name}. Sessions déconnectées.`,
      });
      setResetTarget(null);
      setNewPassword("");
      setMagicLink(null);
      loadAudit();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erreur", description: err.message });
    } finally {
      setResetting(false);
    }
  };

  const handleToggleActive = async (target: UserRow) => {
    await callManage(target, target.is_active ? "deactivate" : "reactivate");
  };

  const exportTestCredentialsCSV = () => {
    // Export ALL users with full details
    const header = [
      "Nom", "Email", "Téléphone", "Rôle", "Boutique",
      "Statut", "Compte test", "Expiration test", "Dernière connexion", "Créé le",
    ];
    const rows = users.map((u) => [
      u.owner_name,
      u.email ?? "—",
      u.phone ?? "—",
      roleLabels[u.role],
      u.business_name ?? "—",
      u.is_active ? "Actif" : "Inactif",
      u.is_test_account ? "Oui" : "Non",
      u.test_expires_at ? new Date(u.test_expires_at).toLocaleDateString("fr-FR") : "—",
      u.last_login_at ? new Date(u.last_login_at).toLocaleString("fr-FR") : "Jamais",
      new Date(u.created_at).toLocaleDateString("fr-FR"),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `utilisateurs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export CSV téléchargé", description: `${users.length} utilisateurs exportés` });
  };

  const daysUntilExpiry = (iso: string | null) => {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shield className="h-7 w-7 text-primary" />
              Gestion des utilisateurs
            </h1>
            <p className="text-muted-foreground mt-1">
              Créer, désactiver et auditer les comptes de votre équipe
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="lg" variant="outline" onClick={exportTestCredentialsCSV}>
              <Download className="h-4 w-4 mr-2" /> Export CSV utilisateurs
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg">
                  <UserPlus className="h-4 w-4 mr-2" /> Nouvel utilisateur
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer un utilisateur</DialogTitle>
                <DialogDescription>
                  Choisissez si la vérification email est requise
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 car. avec maj/min/chiffre/symbole"
                    required
                  />
                  <PasswordStrengthMeter password={password} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ownerName">Nom complet</Label>
                  <Input
                    id="ownerName"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Téléphone (optionnel)</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Rôle</Label>
                  <Select value={role} onValueChange={(v: AppRole) => setRole(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="vendeur">Vendeur</SelectItem>
                      <SelectItem value="comptable">Comptable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <Switch
                    id="verify"
                    checked={requireEmailVerification}
                    onCheckedChange={setRequireEmailVerification}
                  />
                  <div className="flex-1">
                    <Label htmlFor="verify" className="cursor-pointer">
                      Exiger la vérification email
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {requireEmailVerification
                        ? "L'utilisateur recevra un email et devra cliquer sur le lien avant de se connecter."
                        : "Connexion immédiate sans vérification (recommandé pour le terrain)."}
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Créer
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">
              <Shield className="h-4 w-4 mr-2" /> Utilisateurs
            </TabsTrigger>
            <TabsTrigger value="audit">
              <History className="h-4 w-4 mr-2" /> Historique
            </TabsTrigger>
            <TabsTrigger value="security">
              <ShieldCheck className="h-4 w-4 mr-2" /> Sécurité
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Utilisateurs ({users.length})</CardTitle>
                <CardDescription>
                  Statut, dernière connexion et actions de gestion
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nom</TableHead>
                          <TableHead>Téléphone</TableHead>
                          <TableHead>Rôle</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Dernière connexion</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((u) => {
                          const isSelf = u.user_id === user?.id;
                          const isAdmin = u.role === "admin";
                          return (
                            <TableRow key={u.user_id} className={!u.is_active ? "opacity-60" : ""}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span>{u.owner_name}</span>
                                  {isSelf && (
                                    <span className="text-xs text-muted-foreground">(vous)</span>
                                  )}
                                  {u.is_test_account && (
                                    <Badge variant="outline" className="border-yellow-500 text-yellow-700 text-[10px]">
                                      <Hourglass className="h-2.5 w-2.5 mr-1" />
                                      Test
                                      {u.test_expires_at && daysUntilExpiry(u.test_expires_at) !== null && (
                                        <span className="ml-1">
                                          ({daysUntilExpiry(u.test_expires_at)}j)
                                        </span>
                                      )}
                                    </Badge>
                                  )}
                                </div>
                                {u.email && (
                                  <div className="text-xs text-muted-foreground mt-0.5">{u.email}</div>
                                )}
                              </TableCell>
                              <TableCell>{u.phone || "—"}</TableCell>
                              <TableCell>
                                <Badge className={roleColors[u.role]}>{roleLabels[u.role]}</Badge>
                              </TableCell>
                              <TableCell>
                                {u.is_active ? (
                                  <Badge variant="outline" className="border-primary/50 text-primary">
                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Actif
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="border-destructive/50 text-destructive">
                                    <XCircle className="h-3 w-3 mr-1" /> Bloqué
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {formatDate(u.last_login_at)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                {isSelf || isAdmin ? (
                                  <span className="text-xs text-muted-foreground">
                                    {isAdmin && !isSelf ? "Protégé" : ""}
                                  </span>
                                ) : (
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      size="sm"
                                      variant={u.is_active ? "outline" : "default"}
                                      onClick={() => handleToggleActive(u)}
                                      title={u.is_active ? "Désactiver" : "Réactiver"}
                                    >
                                      <Power className="h-3.5 w-3.5 mr-1" />
                                      {u.is_active ? "Désactiver" : "Réactiver"}
                                    </Button>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon">
                                          <MoreVertical className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => { setResetTarget(u); setNewPassword(""); }}>
                                          <KeyRound className="h-4 w-4 mr-2" /> Réinitialiser le mot de passe
                                        </DropdownMenuItem>
                                        {u.is_active ? (
                                          <DropdownMenuItem onClick={() => setDeactivateTarget(u)}>
                                            <UserX className="h-4 w-4 mr-2" /> Désactiver (avec raison)
                                          </DropdownMenuItem>
                                        ) : (
                                          <DropdownMenuItem onClick={() => callManage(u, "reactivate")}>
                                            <UserCheck className="h-4 w-4 mr-2" /> Réactiver
                                          </DropdownMenuItem>
                                        )}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => setDeleteTarget(u)}
                                          className="text-destructive focus:text-destructive"
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" /> Supprimer définitivement
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {users.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              Aucun utilisateur
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <AuditLogPanel
              users={users.map((u) => ({ user_id: u.user_id, name: u.owner_name }))}
            />
          </TabsContent>

          <TabsContent value="security" className="mt-4">
            <SecurityDiagnosticPanel />
          </TabsContent>
        </Tabs>
      </div>

      {/* Reset password dialog */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(o) => {
          if (!o) {
            setResetTarget(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
            <DialogDescription>
              Définir un nouveau mot de passe pour <strong>{resetTarget?.owner_name}</strong>.
              Toutes ses sessions actives seront déconnectées.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="newPwd">Nouveau mot de passe</Label>
            <Input
              id="newPwd"
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Au moins 6 caractères"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Communiquez ce mot de passe en personne. Demandez à l'utilisateur de le changer après connexion.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetTarget(null); setNewPassword(""); }}>
              Annuler
            </Button>
            <Button onClick={handleResetPassword} disabled={resetting || newPassword.length < 6}>
              {resetting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <KeyRound className="h-4 w-4 mr-2" /> Réinitialiser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate dialog with reason */}
      <Dialog
        open={!!deactivateTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeactivateTarget(null);
            setDeactivationReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Désactiver {deactivateTarget?.owner_name} ?</DialogTitle>
            <DialogDescription>
              L'utilisateur ne pourra plus se connecter. Vous pourrez le réactiver à tout moment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Raison (optionnel)</Label>
            <Textarea
              id="reason"
              value={deactivationReason}
              onChange={(e) => setDeactivationReason(e.target.value)}
              placeholder="Ex: Congé prolongé, fin de contrat..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeactivateTarget(null);
                setDeactivationReason("");
              }}
            >
              Annuler
            </Button>
            <Button onClick={handleDeactivate} variant="destructive">
              <UserX className="h-4 w-4 mr-2" /> Désactiver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent delete with double confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement {deleteTarget?.owner_name} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est <strong>irréversible</strong>. Le compte et toutes ses données
              d'authentification seront supprimés. L'historique d'audit sera conservé.
              <br /><br />
              Préférez la <strong>désactivation</strong> si vous souhaitez pouvoir réactiver le compte plus tard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Users;
