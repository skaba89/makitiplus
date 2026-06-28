import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Store, Plus, Users, MapPin, Coins, Trash2, UserPlus } from "lucide-react";
import { Database } from "@/integrations/supabase/types";

type Organization = Database["public"]["Tables"]["organizations"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface StoreWithAdmin extends Organization {
  admin_name?: string;
  admin_email?: string;
  admin_id?: string;
  user_count?: number;
}

const Stores = () => {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [stores, setStores] = useState<StoreWithAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreWithAdmin | null>(null);

  // New store form
  const [storeName, setStoreName] = useState("");
  const [storeCountry, setStoreCountry] = useState("Guinée");
  const [storeCurrency, setStoreCurrency] = useState("GNF");
  const [creating, setCreating] = useState(false);

  // New admin form
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  const fetchStores = async () => {
    setLoading(true);
    try {
      // Fetch all organizations
      const { data: orgs, error: orgsError } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });

      if (orgsError) throw orgsError;

      // For each org, fetch the admin profile
      const storesWithAdmins: StoreWithAdmin[] = await Promise.all(
        (orgs || []).map(async (org) => {
          const { data: adminProfile } = await supabase
            .from("profiles")
            .select("owner_name, user_id")
            .eq("organization_id", org.id)
            .limit(1)
            .maybeSingle();

          const { count } = await supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("organization_id", org.id);

          return {
            ...org,
            admin_name: adminProfile?.owner_name || "—",
            admin_id: adminProfile?.user_id,
            user_count: count || 0,
          };
        })
      );

      setStores(storesWithAdmins);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ variant: "destructive", title: "Erreur", description: message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { error } = await supabase.from("organizations").insert({
        name: storeName,
        owner_user_id: (await supabase.auth.getUser()).data.user?.id,
        country: storeCountry,
        currency: storeCurrency,
      });

      if (error) throw error;

      toast({ title: "Magasin créé", description: `"${storeName}" a été ajouté.` });
      setStoreName("");
      setDialogOpen(false);
      fetchStores();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ variant: "destructive", title: "Erreur", description: message });
    } finally {
      setCreating(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStore) return;
    setCreatingAdmin(true);
    try {
      // 1. Sign up the new admin user
      const redirectUrl = `${window.location.origin}/`;
      const { data, error: signupError } = await supabase.auth.signUp({
        email: adminEmail,
        password: adminPassword,
        options: { emailRedirectTo: redirectUrl },
      });

      if (signupError) throw signupError;
      if (!data.user) throw new Error("Erreur lors de la création du compte");

      // 2. Create profile linked to the store
      const { error: profileError } = await supabase.from("profiles").insert({
        user_id: data.user.id,
        business_name: selectedStore.name,
        owner_name: adminName,
        phone: adminPhone || null,
        organization_id: selectedStore.id,
      });

      if (profileError) throw profileError;

      // 3. Assign admin role
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: data.user.id,
        role: "admin",
      });

      if (roleError) throw roleError;

      toast({
        title: "Admin créé",
        description: `${adminName} est maintenant admin de "${selectedStore.name}".`,
      });

      // Reset form
      setAdminEmail("");
      setAdminPassword("");
      setAdminName("");
      setAdminPhone("");
      setAdminDialogOpen(false);
      fetchStores();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ variant: "destructive", title: "Erreur", description: message });
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleDeleteStore = async (store: StoreWithAdmin) => {
    if (!confirm(`Supprimer le magasin "${store.name}" ? Cette action est irréversible.`)) return;
    try {
      const { error } = await supabase.from("organizations").delete().eq("id", store.id);
      if (error) throw error;
      toast({ title: "Magasin supprimé", description: `"${store.name}" a été supprimé.` });
      fetchStores();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ variant: "destructive", title: "Erreur", description: message });
    }
  };

  if (userRole !== "super_admin") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Accès réservé au Super Administrateur.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Store className="h-8 w-8" />
              Magasins
            </h1>
            <p className="text-muted-foreground mt-1">
              Gérez vos magasins et leurs administrateurs
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Nouveau magasin
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer un magasin</DialogTitle>
                <DialogDescription>
                  Ajoutez un nouveau magasin. Vous pourrez ensuite nommer un admin.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateStore} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="store-name">Nom du magasin</Label>
                  <div className="relative">
                    <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="store-name"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="Ex: Makiti Conakry"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Pays</Label>
                    <Select value={storeCountry} onValueChange={setStoreCountry}>
                      <SelectTrigger>
                        <MapPin className="h-4 w-4 mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Guinée">Guinée</SelectItem>
                        <SelectItem value="Sénégal">Sénégal</SelectItem>
                        <SelectItem value="Mali">Mali</SelectItem>
                        <SelectItem value="Côte d'Ivoire">Côte d'Ivoire</SelectItem>
                        <SelectItem value="Cameroun">Cameroun</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Devise</Label>
                    <Select value={storeCurrency} onValueChange={setStoreCurrency}>
                      <SelectTrigger>
                        <Coins className="h-4 w-4 mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GNF">GNF (Franc Guinéen)</SelectItem>
                        <SelectItem value="FCFA">FCFA (Franc CFA)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={creating}>
                    {creating ? "Création..." : "Créer le magasin"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total magasins</CardDescription>
              <CardTitle className="text-3xl">{stores.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Utilisateurs totaux</CardDescription>
              <CardTitle className="text-3xl">
                {stores.reduce((sum, s) => sum + (s.user_count || 0), 0)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Magasins sans admin</CardDescription>
              <CardTitle className="text-3xl">
                {stores.filter((s) => s.admin_name === "—").length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Stores table */}
        <Card>
          <CardHeader>
            <CardTitle>Liste des magasins</CardTitle>
            <CardDescription>
              Cliquez sur "Ajouter admin" pour nommer un administrateur à un magasin
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Chargement...</div>
            ) : stores.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Aucun magasin. Créez votre premier magasin !
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Magasin</TableHead>
                    <TableHead>Pays</TableHead>
                    <TableHead>Devise</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Utilisateurs</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stores.map((store) => (
                    <TableRow key={store.id}>
                      <TableCell className="font-medium">{store.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {store.country || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{store.currency || "GNF"}</Badge>
                      </TableCell>
                      <TableCell>
                        {store.admin_name !== "—" ? (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {store.admin_name}
                          </span>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Aucun admin
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{store.user_count || 0}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {store.subscription_plan || "starter"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => {
                              setSelectedStore(store);
                              setAdminDialogOpen(true);
                            }}
                          >
                            <UserPlus className="h-3 w-3" />
                            Admin
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => handleDeleteStore(store)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add Admin Dialog */}
        <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajouter un admin</DialogTitle>
              <DialogDescription>
                Créez un compte administrateur pour le magasin "{selectedStore?.name}".
                L'admin pourra gérer les utilisateurs, produits et ventes de ce magasin.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-name">Nom complet</Label>
                <Input
                  id="admin-name"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Mamadou Diallo"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-email">Email</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@magasin.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Mot de passe</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Min. 8 caractères"
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-phone">Téléphone (optionnel)</Label>
                <Input
                  id="admin-phone"
                  type="tel"
                  value={adminPhone}
                  onChange={(e) => setAdminPhone(e.target.value)}
                  placeholder="+224 620 00 00 00"
                />
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-2">
                <Users className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Cet utilisateur sera <strong className="text-foreground">Administrateur</strong> du magasin "{selectedStore?.name}".
                  Il pourra créer des vendeurs, managers et comptables pour ce magasin.
                </p>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creatingAdmin}>
                  {creatingAdmin ? "Création..." : "Créer l'admin"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Stores;
