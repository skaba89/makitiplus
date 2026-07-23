/**
 * Page de diagnostic des stores — MakitiPlus
 *
 * Affiche l'état réel des stores et organisations visibles par l'utilisateur
 * connecté. Utile pour debugger pourquoi un store créé n'apparaît pas.
 *
 * Accessible via /diagnostic-stores (auth requis)
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Store, Building2, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

export default function DiagnosticStores() {
  const { user, profile, userRole } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["diagnostic-stores", user?.id, refreshKey],
    queryFn: async () => {
      if (!user) return null;

      // 1. Récupérer TOUTES les organizations visibles par l'utilisateur
      const { data: orgs, error: orgsError } = await supabase
        .from("organizations")
        .select("*");

      // 2. Récupérer TOUTES les stores visibles par l'utilisateur
      const { data: stores, error: storesError } = await supabase
        .from("stores")
        .select("*");

      // 3. Récupérer le profil de l'utilisateur
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      // 4. Récupérer le rôle
      const { data: userRoleRow } = await supabase
        .from("user_roles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      return {
        orgs: orgs || [],
        orgsError: orgsError?.message,
        stores: stores || [],
        storesError: storesError?.message,
        userProfile,
        userRoleRow: userRoleRow?.role,
      };
    },
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Connexion requise</h2>
            <p className="text-muted-foreground mb-4">
              Tu dois être connecté pour accéder au diagnostic des stores.
            </p>
            <Button asChild>
              <Link to="/auth">Se connecter</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Diagnostic Stores</h1>
            <p className="text-muted-foreground mt-1">
              État réel des stores et organisations visibles
            </p>
          </div>
          <Button
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={isLoading}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Rafraîchir
          </Button>
        </div>

        {/* User info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Utilisateur connecté</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Email</p>
                <p className="font-medium">{user.email}</p>
              </div>
              <div>
                <p className="text-muted-foreground">User ID</p>
                <p className="font-mono text-xs">{user.id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Rôle (context)</p>
                <Badge>{userRole || "—"}</Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Rôle (DB)</p>
                <Badge>{data?.userRoleRow || "—"}</Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Org ID (profile)</p>
                <p className="font-mono text-xs">{profile?.organization_id || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Org ID (DB)</p>
                <p className="font-mono text-xs">{data?.userProfile?.organization_id || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Business name</p>
                <p className="font-medium">{data?.userProfile?.business_name || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Owner name</p>
                <p className="font-medium">{data?.userProfile?.owner_name || "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Erreurs éventuelles */}
        {(data?.orgsError || data?.storesError) && (
          <Card className="mb-6 border-red-500">
            <CardHeader>
              <CardTitle className="text-lg text-red-700">Erreurs RLS détectées</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data?.orgsError && (
                <p className="text-sm text-red-700">organizations: {data.orgsError}</p>
              )}
              {data?.storesError && (
                <p className="text-sm text-red-700">stores: {data.storesError}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Organizations */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5" />
              Organisations ({data?.orgs?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.orgs?.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aucune organisation visible. Soit RLS bloque, soit tu n'as pas d'org.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3">Nom</th>
                      <th className="text-left py-2 px-3">ID</th>
                      <th className="text-left py-2 px-3">Owner</th>
                      <th className="text-left py-2 px-3">Plan</th>
                      <th className="text-left py-2 px-3">Créée le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.orgs?.map((org) => (
                      <tr key={org.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-3 font-medium">{org.name}</td>
                        <td className="py-2 px-3 font-mono text-xs">{org.id}</td>
                        <td className="py-2 px-3 font-mono text-xs">{org.owner_user_id}</td>
                        <td className="py-2 px-3">
                          <Badge variant="outline">{org.subscription_plan || "—"}</Badge>
                        </td>
                        <td className="py-2 px-3 text-xs">
                          {org.created_at ? new Date(org.created_at).toLocaleString("fr-FR") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stores */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Store className="h-5 w-5" />
              Stores ({data?.stores?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.stores?.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aucun store visible. Soit RLS bloque, soit tu n'as pas de store.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3">Nom</th>
                      <th className="text-left py-2 px-3">Slug</th>
                      <th className="text-left py-2 px-3">Catégorie</th>
                      <th className="text-left py-2 px-3">Org ID</th>
                      <th className="text-left py-2 px-3">Pays</th>
                      <th className="text-left py-2 px-3">Devise</th>
                      <th className="text-left py-2 px-3">Créé le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.stores?.map((store) => (
                      <tr key={store.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-3 font-medium">{store.name}</td>
                        <td className="py-2 px-3 font-mono text-xs">{store.slug}</td>
                        <td className="py-2 px-3">
                          <Badge variant="secondary">{store.category || "—"}</Badge>
                        </td>
                        <td className="py-2 px-3 font-mono text-xs">{store.organization_id}</td>
                        <td className="py-2 px-3">{store.country || "—"}</td>
                        <td className="py-2 px-3">{store.currency || "—"}</td>
                        <td className="py-2 px-3 text-xs">
                          {store.created_at ? new Date(store.created_at).toLocaleString("fr-FR") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Diagnostic conclusion */}
        <Card className={`border-2 ${data?.stores?.length && data?.stores?.length > 0 ? "border-green-500" : "border-red-500"}`}>
          <CardHeader>
            <CardTitle className="text-lg">Conclusion du diagnostic</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.stores?.length === 0 ? (
              <div className="space-y-2">
                <p className="text-red-700 font-medium">❌ Aucun store visible par l'utilisateur</p>
                <p className="text-sm text-muted-foreground">
                  Causes possibles :
                </p>
                <ul className="list-disc list-inside text-sm space-y-1 ml-4">
                  <li>RLS bloque la lecture de la table <code>stores</code></li>
                  <li>Ton profil n'est pas lié à une organisation</li>
                  <li>Les stores existent en DB mais avec un <code>organization_id</code> différent</li>
                </ul>
                <p className="text-sm mt-3">
                  <strong>Action :</strong> exécute ce script SQL dans Supabase SQL Editor pour vérifier :
                </p>
                <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs mt-2 overflow-x-auto">
{`SELECT s.id, s.name, s.organization_id, o.name as org_name
FROM public.stores s
LEFT JOIN public.organizations o ON o.id = s.organization_id;
-- Compare s.organization_id avec ton profile.organization_id`}
                </pre>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-green-700 font-medium">
                  ✅ {data?.stores?.length} store(s) visible(s) par l'utilisateur
                </p>
                <p className="text-sm text-muted-foreground">
                  Si tu ne vois pas les stores sur la page /dashboard/stores, le problème vient du cache navigateur ou du filtre par catégorie.
                </p>
                <p className="text-sm mt-2">
                  <strong>Solution :</strong>
                </p>
                <ul className="list-disc list-inside text-sm space-y-1 ml-4">
                  <li>Vide le cache : F12 → Application → Storage → Clear site data</li>
                  <li>Force refresh : Ctrl+Shift+R</li>
                  <li>Vérifie que le filtre catégorie est sur "Tous"</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 flex gap-4 justify-center">
          <Button asChild variant="outline">
            <Link to="/dashboard/stores">Aller à la page Magasins</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/diagnostic">Diagnostic général</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
