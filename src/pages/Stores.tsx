import { useState, useEffect, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoContext";
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
import { reportError } from "@/lib/sentry";
import { extractErrorMessage } from "@/lib/extractErrorMessage";
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
import { PlanLimitGuard } from "@/components/saas/PlanLimitGuard";

type Organization = Database["public"]["Tables"]["organizations"]["Row"];
type StoreCategory = Database["public"]["Enums"]["store_category"];
type StoreRow = Database["public"]["Tables"]["stores"]["Row"];

interface RealStore {
  id: string;
  organization_id: string | null;
  name: string;
  slug: string | null;
  category: StoreCategory | null;
  country: string | null;
  currency: string | null;
  created_at: string;
  is_headquarters?: boolean;
  is_active?: boolean;
  city?: string | null;
  address?: string | null;
}

interface StoreWithAdmin extends Organization {
  admin_name?: string;
  admin_email?: string;
  admin_id?: string;
  user_count?: number;
  real_stores?: RealStore[];
  store_count?: number;
}

/**
 * Cible de suppression sélectionnée dans le dialog de confirmation.
 * storeToDeleteId/storeToDeleteName sont renseignés quand on supprime un
 * magasin précis (real_stores) plutôt que l'organisation entière.
 */
type DeletionTarget = StoreWithAdmin & {
  storeToDeleteId?: string;
  storeToDeleteName?: string;
};

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
  const { userRole, profile } = useAuth();
  const { toast } = useToast();
  const { blockMutation } = useDemo();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreWithAdmin | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<DeletionTarget | null>(null);

  // Formulaire nouveau magasin
  const [storeName, setStoreName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [storeCategory, setStoreCategory] = useState<StoreCategory>("epicerie");
  const [storeCountry, setStoreCountry] = useState(COUNTRIES[0]?.code || "GN");
  const [storeCurrency, setStoreCurrency] = useState(COUNTRIES[0]?.currency.code || DEFAULT_CURRENCY.code);
  const [storeCity, setStoreCity] = useState("");
  // Mode création : "org" (nouvelle organisation) ou "store" (magasin dans org existante)
  const [createMode, setCreateMode] = useState<"org" | "store">("org");
  // Un admin normal (non-super_admin) ne peut jamais créer d'organisation indépendante —
  // il ne voit pas le toggle org/magasin, donc on le force en mode "store" dès que son
  // rôle est connu, sinon il resterait bloqué sur le formulaire "créer une organisation".
  useEffect(() => {
    if (userRole && userRole !== "super_admin") {
      setCreateMode("store");
    }
  }, [userRole]);
  // Pour le super_admin : choix de l'organisation cible si mode "store"
  const [targetOrgId, setTargetOrgId] = useState<string>("");
  // Admin à créer en même temps que l'organisation
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPhone, setAdminPhone] = useState("");

  // Sélection auto de la devise selon le pays
  const handleCountryChange = (countryCode: string) => {
    setStoreCountry(countryCode);
    const country = COUNTRIES.find((c) => c.code === countryCode);
    if (country) {
      setStoreCurrency(country.currency.code);
    }
  };
  const [creating, setCreating] = useState(false);

  // Formulaire nouvel admin (réutilisé pour le dialogue "Ajouter admin")
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

      // Récupérer aussi les stores réels pour afficher le détail
      const { data: realStores } = await supabase
        .from("stores")
        .select("id, organization_id, name, slug, category, country, currency, created_at, is_headquarters, is_active, city, address")
        .in("organization_id", orgIds)
        .order("created_at", { ascending: false });

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

      // Map des stores par org (pour afficher le count et la liste)
      const storesByOrg = new Map<string, typeof realStores>();
      for (const s of realStores || []) {
        if (s.organization_id) {
          const arr = storesByOrg.get(s.organization_id) || [];
          arr.push(s);
          storesByOrg.set(s.organization_id, arr);
        }
      }

      // 3. Fusion — attache les stores réels à chaque org
      return orgs.map((org) => ({
        ...org,
        admin_name: adminMap.get(org.id)?.owner_name || "—",
        admin_id: adminMap.get(org.id)?.user_id,
        user_count: countMap.get(org.id) || 0,
        real_stores: storesByOrg.get(org.id) || [],
        store_count: (storesByOrg.get(org.id) || []).length,
      })) as StoreWithAdmin[];
    },
  });

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blockMutation('Gérer les boutiques')) return;
    setCreating(true);
    try {
      const slug = storeName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      if (createMode === "org" && userRole === "super_admin") {
        // MODE ORGANISATION : créer une NOUVELLE organisation indépendante + son premier magasin
        // (réservé au super_admin — le toggle org/magasin n'est visible que pour lui ;
        //  un admin normal reste sur createMode="org" par défaut mais doit toujours
        //  passer par la branche "ajouter un magasin à mon organisation" ci-dessous)
        const finalOrgName = orgName.trim() || storeName.trim();
        const finalStoreName = storeName.trim() || orgName.trim();

        // Utiliser le nouveau RPC super_admin_create_organization qui crée
        // une organisation INDÉPENDANTE (sans modifier le profil du super_admin)
        const { data: orgResult, error: orgError } = await supabase.rpc(
          "super_admin_create_organization",
          {
            p_org_name: finalOrgName,
            p_store_name: finalStoreName,
            p_store_slug: slug || `store-${Date.now()}`,
            p_store_category: storeCategory,
            p_country: storeCountry,
            p_currency: storeCurrency,
            p_city: storeCity || null,
            p_address: null,
          }
        );

        if (orgError) {
          const msg = extractErrorMessage(orgError);
          toast({ variant: "destructive", title: "Erreur", description: msg });
          return;
        }

        // Le RPC retourne une table : { org_id, store_id, success, error }
        const orgData = Array.isArray(orgResult) && orgResult.length > 0
          ? orgResult[0] as { org_id?: string; store_id?: string; success?: boolean; error?: string }
          : orgResult as { org_id?: string; store_id?: string; success?: boolean; error?: string } | null;

        if (!orgData?.success) {
          const errMsg = orgData?.error || "Erreur inconnue lors de la création de l'organisation";
          toast({ variant: "destructive", title: "Erreur", description: errMsg });
          return;
        }

        const newOrgId = orgData.org_id;

        // Si un admin est renseigné, le créer via l'Edge Function en l'associant à la NOUVELLE org
        if (adminEmail.trim() && adminPassword.trim() && adminName.trim()) {
          try {
            // Utiliser fetch direct pour récupérer le vrai message d'erreur (invoke masque le body)
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;
            if (!accessToken) throw new Error("Non authentifié");

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const adminResponse = await fetch(`${supabaseUrl}/functions/v1/admin-create-user`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                email: adminEmail.trim(),
                password: adminPassword.trim(),
                ownerName: adminName.trim(),
                phone: adminPhone.trim() || null,
                role: "admin",
                requireEmailVerification: false,
                targetOrganizationId: newOrgId, // ← l'admin est associé à la NOUVELLE organisation
                targetBusinessName: finalOrgName,
              }),
            });

            const adminResultText = await adminResponse.text();
            let adminResultJson: { error?: string; success?: boolean; userId?: string; raw?: string } = {};
            try { adminResultJson = JSON.parse(adminResultText); } catch { adminResultJson = { raw: adminResultText }; }

            if (!adminResponse.ok) {
              throw new Error(adminResultJson.error || `Erreur ${adminResponse.status}: ${adminResultText}`);
            }

            toast({
              title: "Organisation, magasin et admin créés",
              description: `Nouvelle organisation "${finalOrgName}" + magasin "${finalStoreName}" + admin "${adminName.trim()}" créés avec succès.`
            });
          } catch (adminErr) {
            const adminMsg = adminErr instanceof Error ? adminErr.message : String(adminErr);
            toast({
              title: "Organisation créée, admin en échec",
              description: `L'organisation "${finalOrgName}" a été créée mais l'admin n'a pas pu être créé : ${adminMsg}. Utilisez le bouton "Admin" sur cette nouvelle organisation pour réessayer.`,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Organisation créée",
            description: `Nouvelle organisation indépendante "${finalOrgName}" créée avec le magasin "${finalStoreName}". Ajoutez un admin via le bouton "Admin".`
          });
        }
      } else {
        // MODE MAGASIN : ajouter un magasin à une organisation existante
        const orgId = userRole === "super_admin" ? targetOrgId : profile?.organization_id;
        if (!orgId) {
          toast({ variant: "destructive", title: "Erreur", description: "Organisation cible manquante" });
          return;
        }

        const { data, error } = await supabase.rpc("create_store", {
          p_organization_id: orgId,
          p_name: storeName,
          p_slug: slug || `store-${Date.now()}`,
          p_category: storeCategory,
          p_country: storeCountry,
          p_currency: storeCurrency,
          p_city: storeCity || null,
        });

        if (error) {
          const msg = extractErrorMessage(error);
          toast({ variant: "destructive", title: "Erreur", description: msg });
          return;
        }

        toast({
          title: "Magasin créé",
          description: `"${storeName}" a été ajouté à l'organisation.`
        });
      }

      setStoreName("");
      setOrgName("");
      setStoreCity("");
      setAdminName("");
      setAdminEmail("");
      setAdminPassword("");
      setAdminPhone("");
      setStoreCategory("epicerie");
      setTargetOrgId("");
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["stores"] });
    } catch (error) {
      const message = extractErrorMessage(error);
      reportError(error instanceof Error ? error : new Error(message));
      const isPlanLimit = message.includes('Limite') || message.includes('plan') || message.includes('Upgrad') || message.includes('Upgradez');
      toast({
        variant: "destructive",
        title: isPlanLimit ? "Limite atteinte" : "Erreur",
        description: isPlanLimit
          ? "Limite de boutiques atteinte pour votre plan. Upgradez votre abonnement."
          : message,
      });
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
        console.error("[Stores] admin-create-user error:", response.status, result);
        throw new Error(result.error || `Erreur ${response.status}: ${JSON.stringify(result)}`);
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
      const message = extractErrorMessage(error);
      reportError(error instanceof Error ? error : new Error(message));
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
    if (blockMutation('Gérer les boutiques')) return;
    try {
      // Si c'est une organisation (storeToDelete.real_stores existe), supprimer l'org
      // Si c'est un magasin spécifique (storeToDelete.storeToDeleteId existe), supprimer le store
      if (storeToDelete.storeToDeleteId) {
        // Supprimer un magasin spécifique
        const { error } = await supabase.rpc("delete_store", { p_store_id: storeToDelete.storeToDeleteId });
        if (error) {
          const msg = extractErrorMessage(error);
          toast({ variant: "destructive", title: "Erreur", description: msg });
          return;
        }
        toast({ title: "Magasin supprimé", description: `"${storeToDelete.storeToDeleteName}" a été supprimé.` });
      } else {
        // Supprimer l'organisation entière
        const { error } = await supabase.rpc("delete_organization", { p_organization_id: storeToDelete.id });
        if (error) return [];
        toast({ title: "Organisation supprimée", description: `"${storeToDelete.name}" et tous ses magasins ont été supprimés.` });
      }
      queryClient.invalidateQueries({ queryKey: ["stores"] });
    } catch (error) {
      const message = extractErrorMessage(error);
      reportError(error instanceof Error ? error : new Error(message));
      const isPermissionDenied = message.includes('Accès refusé') || message.includes('super administrateur');
      toast({
        variant: "destructive",
        title: isPermissionDenied ? "Accès refusé" : "Erreur",
        description: isPermissionDenied
          ? "Seul un super administrateur peut supprimer une organisation."
          : message,
      });
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

          <PlanLimitGuard limitType="stores" showUpgrade={true}>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
                  <span className="sm:inline">
                    {userRole === "super_admin" ? "Nouvelle organisation" : "Nouveau magasin"}
                  </span>
                  <span className="sm:hidden">Nouveau</span>
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto w-[95vw] sm:w-full p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle className="text-lg sm:text-xl">
                  {createMode === "org" ? "Créer une organisation" : "Ajouter un magasin"}
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  {createMode === "org"
                    ? "Créez une nouvelle organisation indépendante avec son administrateur en une seule opération."
                    : "Ajoutez un magasin à une organisation existante."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateStore} className="space-y-4">
                {/* Toggle : Organisation vs Magasin */}
                {userRole === "super_admin" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={createMode === "org" ? "default" : "outline"}
                      onClick={() => setCreateMode("org")}
                      className="text-xs sm:text-sm"
                    >
                      Nouvelle org.
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={createMode === "store" ? "default" : "outline"}
                      onClick={() => setCreateMode("store")}
                      className="text-xs sm:text-sm"
                    >
                      Magasin existant
                    </Button>
                  </div>
                )}

                {/* Sélection de l'org cible (super_admin + mode store) */}
                {createMode === "store" && userRole === "super_admin" && (
                  <div className="space-y-2">
                    <Label htmlFor="target-org">Organisation cible</Label>
                    <Select value={targetOrgId} onValueChange={setTargetOrgId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une organisation" />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Nom de l'organisation (mode org seulement) */}
                {createMode === "org" && (
                  <div className="space-y-2">
                    <Label htmlFor="org-name">Nom de l'organisation *</Label>
                    <div className="relative">
                      <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="org-name"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="Ex: Diallo & Frères SARL"
                        className="pl-10"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      L'organisation est l'entité juridique qui regroupe plusieurs magasins
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="store-name">
                    {createMode === "org" ? "Nom du premier magasin *" : "Nom du magasin *"}
                  </Label>
                  <div className="relative">
                    <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="store-name"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder={createMode === "org" ? "Ex: Magasin Conakry" : "Ex: Magasin Kamsar"}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                {/* Ville (mode magasin seulement) */}
                {createMode === "store" && (
                  <div className="space-y-2">
                    <Label htmlFor="store-city">Ville / Quartier (optionnel)</Label>
                    <Input
                      id="store-city"
                      value={storeCity}
                      onChange={(e) => setStoreCity(e.target.value)}
                      placeholder="Ex: Conakry, Kamsar..."
                    />
                  </div>
                )}

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
                          <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
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
                        {Array.from(new Map(COUNTRIES.map((c) => [c.currency.code, c.currency])).values()).map((cur) => (
                          <SelectItem key={cur.code} value={cur.code}>{cur.symbol} ({cur.name})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Section administrateur (mode org seulement) */}
                {createMode === "org" && (
                  <div className="space-y-3 p-4 border-2 border-primary/40 rounded-lg bg-primary/5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="text-sm font-semibold flex items-center gap-2">
                          <UserPlus className="h-4 w-4 text-primary" />
                          Administrateur de l'organisation
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Créé en même temps que l'organisation — connexion immédiate possible.
                        </p>
                      </div>
                      <Badge className="bg-primary text-primary-foreground">
                        Rôle : Administrateur
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="admin-name" className="text-xs font-medium">Nom complet *</Label>
                        <Input
                          id="admin-name"
                          value={adminName}
                          onChange={(e) => setAdminName(e.target.value)}
                          placeholder="Ex: Mamadou Diallo"
                          className="h-10"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="admin-phone" className="text-xs font-medium">Téléphone</Label>
                        <Input
                          id="admin-phone"
                          value={adminPhone}
                          onChange={(e) => setAdminPhone(e.target.value)}
                          placeholder="Ex: +224 622 000 000"
                          className="h-10"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="admin-email" className="text-xs font-medium">Email *</Label>
                      <Input
                        id="admin-email"
                        type="email"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="Ex: admin@boutique.com"
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="admin-password" className="text-xs font-medium">Mot de passe *</Label>
                      <Input
                        id="admin-password"
                        type="password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="Min. 8 caractères, 1 majuscule, 1 chiffre"
                        className="h-10"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        L'administrateur pourra se connecter avec cet email et ce mot de passe.
                      </p>
                    </div>
                  </div>
                )}

                <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 px-4 sm:px-6 py-3 bg-background border-t flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    disabled={creating}
                    className="w-full sm:w-auto"
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={creating} className="gap-2 w-full sm:w-auto">
                    {creating ? (
                      <>
                        <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Création...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        {createMode === "org"
                          ? (adminEmail.trim() ? "Créer org. + admin" : "Créer l'organisation")
                          : "Créer le magasin"}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </PlanLimitGuard>
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
        <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-muted-foreground shrink-0">Filtrer :</span>
          <Button
            variant={filterCategory === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterCategory("all")}
            className="shrink-0"
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
                className="gap-1.5 shrink-0"
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
              <>
                {/* Vue cartes (mobile uniquement) */}
                <div className="md:hidden space-y-3">
                  {filteredStores.map((store) => (
                    <Card key={store.id} className="overflow-hidden">
                      <CardContent className="p-4 space-y-3">
                        {/* En-tête carte : nom + plan */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Store className="h-4 w-4 text-primary shrink-0" />
                            <span className="font-semibold truncate">{store.name}</span>
                          </div>
                          <Badge variant="outline" className="capitalize text-xs shrink-0">
                            {store.subscription_plan || "starter"}
                          </Badge>
                        </div>

                        {/* Pays + Devise + Utilisateurs */}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {store.country && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {store.country}
                            </span>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {store.currency || DEFAULT_CURRENCY.symbol}
                          </Badge>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {store.user_count || 0} utilisateur(s)
                          </span>
                        </div>

                        {/* Admin */}
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground text-xs">Admin :</span>
                          {store.admin_name !== "—" ? (
                            <span className="flex items-center gap-1 font-medium">
                              <Users className="h-3 w-3" />
                              {store.admin_name}
                            </span>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Aucun admin</Badge>
                          )}
                        </div>

                        {/* Boutiques */}
                        {store.real_stores && store.real_stores.length > 0 && (
                          <div className="space-y-1.5 pt-2 border-t">
                            <p className="text-xs text-muted-foreground font-medium">
                              Magasins ({store.real_stores.length}) :
                            </p>
                            {store.real_stores.map((rs) => (
                              <div
                                key={rs.id}
                                className="flex items-center justify-between text-xs bg-muted/40 rounded px-2 py-1.5"
                              >
                                <span className="flex items-center gap-1 min-w-0">
                                  <Store className="h-3 w-3 text-primary shrink-0" />
                                  <span className="truncate">{rs.name}</span>
                                  {rs.is_headquarters && (
                                    <Badge variant="outline" className="text-[10px] px-1 shrink-0">Siège</Badge>
                                  )}
                                </span>
                                {(userRole === "super_admin" || userRole === "admin") && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-destructive shrink-0"
                                    onClick={() => {
                                      setStoreToDelete({
                                        ...store,
                                        storeToDeleteId: rs.id,
                                        storeToDeleteName: rs.name,
                                      });
                                      setDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Actions principales */}
                        <div className="flex gap-2 pt-2 border-t">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 flex-1"
                            onClick={() => {
                              setSelectedStore(store);
                              setAdminDialogOpen(true);
                            }}
                          >
                            <UserPlus className="h-3 w-3" />
                            Admin
                          </Button>
                          {userRole === "super_admin" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive gap-1"
                              onClick={() => {
                                setStoreToDelete({ ...store, storeToDeleteId: undefined, storeToDeleteName: undefined });
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                              Org.
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Vue tableau (desktop uniquement) */}
                <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organisation</TableHead>
                    <TableHead className="hidden sm:table-cell">Boutiques</TableHead>
                    <TableHead className="hidden md:table-cell">Pays</TableHead>
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
                      <TableCell className="hidden sm:table-cell">
                        {store.real_stores && store.real_stores.length > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Store className="h-3 w-3 text-muted-foreground" />
                              <Badge variant="secondary" className="text-xs">
                                {store.real_stores.length} boutique{store.real_stores.length > 1 ? "s" : ""}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {store.real_stores.slice(0, 3).map((s) => (
                                <span key={s.id} className="text-xs px-1.5 py-0.5 bg-muted rounded">
                                  {s.name}
                                </span>
                              ))}
                              {store.real_stores.length > 3 && (
                                <span className="text-xs text-muted-foreground">
                                  +{store.real_stores.length - 3}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Aucune boutique
                          </Badge>
                        )}
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
                          {/* Bouton supprimer organisation (super_admin only) */}
                          {userRole === "super_admin" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => {
                                setStoreToDelete({ ...store, storeToDeleteId: undefined, storeToDeleteName: undefined });
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        {/* Magasins individuels sous l'organisation */}
                        {store.real_stores && store.real_stores.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-muted-foreground font-medium">Magasins ({store.real_stores.length}) :</p>
                            {store.real_stores.map((rs) => (
                              <div key={rs.id} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1">
                                <span className="flex items-center gap-1">
                                  <Store className="h-3 w-3 text-primary" />
                                  {rs.name}
                                  {rs.is_headquarters && <Badge variant="outline" className="text-[10px] px-1">Siège</Badge>}
                                </span>
                                {(userRole === "super_admin" || userRole === "admin") && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 w-5 p-0 text-destructive"
                                    onClick={() => {
                                      setStoreToDelete({
                                        ...store,
                                        storeToDeleteId: rs.id,
                                        storeToDeleteName: rs.name,
                                      });
                                      setDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Add Admin Dialog */}
        <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto w-[95vw] sm:w-full p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">Ajouter un admin</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                Créez un compte administrateur pour le magasin "{selectedStore?.name}".
                L'admin pourra gérer les utilisateurs, produits et ventes de ce magasin.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Rôle assigné :</span>
                </div>
                <Badge className="bg-primary text-primary-foreground">Administrateur</Badge>
              </div>
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
                  placeholder="Min. 8 caractères, 1 majuscule, 1 chiffre"
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
              <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 px-4 sm:px-6 py-3 bg-background border-t flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAdminDialogOpen(false)}
                  disabled={creatingAdmin}
                  className="w-full sm:w-auto"
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={creatingAdmin} className="gap-2 w-full sm:w-auto">
                  {creatingAdmin ? (
                    <>
                      <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Création...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Créer l'admin
                    </>
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialogue de confirmation de suppression */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {storeToDelete?.storeToDeleteId
                  ? `Supprimer le magasin "${storeToDelete.storeToDeleteName}"`
                  : `Supprimer l'organisation "${storeToDelete?.name}"`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {storeToDelete?.storeToDeleteId
                  ? "Ce magasin et ses données (ventes, stock) seront supprimés. L'organisation restera intacte. Cette action est irréversible."
                  : "Cette organisation et tous ses magasins, abonnements et données associées seront supprimés. Cette action est irréversible."}
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
