import { useState, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import { StoresPageSkeleton } from "@/components/skeletons/PageSkeletons";
import {
  Store,
  Plus,
  Users,
  MapPin,
  Coins,
  Trash2,
  UserPlus,
  Filter,
  ShoppingBag,
  Salad,
  Shirt,
  Footprints,
  UtensilsCrossed,
  Croissant,
  Pill,
  Sparkles,
  Smartphone,
  Wrench,
  HardHat,
  Fuel,
  Phone,
  Scissors,
  Package,
  Building2,
  LucideIcon,
} from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { COUNTRIES, DEFAULT_CURRENCY } from "@/utils/currencies";
import { isAdminRole } from "@/types";

type Organization = Database["public"]["Tables"]["organizations"]["Row"];
type StoreCategory = Database["public"]["Enums"]["store_category"];

interface StoreWithAdmin extends Organization {
  admin_name?: string;
  admin_email?: string;
  admin_id?: string;
  user_count?: number;
}

// Catégories de magasins avec labels et icônes Lucide
interface CategoryConfig {
  value: StoreCategory;
  label: string;
  icon: LucideIcon;
  color: string;
}

const STORE_CATEGORIES: CategoryConfig[] = [
  { value: "epicerie", label: "Épicerie", icon: Salad, color: "text-green-600" },
  { value: "alimentation_generale", label: "Alimentation générale", icon: ShoppingBag, color: "text-emerald-600" },
  { value: "supermarche", label: "Supermarché", icon: Building2, color: "text-blue-600" },
  { value: "boutique_vetements", label: "Boutique vêtements", icon: Shirt, color: "text-pink-600" },
  { value: "boutique_chaussures", label: "Boutique chaussures", icon: Footprints, color: "text-orange-600" },
  { value: "restaurant", label: "Restaurant", icon: UtensilsCrossed, color: "text-red-600" },
  { value: "boulangerie_patisserie", label: "Boulangerie / Pâtisserie", icon: Croissant, color: "text-amber-600" },
  { value: "pharmacie", label: "Pharmacie", icon: Pill, color: "text-teal-600" },
  { value: "cosmetiques_beaute", label: "Cosmétiques & Beauté", icon: Sparkles, color: "text-purple-600" },
  { value: "electronique", label: "Électronique", icon: Smartphone, color: "text-indigo-600" },
  { value: "quincaillerie", label: "Quincaillerie", icon: Wrench, color: "text-slate-600" },
  { value: "materiel_construction", label: "Matériel de construction", icon: HardHat, color: "text-yellow-700" },
  { value: "station_service", label: "Station-service", icon: Fuel, color: "text-cyan-600" },
  { value: "point_vente_telecom", label: "Point de vente telecom", icon: Phone, color: "text-violet-600" },
  { value: "salon_coiffure", label: "Salon de coiffure", icon: Scissors, color: "text-fuchsia-600" },
  { value: "autre", label: "Autre", icon: Package, color: "text-gray-600" },
];

const getCategoryConfig = (value: StoreCategory | null): CategoryConfig => {
  if (!value) return STORE_CATEGORIES[STORE_CATEGORIES.length - 1]; // "autre"
  return STORE_CATEGORIES.find((c) => c.value === value) || STORE_CATEGORIES[STORE_CATEGORIES.length - 1];
};

// Affiche l'icône d'une catégorie de magasin
const CategoryIcon = ({ value, className }: { value: StoreCategory | null; className?: string }) => {
  const config = getCategoryConfig(value);
  const Icon = config.icon;
  return <Icon className={className || `h-4 w-4 ${config.color}`} />;
};

// Badge catégorie avec icône intégrée
const CategoryBadge = ({ value }: { value: StoreCategory | null }) => {
  const config = getCategoryConfig(value);
  const Icon = config.icon;
  return (
    <Badge variant="secondary" className="gap-1.5">
      <Icon className={`h-3.5 w-3.5 ${config.color}`} />
      {config.label}
    </Badge>
  );
};

const Stores = () => {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreWithAdmin | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<StoreWithAdmin | null>(null);

  // Formulaire nouveau magasin
  const [storeName, setStoreName] = useState("");
  const [storeCategory, setStoreCategory] = useState<StoreCategory>("epicerie");
  const [storeCountry, setStoreCountry] = useState(COUNTRIES[0]?.name || "Guinée");
  const [storeCurrency, setStoreCurrency] = useState(COUNTRIES[0]?.currency.symbol || DEFAULT_CURRENCY.symbol);

  // Sélection auto de la devise selon le pays
  const handleCountryChange = (countryName: string) => {
    setStoreCountry(countryName);
    const country = COUNTRIES.find((c) => c.name === countryName);
    if (country) {
      setStoreCurrency(country.currency.symbol);
    }
  };
  const [creating, setCreating] = useState(false);

  // Formulaire nouvel admin
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  // Récupération des magasins avec React Query — requête groupée pour éviter N+1
  const { data: stores = [], isLoading: loading } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      // 1. Récupérer toutes les organisations
      const { data: orgs, error: orgsError } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });

      if (orgsError) throw orgsError;
      if (!orgs || orgs.length === 0) return [];

      // 2. Récupérer en lot TOUS les profils de ces orgs (2 requêtes au lieu de N*2)
      const orgIds = orgs.map((o) => o.id);

      // Premier profil admin par org
      const { data: adminProfiles } = await supabase
        .from("profiles")
        .select("owner_name, user_id, organization_id")
        .in("organization_id", orgIds);

      // Nombre d'utilisateurs par org en une seule requête
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("organization_id")
        .in("organization_id", orgIds);

      // Construction des maps de recherche
      const adminMap = new Map<string, { owner_name: string | null; user_id: string | null }>();
      const seenOrgs = new Set<string>();
      // Prendre uniquement le premier admin par org
      for (const p of adminProfiles || []) {
        if (p.organization_id && !seenOrgs.has(p.organization_id)) {
          seenOrgs.add(p.organization_id);
          adminMap.set(p.organization_id, { owner_name: p.owner_name, user_id: p.user_id });
        }
      }

      const countMap = new Map<string, number>();
      for (const p of allProfiles || []) {
        if (p.organization_id) {
          countMap.set(p.organization_id, (countMap.get(p.organization_id) || 0) + 1);
        }
      }

      // 3. Fusion
      return orgs.map((org) => ({
        ...org,
        admin_name: adminMap.get(org.id)?.owner_name || "—",
        admin_id: adminMap.get(org.id)?.user_id,
        user_count: countMap.get(org.id) || 0,
      })) as StoreWithAdmin[];
    },
  });

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { error } = await supabase.from("organizations").insert({
        name: storeName,
        category: storeCategory,
        owner_user_id: (await supabase.auth.getUser()).data.user?.id ?? "",
        country: storeCountry,
        currency: storeCurrency,
      });

      if (error) throw error;

      toast({ title: "Magasin créé", description: `"${storeName}" a été ajouté.` });
      setStoreName("");
      setStoreCategory("epicerie");
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["stores"] });
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
      // Utiliser l'Edge Function pour contourner les limites de débit côté client (429)
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Non authentifié");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/admin-create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: adminEmail,
          password: adminPassword,
          ownerName: adminName,
          phone: adminPhone || null,
          role: "admin",
          requireEmailVerification: false,
          targetOrganizationId: selectedStore.id,
          targetBusinessName: selectedStore.name,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erreur lors de la création du compte");
      }

      toast({
        title: "Admin créé",
        description: `${adminName} est maintenant admin de "${selectedStore.name}".`,
      });

      // Réinitialiser le formulaire
      setAdminEmail("");
      setAdminPassword("");
      setAdminName("");
      setAdminPhone("");
      setAdminDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["stores"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ variant: "destructive", title: "Erreur", description: message });
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleDeleteStore = async (store: StoreWithAdmin) => {
    setStoreToDelete(store);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteStore = async () => {
    if (!storeToDelete) return;
    try {
      const { error } = await supabase.from("organizations").delete().eq("id", storeToDelete.id);
      if (error) throw error;
      toast({ title: "Magasin supprimé", description: `"${storeToDelete.name}" a été supprimé.` });
      queryClient.invalidateQueries({ queryKey: ["stores"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ variant: "destructive", title: "Erreur", description: message });
    } finally {
      setDeleteDialogOpen(false);
      setStoreToDelete(null);
    }
  };

  // Filtrer les magasins par catégorie
  const filteredStores =
    filterCategory === "all"
      ? stores
      : stores.filter((s) => s.category === filterCategory);

  // Compter les magasins par catégorie
  const categoryCounts = stores.reduce<Record<string, number>>((acc, s) => {
    const key = s.category || "autre";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  if (!isAdminRole(userRole)) {
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Store className="h-6 w-6 lg:h-8 lg:w-8" />
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
            <DialogContent className="sm:max-w-lg">
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

                {/* Catégorie du magasin */}
                <div className="space-y-2">
                  <Label>Type de magasin</Label>
                  <Select value={storeCategory} onValueChange={(v) => setStoreCategory(v as StoreCategory)}>
                    <SelectTrigger>
                      <div className="flex items-center gap-2">
                        <CategoryIcon value={storeCategory} />
                        <SelectValue placeholder="Sélectionner un type" />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {STORE_CATEGORIES.map((cat) => {
                        const Icon = cat.icon;
                        return (
                          <SelectItem key={cat.value} value={cat.value}>
                            <span className="flex items-center gap-2">
                              <Icon className={`h-4 w-4 ${cat.color}`} />
                              <span>{cat.label}</span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Pays</Label>
                    <Select value={storeCountry} onValueChange={handleCountryChange}>
                      <SelectTrigger>
                        <MapPin className="h-4 w-4 mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c.code} value={c.name}>{c.name}</SelectItem>
                        ))}
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
                        {Array.from(new Map(COUNTRIES.map((c) => [c.currency.symbol, c.currency])).values()).map((cur) => (
                          <SelectItem key={cur.symbol} value={cur.symbol}>{cur.symbol} ({cur.name})</SelectItem>
                        ))}
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Types de magasins</CardDescription>
              <CardTitle className="text-3xl">
                {Object.keys(categoryCounts).length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filtre par catégorie */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Filtrer :</span>
          <Button
            variant={filterCategory === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterCategory("all")}
          >
            Tous ({stores.length})
          </Button>
          {STORE_CATEGORIES.filter((cat) => categoryCounts[cat.value]).map((cat) => {
            const Icon = cat.icon;
            return (
              <Button
                key={cat.value}
                variant={filterCategory === cat.value ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterCategory(cat.value)}
                className="gap-1.5"
              >
                <Icon className={`h-3.5 w-3.5 ${cat.color}`} />
                {cat.label} ({categoryCounts[cat.value] || 0})
              </Button>
            );
          })}
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
              <StoresPageSkeleton />
            ) : filteredStores.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {stores.length === 0
                  ? "Aucun magasin. Créez votre premier magasin !"
                  : "Aucun magasin dans cette catégorie."}
              </div>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Magasin</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden sm:table-cell">Pays</TableHead>
                    <TableHead className="hidden md:table-cell">Devise</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead className="hidden lg:table-cell">Utilisateurs</TableHead>
                    <TableHead className="hidden md:table-cell">Plan</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStores.map((store) => (
                    <TableRow key={store.id}>
                      <TableCell className="font-medium">{store.name}</TableCell>
                      <TableCell>
                        <CategoryBadge value={store.category} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {store.country || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline">{store.currency || DEFAULT_CURRENCY.symbol}</Badge>
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
                      <TableCell className="hidden md:table-cell">
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
              </div>
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

        {/* Dialogue de confirmation de suppression */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer le magasin</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer le magasin "{storeToDelete?.name}" ? Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteStore}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default Stores;
