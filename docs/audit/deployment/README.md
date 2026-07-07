# Déploiement des patches P1+P2+P3 — Guide pas à pas

Ce dossier contient tout ce qu'il faut pour déployer les correctifs de sécurité en production quand `supabase db push` échoue (cas où la DB a déjà les tables mais que le CLI ne le sait pas).

## Fichiers

| Fichier | Rôle |
|---------|------|
| `apply_p1_p2_p3_combined.sql` | Script SQL unique combinant les 3 migrations P1+P2+P3, prêt à coller dans Supabase SQL Editor |
| `verify_deployment.sql` | Script de vérification à exécuter après déploiement pour confirmer que chaque patch est effectif |

## Pourquoi `supabase db push` a échoué

L'historique des migrations Supabase CLI est désynchronisé de la DB de production :

- La DB a déjà toutes les tables (76 migrations historiques ont été appliquées via Dashboard SQL Editor, pas via CLI)
- Le CLI pense que la DB est vide et essaie de rejouer toutes les migrations depuis `20260202072852`
- La 2e migration échoue car `customers` existe déjà (`relation "customers" already exists`)

**Conséquence** : les 3 nouvelles migrations `20260708*` n'ont pas été appliquées. CRIT-1 et les autres vulnérabilités ne sont **pas encore corrigés en production**.

## Procédure de déploiement

### Étape 1 — Appliquer les 3 migrations via SQL Editor

1. Va sur le SQL Editor de ton projet Supabase :
   https://supabase.com/dashboard/project/exxntkuursgwhxvehekr/sql/new

2. Ouvre le fichier `apply_p1_p2_p3_combined.sql` dans ton éditeur local, copie tout le contenu (787 lignes).

3. Colle-le dans le SQL Editor de Supabase.

4. Clique **Run** (Ctrl+Enter). Le script est idempotent — il peut être rejoué sans erreur.

5. Vérifie qu'il n'y a pas d'erreur dans l'onglet Output. Tu dois voir des `NOTICE` comme :
   - `Dropped register_user(TEXT, TEXT, TEXT, TEXT, UUID)`
   - `Dropped get_supplier_stats(UUID)`
   - `Created ENUM type app_activity_action`

### Étape 2 — Vérifier le déploiement

1. Dans le SQL Editor, ouvre un nouvel onglet.
2. Copie le contenu de `verify_deployment.sql` (96 lignes).
3. Colle-le et clique **Run**.
4. Vérifie chaque résultat attendu (documenté en commentaire dans le fichier).

### Étape 3 — Tester en production

Connecte-toi à l'app en production et teste ces scénarios :

| Test | Finding corrigé | Résultat attendu |
|------|-----------------|------------------|
| Inscription nouvel utilisateur + création org + appel `register_user(p_role='super_admin')` | CRIT-1 | Erreur « Un admin existe déjà sur la plateforme » |
| Appel `register_user(p_role='admin', p_organization_id=NULL)` | HIGH-1 | Erreur « Rôle non autorisé pour une auto-inscription sans organisation » |
| Détail d'un fournisseur dans l'UI | HIGH-2 | S'affiche correctement (pas d'erreur RPC) |
| INSERT manuel dans `stripe_events` en tant qu'utilisateur authentifié | HIGH-3 | Erreur 42501 (RLS refuse) |
| Création d'un backup depuis l'UI | HIGH-4 | Fonctionne (avant : `function is_org_admin() does not exist`) |
| Login puis logout | MED-1, LOW-4 | Logs insérés avec `action='login'` puis `action='logout'` typés en ENUM ; `last_logout_at` mis à jour via RPC |
| Envoi WhatsApp avec `customer_id` invalide | LOW-3 | Erreur 400 « customer_id invalide ou hors organisation » |
| Charts sur le dashboard | MED-7 | S'affichent correctement (variables CSS injectées sans `dangerouslySetInnerHTML`) |

### Étape 4 — Vérifier la branche Git

Vérifie que la branche que tu déploies contient bien les commits P1+P2+P3 :

```bash
git log --oneline -5
# Tu dois voir :
# eedd0fc fix(security): P3 patches for AUDIT-2026-007 (MED-1,2,6,7 + LOW-1 à 6)
# cdbd3d4 fix(security): P2 patches for AUDIT-2026-007 (HIGH-2, MED-3, MED-4, MED-5)
# cb6d73f fix(security): P1 patches for AUDIT-2026-007 (CRIT-1, HIGH-1, HIGH-3, HIGH-4)
```

Si tu ne les vois pas, merge depuis `origin/main` :

```bash
git fetch origin
git merge origin/main
# Ou si tu préfères rebase :
# git rebase origin/main
```

### Étape 5 — Redéployer le frontend sur Render

Si tu es sur une branche `hotfix/*` ou autre, merge-la dans `main` pour que Render déploie automatiquement :

```bash
git checkout main
git pull origin main
git merge hotfix/production-sql-safety-final
git push origin main
# Render déploie automatiquement sur push vers main
```

Ou force un rebuild dans Render Dashboard → Manual Deploy → Deploy latest commit.

## Résolution de problèmes

### Erreur « type app_activity_action already exists »

L'ENUM existe déjà (peut-être créé par un test précédent). Le script est idempotent via `DO $$ ... END $$` — il ne devrait pas échouer. Si ça arrive quand même, commente le bloc `CREATE TYPE` dans `apply_p1_p2_p3_combined.sql` et rerun.

### Erreur « column "action" cannot be cast automatically to app_activity_action »

La colonne `action` contient des valeurs non listées dans l'ENUM. Le script gère ça avec un `CASE WHEN ... ELSE NULL`. Si l'erreur persiste, vérifie les valeurs existantes :

```sql
SELECT DISTINCT action FROM public.user_activity_logs ORDER BY 1;
```

Et ajoute les valeurs manquantes à l'ENUM avant de re-run.

### Erreur « policy already exists »

Les politiques `profiles_select_own` etc. existent déjà. Le script utilise `DROP POLICY IF EXISTS` avant chaque `CREATE POLICY` — pas d'erreur attendue. Si ça arrive quand même, ajoute `DROP POLICY IF EXISTS "<name>" ON <table>;` avant le CREATE incriminé.

### `is_org_admin()` retourne une erreur « function does not exist » après déploiement

Vérifie que la fonction a bien été créée :

```sql
SELECT proname FROM pg_proc WHERE proname = 'is_org_admin';
```

Si 0 ligne, le bloc de création a échoué. Revoie la section HIGH-4 du script `apply_p1_p2_p3_combined.sql`.

## Référence

- Audit : AUDIT-2026-007
- Date audit : 7 juillet 2026
- Date déploiement : à documenter après exécution
- Migrations concernées : `20260708000000`, `20260708010000`, `20260708020000`
- Tests de non-régression : `src/test/p{1,2,3}SecurityFixes.test.ts` (107 tests au total)
