# MakitiPlus — Runbook de Déploiement National

> Procédure opérationnelle de déploiement progressif de MakitiPlus, depuis
> l'état « pilote 1 magasin » jusqu'à un déploiement national multi-magasins.
> Ce runbook doit être suivi point par point, dans l'ordre. Toute déviation
> doit être documentée dans le journal d'incident correspondant.

| Champ              | Valeur                                                              |
| ------------------ | ------------------------------------------------------------------- |
| Document           | Runbook de Déploiement National                                     |
| Propriétaire       | Équipe Ops / Engineering MakitiPlus                                 |
| Audience           | Dev lead, Ops, Support N1/N2, On-call                               |
| Version            | 1.0                                                                 |
| Dernière révision  | 2026-07-12                                                          |
| Gravité par défaut | HIGH (toute erreur bloquante interrompt le déploiement)             |
| Statut             | Actif                                                               |

---

## Contexte

Ce runbook couvre le déploiement progressif de MakitiPlus d'un état « pilote
1 magasin » vers un déploiement national. Il doit être suivi point par point.

### Objectifs

1. Garantir que la plateforme reste disponible pendant la montée en charge.
2. Préserver l'intégrité des données de ventes, stocks et clients.
3. Détecter et corriger les régressions en moins d'une heure (P0/P1).
4. Permettre un rollback rapide (frontend et base de données) à tout moment.
5. Fournir un cadre clair d'escalade entre support terrain et engineering.

### Périmètre

- **Frontend** : application React/Vite déployée sur Render (SPA).
- **Base de données** : Supabase Postgres (Pro plan minimum).
- **Edge Functions** : Supabase Functions (Stripe, WhatsApp, admin, etc.).
- **Monitoring** : Sentry (frontend + performance).
- **CI/CD** : GitHub Actions (`release-readiness.yml`) + Render auto-deploy.

### Hors périmètre

- Déploiement des apps mobiles natives (Capacitor iOS/Android) — faire référence
  au runbook de release mobile quand il existera.
- Migration du plan Supabase (Pro → Team) — procédure distincte.

### Rôles et responsabilités

| Rôle               | Responsabilités clés                                                |
| ------------------ | ------------------------------------------------------------------- |
| Release Manager    | Valide la checklist §1, déclenche le déploiement, arbitre le go/no-go |
| Dev Lead           | Valide code & migrations SQL, exécute les migrations                 |
| Ops / On-call      | Monitoring Sentry/Render, exécution des rollbacks                   |
| Support N1         | Accompagnement terrain magasin, collecte des retours                 |
| Support N2         | Tri des bugs, escalade vers dev, contournements                     |

### Principes directeurs

1. **Aucun déploiement sans backup** : un backup Supabase manuel est obligatoire
   avant toute migration SQL (voir §2.1).
2. **Aucun déploiement le vendredi après 14h** : sauf urgence P0, planifier les
   mises en production du lundi au jeudi matin.
3. **Aucune migration sans validation** : les migrations SQL doivent passer le
   validateur `scripts/validate_sql_migrations.py` avant d'être appliquées.
4. **Communication obligatoire** : tout incident P0/P1 est signalé dans le
   canal Slack `#makitplus-incidents` dès la détection.
5. **Rollback par défaut** : en cas de doute après déploiement, rollback
   d'abord, investiguer ensuite.

---

## 1. Checklist pré-déploiement

> Cette section est **bloquante**. Aucune case ne doit rester non cochée avant
> de passer à la section 2.

### 1.1 Code & tests

Exécuter depuis la racine du dépôt, sur la branche à déployer :

```bash
git checkout <release-branch>
git pull --ff-only origin <release-branch>
npm ci
```

- [ ] Tous les tests unitaires passent (`npm test -- --run`)
- [ ] TypeScript sans erreur (`npm run typecheck`)
- [ ] ESLint sans erreur (`npm run lint`)
- [ ] Build production réussi (`npm run build`)
- [ ] SQL validator passe (`python3 scripts/validate_sql_migrations.py`)
- [ ] Undefined functions check passe (`python3 scripts/check_undefined_functions.py`)
- [ ] npm audit sans vulnérabilités high/critical (`npm audit --audit-level=high`)

**En cas d'échec** : documenter le symptôme, ne pas contourner. Si une
vulnérabilité `high` est un faux positif documenté, le noter dans
`docs/production/` avec justification et date.

### 1.2 E2E tests (bloquants)

Les tests E2E s'exécutent contre l'environnement de staging. Ils couvrent les
parcours utilisateurs critiques et ne doivent **pas** être skippés.

- [ ] `npm run e2e:pilot` passe — parcours critique du pilote (auth, POS, vente, reçu)
- [ ] `npm run e2e:seller-activity` passe — activité vendeur et reporting
- [ ] `npm run e2e:staging` passe — flux réel complet en staging
- [ ] `npm run e2e:sales-store-scope` passe — isolation des ventes par magasin

**En cas d'échec flaky** : autoriser jusqu'à 2 retries via
`--retries=2`. Si l'échec persiste au 3e essai, c'est bloquant.

### 1.3 CI/CD

- [ ] Workflow `release-readiness.yml` est vert sur la PR
- [ ] Tous les jobs bloquants passent (lint, typecheck, build, tests, SQL, audit, E2E)
- [ ] La PR a été relue et approuvée par au moins un autre développeur
- [ ] Aucun commit `WIP` ou `TODO` non traité sur la branche de release
- [ ] Le changelog (`docs/` ou release notes) est à jour

### 1.4 Secrets

Vérifier la présence et la validité des secrets dans GitHub Actions
(Settings → Secrets and variables → Actions) **et** dans Render
(Dashboard → makitiplus → Environment).

| Secret                         | Localisation            | Obligatoire | Usage                                  |
| ------------------------------ | ----------------------- | ----------- | -------------------------------------- |
| `VITE_SUPABASE_URL`            | Render + CI             | Oui         | Connexion au backend Supabase          |
| `VITE_SUPABASE_PUBLISHABLE_KEY`| Render + CI             | Oui         | Clé publique (anon) Supabase           |
| `E2E_BASE_URL`                 | CI uniquement           | Oui         | URL de base pour les tests E2E         |
| `E2E_TEST_EMAIL`               | CI uniquement           | Oui         | Compte vendeur de test                 |
| `E2E_TEST_PASSWORD`            | CI uniquement           | Oui         | Mot de passe vendeur de test           |
| `E2E_ADMIN_EMAIL`              | CI uniquement           | Oui         | Compte admin de test                   |
| `E2E_ADMIN_PASSWORD`           | CI uniquement           | Oui         | Mot de passe admin de test             |
| `E2E_MANAGER_EMAIL`            | CI uniquement           | Non         | Compte manager de test                 |
| `E2E_VENDOR_EMAIL`             | CI uniquement           | Non         | Compte vendeur additionnel             |
| `E2E_SUPER_ADMIN_EMAIL`        | CI uniquement           | Non         | Compte super admin de test             |

- [ ] `VITE_SUPABASE_URL` configuré
- [ ] `VITE_SUPABASE_PUBLISHABLE_KEY` configuré
- [ ] `E2E_BASE_URL` configuré
- [ ] `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` configurés
- [ ] `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` configurés
- [ ] (Optionnel) `E2E_MANAGER_EMAIL`, `E2E_VENDOR_EMAIL`, `E2E_SUPER_ADMIN_EMAIL`

**Vérification** : les secrets ne doivent jamais être committés. En cas de
doute, faire tourner `git log -p --all -S 'VITE_SUPABASE_URL' --source` et
appliquer la procédure de rotation (voir `SECURITY_ROTATION_RUNBOOK.md`).

---

## 2. Checklist migration SQL

> Les migrations sont appliquées **dans l'ordre** et **une par une**. Ne jamais
> exécuter plusieurs migrations en parallèle.

### 2.1 Pré-migration

- [ ] Sauvegarder la DB Supabase (Dashboard → Database → Backups → Create backup)
- [ ] Noter l'heure de début de migration (format ISO 8601, ex: `2026-07-12T14:30Z`)
- [ ] Prévenir les utilisateurs (matin, hors heures de pointe)
- [ ] Vérifier qu'aucun job cron Supabase ne tourne pendant la fenêtre
      (Dashboard → Database → Cron)
- [ ] Confirmer que le backup est au statut `Completed` avant de continuer

**Création du backup** :

1. Dashboard Supabase → `Database` → `Backups` → `Create backup`
2. Nommer le backup : `pre-migration-YYYY-MM-DD-HHMM`
   (ex: `pre-migration-2026-07-12-1430`)
3. Attendre le statut `Completed` (typiquement 1 à 5 minutes selon le volume).
4. Noter le `backup_id` retourné — il sera utilisé en cas de rollback (§5.2).

### 2.2 Migrations à appliquer (dans l'ordre)

| # | Fichier                                                                       | Description                                                                              |
| - | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1 | `20260712170000_add_description_expiry_isactive_to_products.sql`              | Ajoute les colonnes `description`, `expiry_date`, `is_active` à la table `products`      |
| 2 | `20260712190000_fix_payment_method_enum_cast.sql`                             | Corrige le cast `p_payment_method::public.payment_method` dans les RPC de vente         |
| 3 | `20260712195000_harden_sales_store_scope.sql`                                 | Ajoute `p_store_id` optionnel + fallback intelligent pour le scope des ventes           |

Chemin d'accès : `supabase/migrations/`.

> **Note** : la migration `20260712180000_CONSOLIDATED_all_critical_fixes.sql`
> regroupe plusieurs correctifs mais **ne doit pas être rejouée** si les
> migrations individuelles ci-dessus sont appliquées. Vérifier l'état avec
> `ZZ_validate_migration_status.sql` (§2.4) avant d'appliquer quoi que ce soit.

### 2.3 Procédure d'application

Pour chaque migration listée dans §2.2 :

1. Ouvrir Supabase SQL Editor (Dashboard → SQL Editor).
2. Copier-coller le contenu du fichier SQL (ne pas modifier le script).
3. Exécuter (bouton `Run`).
4. Vérifier qu'aucune erreur n'est retournée dans l'onglet `Output`.
5. Vérifier les `RAISE NOTICE` de confirmation (le script affiche `NOTICE: ✅ ...`).

**En cas d'erreur** :

- Ne **pas** relancer le script immédiatement.
- Copier le message d'erreur exact dans le journal de migration.
- Si l'erreur est `function already exists` ou `column already exists` : la
  migration est probablement déjà appliquée, valider via §2.4.
- Pour toute autre erreur : rollback (§5.2) puis investigation.

**Délai entre migrations** : attendre 30 secondes entre deux migrations pour
laisser le temps aux caches Postgres de se rafraîchir et permettre une
vérification visuelle.

### 2.4 Post-migration

- [ ] Exécuter `ZZ_validate_migration_status.sql` pour confirmer l'état
- [ ] Tester la création d'un produit (avec `description`, `expiry_date`, `is_active`)
- [ ] Tester une vente en cash (mode `payment_method = 'cash'`)
- [ ] Tester une vente en mobile money (mode `payment_method = 'mobile_money'`)
- [ ] Vérifier que les ventes ont un `store_id` non-NULL

```sql
-- Vérification rapide post-migration
SELECT
  COUNT(*) FILTER (WHERE store_id IS NULL) AS ventes_sans_store,
  COUNT(*) FILTER (WHERE store_id IS NOT NULL) AS ventes_avec_store,
  COUNT(*) AS total_ventes
FROM public.sales
WHERE created_at > NOW() - INTERVAL '10 minutes';
```

Le résultat attendu est `ventes_sans_store = 0`. Si ce n'est pas le cas,
ne **pas** déployer le frontend et investiguer immédiatement (la migration
`20260712195000_harden_sales_store_scope.sql` n'a pas pris effet).

---

## 3. Checklist Render

### 3.1 Variables d'environnement

Vérifier dans Render Dashboard → makitiplus service → Environment.

| Variable                              | Valeur pendant pilote | Valeur post-stabilisation | Notes                                  |
| ------------------------------------- | --------------------- | ------------------------- | -------------------------------------- |
| `VITE_SUPABASE_URL`                   | (URL prod Supabase)   | (inchangé)                | Identique à §1.4                       |
| `VITE_SUPABASE_PUBLISHABLE_KEY`       | (clé anon prod)       | (inchangé)                | Identique à §1.4                       |
| `VITE_SENTRY_DSN`                     | (DSN Sentry)          | (inchangé)                | Sentry project `makitiplus`            |
| `VITE_SENTRY_TRACES_SAMPLE_RATE`      | `0.5`                 | `0.1`                     | 50% des transactions pendant pilote   |
| `VITE_SENTRY_REPLAY_SAMPLE_RATE`      | `0.2`                 | `0.05`                    | 20% des sessions pendant pilote       |

- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_PUBLISHABLE_KEY`
- [ ] `VITE_SENTRY_DSN`
- [ ] `VITE_SENTRY_TRACES_SAMPLE_RATE=0.5` (pendant pilote)
- [ ] `VITE_SENTRY_REPLAY_SAMPLE_RATE=0.2` (pendant pilote)

> Toute modification d'une variable d'environnement déclenche automatiquement
> un rebuild sur Render. Planifier ces changements en dehors des heures de
> pointe.

### 3.2 Déploiement

- [ ] Manual Deploy → `Clear build cache & deploy` (préférable à un auto-deploy
      pour la première release nationale)
- [ ] Vérifier les logs de build (pas d'erreur) — Render Dashboard → Logs
- [ ] Vérifier que le build se termine par `==> Build successful`
- [ ] Vérifier que le site se charge (https://makitplus.onrender.com)
- [ ] Vérifier le statut HTTP 200 sur la racine (`curl -I https://makitplus.onrender.com`)
- [ ] Tester le login avec un compte de test

```bash
# Vérification rapide post-déploiement
curl -sI https://makitplus.onrender.com | head -5
# Attendre : HTTP/2 200
```

**En cas d'échec du build** :

- Ne **pas** retenter immédiatement.
- Lire les logs Render et identifier l'étape qui échoue
  (`install`, `build`, ou `deploy`).
- Si `install` échec : vérifier `package-lock.json` cohérent, relancer
  `npm ci` localement.
- Si `build` échec : reproduire en local avec `npm run build`, corriger,
  pousser un nouveau commit.

### 3.3 Post-déploiement

- [ ] Vérifier Sentry (pas de pic d'erreurs dans les 15 premières minutes)
- [ ] Vérifier les logs Render (pas d'erreur 500)
- [ ] Tester un parcours complet (login → POS → vente → reçu)
- [ ] Vérifier le service worker (PWA) — tester l'installation et le mode offline
- [ ] Vérifier que le diagnostic est opérationnel : `https://makitplus.onrender.com/diagnostic`
- [ ] Surveiller Sentry pendant 1h après le déploiement

**Critère d'abandon** : si > 5 erreurs nouvelles dans Sentry dans les 15
premières minutes, ou si > 1 erreur 500 confirmée, déclencher un rollback
(§5.1) et investiguer.

---

## 4. Monitoring pendant pilote

### 4.1 Sentry

- **Taux d'échantillonnage pendant pilote** :
  `VITE_SENTRY_TRACES_SAMPLE_RATE=0.5` (50% des transactions)
- **Taux de replay** :
  `VITE_SENTRY_REPLAY_SAMPLE_RATE=0.2` (20% des sessions)
- **Après stabilisation** (30 jours consécutifs sans incident P0/P1) :
  réduire à `0.1` et `0.05` pour limiter le volume et le coût.

**Dashboard Sentry à surveiller quotidiennement** :

- Erreurs par jour (30 derniers jours)
- Web Vitals : LCP, INP, CLS, TTFB
- Top 10 erreurs par fréquence
- Pages avec le plus d'erreurs
- Taux d'erreur JavaScript (% des sessions avec au moins une erreur)

### 4.2 Alertes

Les alertes sont configurées dans Sentry (Settings → Alerts) et relayées
vers Slack (`#makitplus-alerts`). Les seuils ci-dessous sont calibrés pour
la phase pilote et devront être ajustés après stabilisation.

| Type d'alerte                       | Seuil                          | Canal             | Criticité |
| ----------------------------------- | ------------------------------ | ----------------- | --------- |
| Erreurs 400 (bad request)           | > 10/heure                     | Slack             | Warning   |
| Erreurs 500 (server)                | > 1/heure                      | Slack + SMS       | Critique  |
| Latence API                         | > 2s sur 5 min                 | Slack             | Warning   |
| Taux d'erreur JavaScript            | > 1% des sessions              | Slack             | Warning   |
| Nouvelle erreur (regression)        | Première occurrence            | Slack + email     | Critique  |
| Crash de page (ErrorBoundary)       | Toute occurrence               | Slack + email     | Critique  |
| Volume d'erreurs                    | > 50/heure                     | Slack + SMS       | Critique  |

**Procédure de réponse à une alerte** :

1. Acquitter l'alerte dans Slack (réaction ou thread).
2. Ouvrir le ticket Sentry correspondant.
3. Évaluer la sévérité réelle (cf. §8.1).
4. Si P0/P1 : appliquer la procédure d'incident (§8.2).
5. Si P2/P3 : créer un ticket Jira/Linear et planifier le fix.

### 4.3 Métriques surveillées

Pendant la phase pilote, les métriques suivantes sont relevées chaque matin
dans le canal `#makitplus-pilot-daily` :

| Métrique                                | Source            | Fréquence | Seuil d'alerte             |
| --------------------------------------- | ----------------- | --------- | -------------------------- |
| Nombre de ventes par jour (par magasin) | Supabase          | Quotidien | Chute > 50% vs J-1         |
| Nombre d'erreurs de paiement            | Sentry + Supabase | Quotidien | > 5/jour                   |
| Latence moyenne des RPC Supabase        | Sentry            | Quotidien | > 1s p95                   |
| Taux de sync offline réussi             | Sentry            | Quotidien | < 95%                      |
| Nombre de sessions actives              | Sentry            | Quotidien | (baseline à établir)       |
| Uptime Render                           | Render status     | Temps réel| < 99.5% sur 24h            |
| Latence LCP                             | Sentry Web Vitals | Quotidien | > 4s p75                   |

**Health check quotidien automatisé** :

```bash
# À exécuter chaque matin pendant le pilote
bash scripts/health-check-post-deployment.sh
```

---

## 5. Procédure de rollback

> Le rollback doit être possible à tout moment. Si un rollback échoue, escalader
> immédiatement en P0 (§8.2).

### 5.1 Rollback frontend (Render)

Le rollback frontend est rapide (< 5 minutes) et sans perte de données.

1. Render Dashboard → makitiplus service → `Deploys`
2. Identifier le dernier déploiement stable (statut `Live`, date antérieure à
   l'incident, commits connus bons).
3. Cliquer `Roll back to this deploy` (icône rollback à côté du commit).
4. Confirmer dans la boîte de dialogue.
5. Attendre le statut `Live` sur le déploiement rollback (2 à 5 minutes).
6. Vérifier que le site fonctionne (login, POS, vente).
7. Documenter le rollback dans le journal d'incident correspondant.

**Après rollback** :

- Vérifier Sentry : le flux d'erreurs doit s'arrêter.
- Prévenir les utilisateurs si le rollback entraîne une perte de fonctionnalité.
- Ouvrir un ticket pour analyser la cause racine et planifier un nouveau
  déploiement corrigé.

### 5.2 Rollback SQL (Supabase)

> ATTENTION : le rollback SQL est risqué et ne doit être fait qu'en cas
> d'urgence. Il entraîne une perte de données entre le backup et l'instant
> du restore. À utiliser uniquement si une migration a corrompu des données
> ou rendu la base inutilisable.

1. Supabase Dashboard → `Database` → `Backups`
2. Sélectionner le backup pré-migration (nom : `pre-migration-YYYY-MM-DD-HHMM`,
   cf. §2.1).
3. Cliquer `Restore` → confirmer.
4. ATTENTION : toutes les données créées entre le backup et le restore seront
   PERDUES (ventes, stocks, nouveaux utilisateurs, etc.).
5. Prévenir les utilisateurs et documenter l'incident (§8.2).
6. Après restauration, re-exécuter les migrations qui étaient en cours si
   nécessaire (avec un nouveau backup préalable).

**Estimation du temps** : 10 à 30 minutes selon la taille de la base.
**Validation** : exécuter `ZZ_validate_migration_status.sql` après restore
pour confirmer l'état du schéma.

### 5.3 Rollback partiel (désactiver une feature)

Si une feature spécifique cause problème mais que le reste de l'application
fonctionne, un rollback complet peut être disproportionné.

Options, par ordre de préférence :

1. **Feature flag** dans le code (si disponible) : désactiver via variable
   d'environnement et redéployer.
2. **Revert du commit** + nouveau déploiement Render (voir §5.1).
3. **Désactivation côté DB** (pour features liées à des colonnes ou RPC) :
   par exemple `UPDATE products SET is_active = true WHERE is_active IS NULL`
   pour neutraliser une colonne problématique.

**Critère de choix** : privilégier toujours l'option la moins invasive et la
plus rapide. Un feature flag est préférable car réversible sans déploiement.

---

## 6. Sauvegarde Supabase

### 6.1 Sauvegardes automatiques

- **Supabase Pro plan** : sauvegardes quotidiennes automatiques (7 jours de
  rétention).
- **Point-in-time recovery (PITR)** : jusqu'à 7 jours en arrière, à la
  minute près.
- **Emplacement** : Dashboard → Database → Backups.

> Le plan gratuit Supabase ne fournit que des sauvegardes quotidiennes sans
  PITR. Le plan Pro est **obligatoire** pour la production nationale.

### 6.2 Sauvegardes manuelles (avant migration)

À réaliser **systématiquement** avant chaque migration SQL (cf. §2.1).

1. Dashboard → Database → Backups → `Create backup`
2. Nommer : `pre-migration-YYYY-MM-DD-HHMM`
3. Vérifier que le backup est au statut `Completed` (attendre si nécessaire).
4. Noter le `backup_id` pour usage ultérieur.

**Alternative CLI** (pour backup hors Dashboard) :

```bash
# Dump données uniquement (le schéma est versionné dans supabase/migrations)
supabase db dump --data-only > backup_$(date +%Y%m%d_%H%M).sql

# Dump complet (schéma + données)
supabase db dump > backup_full_$(date +%Y%m%d_%H%M).sql
```

### 6.3 Restauration

1. Dashboard → Database → Backups
2. Sélectionner le backup (identifier par nom ou horodatage).
3. `Restore` → confirmer.
4. Tester immédiatement après restauration (login, lecture ventes, écriture
   d'une vente test).

**Test de restauration mensuel** (recommandé) :

- Premier lundi du mois : tester une restauration en environnement de staging.
- Vérifier que les données sont complètes et cohérentes.
- Documenter le temps de restauration.
- Si > 30 minutes : envisager un plan Supabase supérieur (Team/Enterprise).

---

## 7. Plan support Niveau 1 / Niveau 2

### Niveau 1 (support terrain magasin)

**Périmètre** :

- Problèmes d'utilisation (comment créer un produit, encaisser une vente, etc.)
- Erreurs de saisie (prix erroné, mauvaise quantité)
- Problèmes de connexion réseau (mode offline, reprise de sync)
- Questions fonctionnelles générales

**Réponse attendue** : < 2h ouvrées (du lundi au samedi, 8h–18h GMT).

**Canal** : Slack `#makitplus-support`, email support N1, téléphone on-call.

**Outils** :

- Guide utilisateur MakitiPlus (PDF)
- FAQ interne `docs/manual/`
- Accès en lecture aux tickets support (`public.support_tickets`)

### Niveau 2 (support technique)

**Périmètre** :

- Erreurs 500/400 récurrentes
- Problèmes de sync offline ne reprenant pas
- Bugs fonctionnels confirmés
- Demandes d'extraction de données
- Problèmes de permissions / RLS

**Réponse attendue** : < 4h ouvrées (du lundi au vendredi, 9h–18h GMT).

**Canal** : Slack `#makitplus-support` (escalade depuis N1), tickets Jira.

### Escalade

| Origine      | Destination     | Canal                                       | Critères d'escalade                                     |
| ------------ | --------------- | ------------------------------------------- | ------------------------------------------------------- |
| N1 → N2      | Support N2      | Slack `#makitplus-support`                  | Bug confirmé, hors FAQ, après 2 tentatives N1            |
| N2 → Dev     | Développeur     | Slack `#makitplus-dev` + ticket             | Bug technique, screenshot + logs + reproduction requise |
| N2 → Ops     | On-call         | Slack `#makitplus-incidents` + SMS on-call  | Incident P0/P1 détecté                                  |
| Dev → Ops    | On-call         | Slack `#makitplus-incidents`                | Décision de rollback ou hotfix production               |

**Format d'escalade N2 → Dev** :

```
[Ticket #XXX] <titre court>
- Magasin : <nom + store_id>
- Utilisateur : <email>
- Étapes pour reproduire : 1) ... 2) ... 3) ...
- Comportement attendu : ...
- Comportement observé : ...
- Screenshot : <lien>
- Logs Sentry : <lien>
- Fréquence : <une fois / systématique / intermittente>
```

---

## 8. Procédure d'incident

### 8.1 Sévérités

| Sévérité | Définition                                                          | Délai d'intervention | Canal                         |
| -------- | ------------------------------------------------------------------- | -------------------- | ----------------------------- |
| P0       | Site inaccessible, données perdues, fuite de données                | Immédiat, 24/7       | Slack + SMS + téléphone       |
| P1       | Feature clé cassée (POS, paiement, authentification)                | < 1h                 | Slack + SMS                   |
| P2       | Bug non-bloquant (reporting, affichage, sync lente)                 | < 24h                | Slack                         |
| P3       | Cosmétique (UI/UX, typo, alignement)                                | < 7 jours            | Ticket                        |

**Règle d'attribution** : en cas de doute entre deux niveaux, choisir le plus
élevé. Une réévaluation est possible après diagnostic.

### 8.2 Workflow incident

1. **Détection** — Sentry alerte OU rapport utilisateur (support N1/N2).
2. **Création du ticket** — `docs/production/incidents/YYYY-MM-DD-PXX.md`
   (ex: `2026-07-12-P0.md` ou `2026-07-12-P1-002.md` si plusieurs le même jour).
3. **Communication utilisateur** — si P0/P1, poster dans `#makitplus-status` :
   « Nous avons détecté un problème, résolution en cours. Mise à jour dans
   30 minutes. »
4. **Diagnostic** — consolider les logs depuis :
   - Render Dashboard → Logs
   - Sentry → événements récents
   - Supabase Dashboard → Logs (Database, Auth, Functions)
5. **Fix** — créer une branche `hotfix/<ticket>` → PR → review accélérée
   (1 approbation suffit en P0/P1) → déploiement via §3.2.
6. **Post-mortem** — à ajouter au ticket incident dans les 72h :
   - Timeline détaillée (détection, diagnostic, fix, résolution)
   - Impact (nombre d'utilisateurs/magasins affectés, durée d'indisponibilité)
   - Cause racine
   - Actions correctives (court terme + long terme)
   - Leçons apprises
7. **Prévention** — action corrective pour éviter la récurrence, assignée à un
   owner avec une deadline.

**Template de ticket incident** (`docs/production/incidents/YYYY-MM-DD-PXX.md`) :

```markdown
# Incident PXX — YYYY-MM-DD

## Résumé
<1-2 phrases>

## Timeline
- HH:MM — Détection
- HH:MM — Diagnostic
- HH:MM — Fix appliqué
- HH:MM — Résolution confirmée

## Impact
- Magasins affectés : N
- Utilisateurs affectés : N
- Durée d'indisponibilité : HH:MM

## Cause racine
<description technique>

## Fix
- PR #XXX
- Migration SQL : <oui/non + fichier>

## Actions correctives
- [ ] Court terme : ...
- [ ] Long terme : ...
```

---

## 9. Procédure de désactivation magasin/organisation

> Ces opérations sont **sensibles**. Toute exécution doit être tracée dans un
> ticket Jira et confirmée par le Dev Lead ou l'Ops Lead.

### 9.1 Désactivation d'un magasin (sans suppression)

```sql
UPDATE public.stores
SET is_active = false, updated_at = NOW()
WHERE id = '<store_id>';
```

**Effets** :

- Le magasin n'apparaît plus dans l'UI (listes, switcher, rapports).
- Les ventes historiques sont conservées et restent visibles dans les rapports
  agrégés (avec `store_id` non-NULL).
- Les comptes utilisateurs rattachés au magasin ne peuvent plus accéder aux
  fonctionnalités de ce magasin.

**Réversible** :

```sql
UPDATE public.stores
SET is_active = true, updated_at = NOW()
WHERE id = '<store_id>';
```

**Vérification post-désactivation** :

```sql
SELECT id, name, is_active, updated_at
FROM public.stores
WHERE id = '<store_id>';
```

### 9.2 Suspension d'une organisation (non-paiement)

```sql
UPDATE public.subscriptions
SET status = 'past_due', updated_at = NOW()
WHERE organization_id = '<org_id>';
```

**Effets** :

- L'organisation ne peut plus créer de ventes (`check_plan_limit` retournera
  `false` côté RPC).
- Les utilisateurs peuvent toujours se connecter et consulter leurs données
  historiques (lecture seule fonctionnelle).
- Le tableau de bord affiche une bannière de facturation en retard.

**Réversible après paiement** :

```sql
UPDATE public.subscriptions
SET status = 'active', updated_at = NOW()
WHERE organization_id = '<org_id>';
```

> Pour une suspension automatique via Stripe, préférer le webhook
> `stripe-webhook` (Edge Function) qui met à jour `subscriptions.status` à
> partir de l'événement `invoice.payment_failed`. La commande SQL ci-dessus
> est un fallback manuel.

### 9.3 Suppression d'une organisation (destructif, irréversible)

> À utiliser en dernier recours (RGPD, demande client explicite et documentée).

```sql
SELECT public.delete_organization('<org_id>');
```

**Effets** :

- **Cascade** : suppression de `stores`, `products`, `sales`, `sale_items`,
  `customers`, `suppliers`, `purchase_orders`, et toutes tables liées.
- Les utilisateurs `auth.users` sont **conservés** (mais sans organisation
  rattachée ; ils devront recréer ou rejoindre une organisation).
- Les fichiers Storage (images produits, logos) sont à nettoyer manuellement
  via l'API Storage ou le Dashboard.

**Prérequis obligatoires avant exécution** :

- [ ] Sauvegarde manuelle complète (§6.2) nommée `pre-org-delete-<org_id>-YYYY-MM-DD-HHMM`
- [ ] Demande client écrite archivée (email ou document signé)
- [ ] Validation Dev Lead + Ops Lead
- [ ] Notification envoyée à tous les utilisateurs de l'organisation (>= 7 jours avant)
- [ ] Extraction des données demandée par le client (CSV/JSON) si applicable

**Vérification post-suppression** :

```sql
SELECT COUNT(*) AS orgs_restantes
FROM public.organizations
WHERE id = '<org_id>';
-- Attendu : 0
```

**Journal** : créer une entrée dans `docs/production/incidents/` même si ce
n'est pas un incident technique, pour tracer la demande et la suppression.

---

## 10. Contact escalade

> Compléter les champs `[à compléter]` avant la première mise en production
> nationale. En cas d'indisponibilité du contact principal, contacter le
> remplaçant indiqué dans le tableau on-call de la semaine.

| Rôle               | Contact                        | Disponibilité          | Notes                                 |
| ------------------ | ------------------------------ | ---------------------- | ------------------------------------- |
| Dev lead           | [à compléter]                  | 9h–18h GMT (lun–ven)   | Escalade technique P0/P1              |
| Ops / On-call      | [à compléter]                  | 24/7 on-call           | Rollback, déploiement, monitoring     |
| Support N2 lead    | [à compléter]                  | 9h–18h GMT (lun–sam)   | Tri bugs, escalade dev                |
| Product owner      | [à compléter]                  | 9h–18h GMT (lun–ven)   | Décisions produit, communication user |
| Supabase support   | support@supabase.com           | Email (24–48h)         | Plan Pro ; incident via Dashboard     |
| Render support     | support@render.com             | Email                  | Incident via Dashboard Render         |
| Sentry support     | support@sentry.io              | Email                  | Plan Team requis pour support priorisé |
| Stripe support     | https://support.stripe.com     | Chat / email           | Pour incidents paiement               |

**Canaux Slack internes** :

| Canal                       | Usage                                                  |
| --------------------------- | ------------------------------------------------------ |
| `#makitplus-support`        | Support N1/N2, escalade utilisateurs                   |
| `#makitplus-dev`            | Discussion dev, escalade technique                     |
| `#makitplus-incidents`      | Incidents P0/P1, coordination rollback                 |
| `#makitplus-alerts`         | Alertes Sentry automatisées (lecture seule)            |
| `#makitplus-status`         | Communication de statut aux utilisateurs finaux        |
| `#makitplus-pilot-daily`    | Métriques quotidiennes pendant le pilote               |

---

## Annexe A — Commandes de référence

```bash
# Tests et build locaux
npm test -- --run
npm run typecheck
npm run lint
npm run build

# Validation SQL et fonctions
python3 scripts/validate_sql_migrations.py
python3 scripts/check_undefined_functions.py

# Audit sécurité
npm audit --audit-level=high

# Tests E2E
npm run e2e:pilot
npm run e2e:seller-activity
npm run e2e:staging
npm run e2e:sales-store-scope

# Health check post-déploiement
bash scripts/health-check-post-deployment.sh

# Sauvegarde DB manuelle
supabase db dump --data-only > backup_$(date +%Y%m%d_%H%M).sql
```

## Annexe B — Vérification rapide post-déploiement

```bash
# 1. Site accessible
curl -sI https://makitplus.onrender.com | head -3

# 2. Health check automatisé
bash scripts/health-check-post-deployment.sh

# 3. Diagnostic UI
# Ouvrir https://makitplus.onrender.com/diagnostic

# 4. Parcours manuel minimal
# - Login admin → Dashboard
# - POS → ajouter produit au panier → encaisser cash → reçu
# - Vérifier que la vente apparaît dans Reports
```

## Annexe C — Historique des révisions

| Version | Date       | Auteur           | Changements                              |
| ------- | ---------- | ---------------- | ---------------------------------------- |
| 1.0     | 2026-07-12 | Équipe MakitiPlus| Création initiale du runbook national    |

---

**Fin du runbook.** Pour toute question sur l'application de ce document,
contacter le Dev Lead ou l'Ops Lead (cf. §10).
