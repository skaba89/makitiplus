# MKP-025 — Scripts destructeurs et identifiants dans `supabase/migrations/`

- **Date** : 2026-11-03
- **Commit audité** : `0d10567` (main)
- **Criticité** : P0, risque de perte totale de données et accès non autorisé
- **État de validation** : corrigé dans le dépôt et prouvé sur une base PostgreSQL 16 jetable. **État de la production non vérifié** (aucun accès ; voir « Décisions attendues »).

## Problème

Tout fichier de `supabase/migrations/` est appliqué par `supabase db push`
(`scripts/push_migrations_remote.sh`) dès que l'historique distant
(`supabase_migrations.schema_migrations`) ne le connaît pas : nouveau projet,
restauration de sauvegarde, dérive d'historique, ou script lancé auparavant à la
main dans l'éditeur SQL (donc jamais enregistré).

Quatre fichiers de ce dossier n'étaient pas des évolutions de schéma, mais des
scripts ponctuels :

| Fichier | Effet | Risque |
|---|---|---|
| `20260713260000_clean_transactional_data.sql` | `DELETE` **sans WHERE** des ventes, lignes, crédits, clients, produits, stocks, fournisseurs, dépenses et commandes, pour **toutes** les organisations, sans aucune condition | Perte totale des données commerciales |
| `20260713100000_CLEANUP_RESET_PROJECT.sql` | Supprime tout sauf l'organisation d'un super admin nommé, y compris des lignes de `auth.users` | Perte totale (échoue seulement si le compte nommé est absent) |
| `20260713240000_create_test_users.sql` | Crée `vendeur@test.com`, `manager@test.com` et `comptable@test.com` avec des mots de passe en clair, rattachés à l'organisation du super admin | Comptes aux identifiants publics dans le dépôt |
| `20260713110000_RECOVERY_CREATE_ORG.sql` | Recrée l'organisation d'un compte nommé (adresse e-mail personnelle en dur) | Donnée personnelle, migration non rejouable |

Ces fichiers étaient **explicitement exclus** de `scripts/validate_sql_migrations.py`
et de `src/test/sqlSafety.test.ts` : aucun contrôle de la CI ne les voyait.

## Correction

1. Les 4 migrations deviennent un no-op documenté (`SELECT 1;`). **Le numéro de
   version est conservé**, ce qui garde l'historique distant cohérent : là où un
   fichier a déjà été appliqué, le changement n'a aucun effet.
2. Les scripts de maintenance sont déplacés dans `scripts/admin/*.sql.example`
   (exécution manuelle, après sauvegarde), avec l'adresse e-mail remplacée par
   `<SUPER_ADMIN_EMAIL>`. Le script des comptes de test n'est pas conservé : les
   comptes E2E proviennent des secrets CI.
3. Nouvelle garde bloquante `scripts/check_migration_safety.py`, qui analyse
   **tous** les fichiers de migration (pas seulement le diff) :
   `TRUNCATE`, `DELETE FROM` sans `WHERE`, écriture dans `auth.users`,
   `crypt('…')` littéral, adresse e-mail littérale. Les commentaires SQL sont
   ignorés. Une seule exception est justifiée : un motif `LIKE '%.test@malikiplus.local'`.
4. Branchée dans le job requis `build-and-test` (`ci.yml`) et dans Release Readiness.
5. Les exclusions des deux contrôles existants sont retirées.

## Preuves

| Vérification | Résultat |
|---|---|
| `python3 -m unittest scripts/test_migration_safety.py` (16 tests, dont tentatives de contournement par commentaire ou instruction suivante) | OK |
| `python3 scripts/check_migration_safety.py` sur `main` avant correction | 50 blocages, dans les 4 fichiers ci-dessus (+1 faux positif justifié) |
| idem après correction | 0 blocage, 160 fichiers |
| `validate_sql_migrations.py`, `check_undefined_functions.py`, garde MKP-007 | OK |
| `vitest run` | 128 fichiers / 3024 tests OK |
| PostgreSQL 16 jetable, 2 organisations synthétiques, 2 produits : ancien `clean_transactional_data.sql` (main) | **0 produit restant** |
| idem, nouveau fichier neutralisé | 2 produits restants |

## Limites

- Je n'ai pas pu vérifier si ces versions figurent dans l'historique de la
  production, ni si les comptes `@test.com` y existent.
- Les mots de passe restent dans l'historique git. S'ils ont été utilisés
  ailleurs, ils doivent être considérés comme compromis.
- Constat annexe, non traité ici : sur une base vierge,
  `00000_initial_schema.sql` + migrations donne **22 échecs sur 160** (doublons
  avec l'instantané initial, `cron`/`supabase_realtime`, `stripe_events`
  absent…). Le schéma n'est pas reconstructible de façon reproductible depuis le
  dépôt (chantier suivant proposé).

## Décisions attendues (propriétaire)

Requêtes **en lecture seule**, à lancer dans l'éditeur SQL de la production :

```sql
-- 1. Ces versions sont-elles enregistrées comme appliquées ?
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version IN ('20260713100000','20260713110000','20260713240000','20260713260000');

-- 2. Les comptes de test aux mots de passe publics existent-ils ?
SELECT u.email, u.created_at, u.last_sign_in_at, r.role
FROM auth.users u LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE u.email IN ('vendeur@test.com','manager@test.com','comptable@test.com');
```

- Si la requête 2 renvoie des lignes : décider de désactiver ou supprimer ces
  comptes, ou de changer leurs mots de passe (action en production, non réalisée
  par l'IA).
- Si la requête 1 ne renvoie rien alors que la production est en service : ne
  plus utiliser `supabase db push` avant la fusion de ce correctif.
