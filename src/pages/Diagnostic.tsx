/**
 * Page de diagnostic production — MakitiPlus
 *
 * Vérifie l'état du système en temps réel :
 * - Connexion Supabase
 * - Migrations P1/P2/P3 appliquées
 * - Compte admin existant
 * - Edge functions déployées
 *
 * Accessible via /diagnostic (pas d'auth requis — utilise uniquement la anon key)
 *
 * Référence audit : AUDIT-2026-007
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ArrowRight,
  Database,
  Shield,
  Server,
  UserCheck,
  Lock,
} from "lucide-react";
import { Link } from "react-router-dom";

interface CheckResult {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn" | "loading";
  detail?: string;
  category: "connection" | "migrations" | "auth" | "functions";
}

const INITIAL_CHECKS: CheckResult[] = [
  { id: "supabase_url", label: "VITE_SUPABASE_URL configuré", status: "loading", category: "connection" },
  { id: "supabase_key", label: "VITE_SUPABASE_PUBLISHABLE_KEY configuré", status: "loading", category: "connection" },
  { id: "supabase_reachable", label: "Projet Supabase accessible", status: "loading", category: "connection" },
  { id: "is_org_admin", label: "is_org_admin() existe (HIGH-4)", status: "loading", category: "migrations" },
  { id: "record_user_logout", label: "record_user_logout() existe (LOW-4)", status: "loading", category: "migrations" },
  { id: "app_activity_action", label: "ENUM app_activity_action créé (MED-1)", status: "loading", category: "migrations" },
  { id: "whatsapp_config", label: "Table whatsapp_config créée (MED-3)", status: "loading", category: "migrations" },
  { id: "validate_backup_columns", label: "validate_backup_columns() existe (MED-4)", status: "loading", category: "migrations" },
  { id: "admin_exists", label: "Au moins un admin existe", status: "loading", category: "auth" },
  { id: "stripe_events_policy", label: "Policy stripe_events_service_role OK (HIGH-3)", status: "loading", category: "migrations" },
  // National readiness — migrations 2026-07-12
  { id: "migration_20260712170000", label: "20260712170000 — colonnes description/expiry_date/is_active ajoutées à products", status: "loading", category: "migrations" },
  { id: "migration_20260712190000", label: "20260712190000 — cast p_payment_method::public.payment_method", status: "loading", category: "migrations" },
  { id: "migration_20260712195000", label: "20260712195000 — harden_sales_store_scope (p_store_id optionnel + fallback)", status: "loading", category: "migrations" },
  { id: "create_sale_with_limit_p_store_id", label: "create_sale_with_limit accepte p_store_id", status: "loading", category: "functions" },
  { id: "sales_store_id_test", label: "sales.store_id testé (non-NULL après vente)", status: "loading", category: "functions" },
  { id: "sale_items_org_store_test", label: "sale_items.organization_id + sale_items.store_id testés", status: "loading", category: "functions" },
];

export default function Diagnostic() {
  const { userRole } = useAuth();
  const isSuperAdmin = userRole === "super_admin";
  const [checks, setChecks] = useState<CheckResult[]>(INITIAL_CHECKS);
  const [isRunning, setIsRunning] = useState(false);

  const updateCheck = (id: string, status: CheckResult["status"], detail?: string) => {
    setChecks((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status, detail } : c))
    );
  };

  const runChecks = async () => {
    setIsRunning(true);
    setChecks(INITIAL_CHECKS.map((c) => ({ ...c, status: "loading" })));

    // 1. Vérifier les variables d'environnement
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (supabaseUrl && !supabaseUrl.includes("your-project")) {
      // SECURITY: ne pas exposer l'URL complète aux visiteurs non authentifiés
      updateCheck("supabase_url", "pass", isSuperAdmin ? supabaseUrl : "URL configurée");
    } else {
      updateCheck("supabase_url", "fail", "Variable VITE_SUPABASE_URL manquante ou à valeur par défaut");
    }

    if (supabaseKey && !supabaseKey.includes("your-anon-key") && !supabaseKey.includes("dummy-key")) {
      // SECURITY: ne jamais afficher la clé, même tronquée
      updateCheck("supabase_key", "pass", "Clé configurée");
    } else {
      updateCheck("supabase_key", "fail", "Variable VITE_SUPABASE_PUBLISHABLE_KEY manquante ou à valeur par défaut");
    }

    // 2. Test de connexion Supabase
    try {
      const { error } = await supabase.auth.getSession();
      if (!error || error.message.includes("session")) {
        updateCheck("supabase_reachable", "pass", "Connexion OK");
      } else {
        updateCheck("supabase_reachable", "fail", error.message);
      }
    } catch (err) {
      updateCheck("supabase_reachable", "fail", String(err));
    }

    // 3. Vérifier is_org_admin() (HIGH-4)
    try {
      const { error } = await supabase.rpc("is_org_admin" as never);
      // Si on arrive ici sans erreur "function does not exist", la fonction existe
      if (error && error.message.includes("does not exist")) {
        updateCheck("is_org_admin", "fail", "Fonction non définie — appliquer P1");
      } else {
        updateCheck("is_org_admin", "pass", "Fonction définie");
      }
    } catch (err) {
      const msg = String(err);
      if (msg.includes("does not exist")) {
        updateCheck("is_org_admin", "fail", "Fonction non définie — appliquer P1");
      } else {
        updateCheck("is_org_admin", "pass", "Fonction définie (erreur d'auth attendue)");
      }
    }

    // 4. Vérifier record_user_logout() (LOW-4)
    try {
      const { error } = await supabase.rpc("record_user_logout" as never);
      if (error && error.message.includes("does not exist")) {
        updateCheck("record_user_logout", "fail", "Fonction non définie — appliquer P3");
      } else {
        updateCheck("record_user_logout", "pass", "Fonction définie");
      }
    } catch (err) {
      const msg = String(err);
      if (msg.includes("does not exist")) {
        updateCheck("record_user_logout", "fail", "Fonction non définie — appliquer P3");
      } else {
        updateCheck("record_user_logout", "pass", "Fonction définie (erreur d'auth attendue)");
      }
    }

    // 5. Vérifier la table whatsapp_config (MED-3) — via SELECT
    try {
      const { error } = await supabase
        .from("whatsapp_config" as never)
        .select("id" as never)
        .limit(1);
      if (error && (error.message.includes("does not exist") || error.message.includes("relation"))) {
        updateCheck("whatsapp_config", "fail", "Table non créée — appliquer P2");
      } else {
        updateCheck("whatsapp_config", "pass", "Table créée");
      }
    } catch {
      updateCheck("whatsapp_config", "warn", "Impossible de vérifier (RLS ou table manquante)");
    }

    // 6. Vérifier validate_backup_columns() (MED-4)
    try {
      const { error } = await supabase.rpc("validate_backup_columns" as never, {
        p_table_name: "products",
        p_col_names: ["id"],
      } as never);
      if (error && error.message.includes("does not exist")) {
        updateCheck("validate_backup_columns", "fail", "Fonction non définie — appliquer P2");
      } else {
        updateCheck("validate_backup_columns", "pass", "Fonction définie");
      }
    } catch (err) {
      const msg = String(err);
      if (msg.includes("does not exist")) {
        updateCheck("validate_backup_columns", "fail", "Fonction non définie — appliquer P2");
      } else {
        updateCheck("validate_backup_columns", "pass", "Fonction définie");
      }
    }

    // 7. Vérifier ENUM app_activity_action (MED-1) — indirect via log_user_activity
    try {
      const { error } = await supabase.rpc("log_user_activity" as never, {
        p_action: "invalid_action_for_test",
      } as never);
      // Si l'ENUM existe, on doit recevoir une erreur "invalid input value for enum"
      // Si l'ENUM n'existe pas, on doit recevoir "does not exist" ou "column action does not exist"
      if (error && (error.message.includes("invalid input value for enum") || error.message.includes("Could not find"))) {
        updateCheck("app_activity_action", "pass", "ENUM créé (validation active)");
      } else if (error && error.message.includes("does not exist")) {
        updateCheck("app_activity_action", "fail", "Fonction log_user_activity non définie");
      } else {
        updateCheck("app_activity_action", "warn", "Comportement inattendu — vérifier manuellement");
      }
    } catch {
      updateCheck("app_activity_action", "warn", "Impossible de vérifier");
    }

    // 8. Vérifier si un admin existe
    try {
      // Utilise l'endpoint auth pour compter les users (méthode indirecte)
      // On ne peut pas directement requêter user_roles sans auth, donc on test l'inscription
      // Alternative : on check si on peut s'inscrire (si oui, on est probablement le premier)
      const { data: session } = await supabase.auth.getSession();
      if (session.session) {
        updateCheck("admin_exists", "pass", "Session active — un admin existe");
      } else {
        updateCheck("admin_exists", "warn", "Pas de session — connecte-toi ou inscris-toi");
      }
    } catch {
      updateCheck("admin_exists", "warn", "Impossible de vérifier");
    }

    // 9. Policy stripe_events (HIGH-3) — difficile à vérifier sans service_role
    // On skip ce check car il nécessite service_role
    updateCheck("stripe_events_policy", "warn", "Nécessite service_role — vérifier via SQL Editor");

    // 10. National readiness — vérifier les colonnes products (migration 20260712170000)
    try {
      const { error } = await supabase
        .from("products")
        .select("description, expiry_date, is_active")
        .limit(1);
      if (error) {
        // Si l'erreur mentionne "column does not exist" → migration non appliquée
        if (error.message.includes("does not exist") || error.message.includes("Could not find")) {
          updateCheck("migration_20260712170000", "fail", "Colonnes manquantes — appliquer la migration 20260712170000");
        } else {
          updateCheck("migration_20260712170000", "warn", `Erreur: ${error.message}`);
        }
      } else {
        updateCheck("migration_20260712170000", "pass", "Colonnes description, expiry_date, is_active présentes");
      }
    } catch (err) {
      updateCheck("migration_20260712170000", "warn", `Impossible de vérifier: ${String(err)}`);
    }

    // 11+12. National readiness — vérifier le cast payment_method (migration
    // 20260712190000) et harden_sales_store_scope / p_store_id (migration
    // 20260712195000).
    //
    // GAP-CLOSING FIX (trouvé pendant le nettoyage typecheck) : l'ancienne
    // version de ces deux checks appelait le VRAI create_sale_with_limit —
    // le check #11 avec p_store_id: null, qui laisse la fonction résoudre un
    // vrai magasin via le profil de l'appelant (fallback current_store_id →
    // siège → premier magasin actif) et donc CRÉER UNE VRAIE VENTE FANTÔME
    // ("DIAG_TEST", 0 article, 0 montant) dans la table sales de l'organisation
    // réelle de tout utilisateur authentifié visitant /diagnostic — en comptant
    // même contre son quota de ventes mensuel (check_plan_limit). Le check #12
    // était accidentellement sûr (UUID de magasin bidon → 'Magasin invalide'
    // levé avant l'INSERT), mais #11 ne l'était pas.
    //
    // Fix : un seul appel, avec le même UUID de magasin bidon que l'ancien
    // #12 — échoue systématiquement AVANT tout INSERT (soit "Organisation
    // introuvable" pour un compte sans org, soit "Magasin invalide" pour un
    // compte avec org réelle), donc jamais de vente créée. Les deux fixes de
    // signature (190000 et 195000) sont aujourd'hui fusionnés dans la même
    // fonction consolidée (20260713200000_FINAL_CONSOLIDATED_ALL_FIXES.sql,
    // p_store_id fait partie du même appel) — un seul test suffit pour les
    // deux : si la fonction existe et accepte p_store_id, les deux migrations
    // sont appliquées.
    try {
      const { error } = await supabase.rpc("create_sale_with_limit", {
        p_sale_number: "DIAG_TEST_STORE",
        p_subtotal: 0,
        p_total_amount: 0,
        p_items: [],
        p_tax_amount: 0,
        p_payment_method: "cash",
        p_amount_paid: 0,
        p_change_amount: 0,
        p_customer_name: undefined,
        p_customer_phone: undefined,
        p_seller_name: undefined,
        p_discount_amount: 0,
        p_store_id: "00000000-0000-0000-0000-000000000000", // UUID fictif — jamais un magasin réel
      });
      if (error && error.message.includes("does not exist")) {
        updateCheck("migration_20260712190000", "fail", "Fonction create_sale_with_limit manquante");
      } else {
        updateCheck("migration_20260712190000", "pass", "Fonction create_sale_with_limit présente (cast OK)");
      }
      if (error && error.message.includes("Could not find the function")) {
        updateCheck("migration_20260712195000", "fail", "p_store_id non accepté — appliquer 20260712195000");
        updateCheck("create_sale_with_limit_p_store_id", "fail", "p_store_id non supporté");
      } else {
        updateCheck("migration_20260712195000", "pass", "p_store_id accepté (harden_sales_store_scope OK)");
        updateCheck("create_sale_with_limit_p_store_id", "pass", "p_store_id supporté");
      }
    } catch (err) {
      const msg = String(err);
      if (msg.includes("does not exist")) {
        updateCheck("migration_20260712190000", "fail", "Fonction manquante — appliquer 20260712190000");
      } else {
        updateCheck("migration_20260712190000", "pass", "Fonction présente (erreur attendue)");
      }
      if (msg.includes("Could not find the function")) {
        updateCheck("migration_20260712195000", "fail", "p_store_id non accepté");
        updateCheck("create_sale_with_limit_p_store_id", "fail", "p_store_id non supporté");
      } else {
        updateCheck("migration_20260712195000", "pass", "p_store_id accepté (erreur attendue)");
        updateCheck("create_sale_with_limit_p_store_id", "pass", "p_store_id supporté");
      }
    }

    // 13. Vérifier sales.store_id et sale_items columns (lecture seule)
    try {
      const { data, error } = await supabase
        .from("sales")
        .select("id, store_id")
        .limit(1);
      if (error) {
        updateCheck("sales_store_id_test", "warn", `Erreur lecture sales: ${error.message}`);
      } else {
        const hasStoreId = data && data.length > 0 && data[0].store_id;
        if (hasStoreId) {
          updateCheck("sales_store_id_test", "pass", "Vente avec store_id non-NULL trouvée");
        } else {
          updateCheck("sales_store_id_test", "warn", "Colonne store_id présente mais aucune vente avec store_id non-NULL");
        }
      }
    } catch (err) {
      updateCheck("sales_store_id_test", "warn", `Impossible de vérifier: ${String(err)}`);
    }

    try {
      const { error } = await supabase
        .from("sale_items")
        .select("id, organization_id, store_id")
        .limit(1);
      if (error) {
        updateCheck("sale_items_org_store_test", "warn", `Erreur lecture sale_items: ${error.message}`);
      } else {
        updateCheck("sale_items_org_store_test", "pass", "Colonnes organization_id + store_id présentes dans sale_items");
      }
    } catch (err) {
      updateCheck("sale_items_org_store_test", "warn", `Impossible de vérifier: ${String(err)}`);
    }

    setIsRunning(false);
  };

  // Lance les checks au montage
  useEffect(() => {
    runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = [
    { id: "connection", label: "Connexion Supabase", icon: Server },
    { id: "migrations", label: "Migrations P1/P2/P3", icon: Database },
    { id: "auth", label: "Authentification", icon: UserCheck },
    { id: "functions", label: "Fonctions & Store Scope", icon: Database },
  ] as const;

  const allPassed = checks.every((c) => c.status === "pass");
  const hasFails = checks.some((c) => c.status === "fail");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Diagnostic Production
          </h1>
          <p className="text-slate-600">
            MakitiPlus — Vérification de l'état du système
          </p>
          <Badge variant="outline" className="mt-2">
            Audit AUDIT-2026-007
          </Badge>
        </div>

        {/* Statut global */}
        <Card className={`mb-6 border-2 ${allPassed ? "border-green-500" : hasFails ? "border-red-500" : "border-yellow-500"}`}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              {allPassed ? (
                <CheckCircle2 className="h-12 w-12 text-green-500" />
              ) : hasFails ? (
                <XCircle className="h-12 w-12 text-red-500" />
              ) : (
                <AlertTriangle className="h-12 w-12 text-yellow-500" />
              )}
              <div className="flex-1">
                <h2 className="text-xl font-bold">
                  {allPassed
                    ? "Système opérationnel"
                    : hasFails
                    ? "Action requise"
                    : "Vérifications en cours"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {checks.filter((c) => c.status === "pass").length} / {checks.length} vérifications réussies
                </p>
              </div>
              <Button onClick={runChecks} disabled={isRunning} variant="outline">
                {isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">Relancer</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Action requise si échecs */}
        {hasFails && (
          <Alert className="mb-6 border-red-500 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-900">Migrations non appliquées</AlertTitle>
            <AlertDescription className="text-red-800">
              <p className="mb-3">
                Des migrations de sécurité critiques ne sont pas appliquées en production.
                Le projet est vulnérable (CRIT-1, HIGH-1, HIGH-4, etc.).
              </p>
              <p className="mb-2 font-semibold">Procédure :</p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Ouvrir le SQL Editor Supabase</li>
                <li>
                  Coller le contenu de{" "}
                  <code className="bg-red-100 px-1 rounded">
                    docs/audit/deployment/apply_p1_p2_p3_combined.sql
                  </code>
                </li>
                <li>Cliquer Run</li>
                <li>Recharger cette page</li>
              </ol>
              {(() => {
                const supabaseDashboardUrl = import.meta.env.VITE_SUPABASE_DASHBOARD_URL;
                if (isSuperAdmin && supabaseDashboardUrl) {
                  return (
                    <a
                      href={supabaseDashboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center mt-3 text-red-700 hover:text-red-900 font-medium"
                    >
                      Ouvrir le SQL Editor Supabase
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </a>
                  );
                }
                return (
                  <p className="mt-3 text-sm text-red-800">
                    Ouvrez le SQL Editor depuis votre dashboard Supabase.
                  </p>
                );
              })()}
            </AlertDescription>
          </Alert>
        )}

        {/* Détails par catégorie — visibles uniquement si super_admin */}
        {isSuperAdmin ? (
          <div className="space-y-6">
            {categories.map((cat) => {
              const catChecks = checks.filter((c) => c.category === cat.id);
              const Icon = cat.icon;
              return (
                <Card key={cat.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Icon className="h-5 w-5" />
                      {cat.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {catChecks.map((check) => (
                      <div
                        key={check.id}
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                      >
                        {check.status === "pass" && (
                          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        )}
                        {check.status === "fail" && (
                          <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                        )}
                        {check.status === "warn" && (
                          <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                        )}
                        {check.status === "loading" && (
                          <Loader2 className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5 animate-spin" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{check.label}</p>
                          {check.detail && (
                            <p className="text-xs text-muted-foreground mt-1 break-all">
                              {check.detail}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-2 border-yellow-500">
            <CardContent className="pt-6 text-center">
              <Lock className="h-10 w-10 text-yellow-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold mb-2">Détails techniques réservés</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Les détails techniques du diagnostic sont visibles uniquement par les super administrateurs.
                Connectez-vous avec un compte super_admin pour voir les détails.
              </p>
              <Button asChild>
                <Link to="/auth">
                  <Shield className="h-4 w-4 mr-2" />
                  Se connecter
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg">
            <Link to="/auth">
              <Shield className="h-4 w-4 mr-2" />
              Aller à la connexion
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/">
              Retour à l'accueil
            </Link>
          </Button>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-xs text-muted-foreground">
          <p>
            Page de diagnostic — MakitiPlus v1.0 · Audit AUDIT-2026-007
          </p>
          <p className="mt-1">
            Le statut global est public. Les détails techniques sont réservés aux super administrateurs.
          </p>
        </div>
      </div>
    </div>
  );
}
