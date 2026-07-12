# MakitiPlus — Security Rotation Runbook

> Procédure de réponse à incident et de rotation des secrets applicables à
> l'environnement de production MakitiPlus. À exécuter en cas de compromission
> avérée ou suspectée d'un secret (token, clé API, clé de service).

| Champ              | Valeur                                                                |
| ------------------ | --------------------------------------------------------------------- |
| Document           | Security Rotation Runbook                                             |
| Propriétaire       | Équipe Ops / Sécurité MakitiPlus                                      |
| Audience           | Développeurs, SRE, support production                                 |
| Version            | 1.0                                                                   |
| Dernière révision  | 2026-07-12                                                            |
| Gravité par défaut | HIGH                                                                  |
| Statut             | Actif                                                                 |

---

## Contexte

Ce runbook décrit la procédure de rotation des secrets et clés après un
incident de sécurité (ex: token GitHub compromis
`ghp_xxx_REDACTED_xxx` identifié le 2026-07-12).

La compromission d'un secret peut permettre à un attaquant d'exécuter du code
dans nos pipelines CI, de pousser des commits malveillants, d'accéder aux
données Supabase, ou d'effectuer des opérations Stripe frauduleuses. La
procédure ci-dessous vise à contenir l'incident en moins de 2 heures.

### Principes directeurs

1. **Containment first** : révoquer avant d'analyser.
2. **Least privilege** : les nouveaux secrets ont un scope minimal.
3. **No plaintext** : aucun secret n'est jamais partagé en clair, même en DM.
4. **Audit trail** : chaque action est horodatée dans le journal d'incident.
5. **Verify, don't trust** : chaque rotation est suivie d'une vérification CI
   et E2E.

---

## 1. Révocation immédiate GitHub PAT

> **Priorité** : P0 — à exécuter dans les 15 minutes suivant la détection.

- URL : https://github.com/settings/tokens
- Action : révoquer **TOUTES** les Personal Access Tokens actives
- Vérifier les logs d'accès : https://github.com/settings/security-log
- Si commit suspect : `git log --all --author="Z User"` pour identifier les
  commits poussés avec le token compromis

### Commandes de diagnostic

```bash
# Lister tous les commits récents sur toutes les branches
git log --all --since="2026-07-10" --pretty=format:"%h %an %ae %ad %s" --date=iso

# Identifier les commits poussés par le token compromis
git log --all --author="Z User" --pretty=format:"%h %ad %s" --date=iso

# Vérifier les refs distantes potentiellement modifiées
git ls-remote --heads origin
git ls-remote --tags origin

# Auditer les déploiements récents déclenchés par GitHub Actions
gh run list --repo skaba89/makitiplus --limit 20
```

### Critères de révocation

| Critère                                    | Action            |
| ------------------------------------------ | ----------------- |
| Token utilisé dans les dernières 24h       | Révoquer + audit  |
| Token avec scope `repo` ou `admin:org`     | Révoquer immédiat |
| Token utilisé par GitHub Actions           | Révoquer + rotate |
| Token partagé en clair (chat, email, code) | Révoquer immédiat |

---

## 2. Régénération des secrets GitHub

- Créer un nouveau PAT avec scope minimal : `repo` (full control of private
  repos)
- Stocker dans GitHub Actions secrets : `GH_PAT` ( Settings → Secrets and
  variables → Actions )
- Ne **JAMAIS** committer le token dans le code
- Vérifier que `.gitignore` exclut `.env`, `.env.local`, etc.

### Procédure détaillée

1. Se rendre sur https://github.com/settings/tokens?type=beta (fine-grained
   tokens recommandés).
2. Créer un nouveau token avec :
   - **Resource owner** : `skaba89`
   - **Repository access** : `makitiplus` uniquement
   - **Permissions** :
     - Contents : Read and write
     - Metadata : Read-only (obligatoire)
     - Actions : Read-only
     - Workflows : Read and write (si CI modifie des workflows)
   - **Expiration** : 90 jours maximum
3. Copier immédiatement la valeur dans GitHub Actions secrets :
   - Repo `skaba89/makitiplus` → Settings → Secrets and variables → Actions
   - New repository secret → Name : `GH_PAT` → coller la valeur.
4. Vérifier que `.gitignore` contient au minimum :

   ```gitignore
   # Environment files
   .env
   .env.local
   .env.*.local
   .env.production
   .env.staging

   # Credentials & tokens
   *.pem
   *.key
   secrets/
   .secrets
   ```

5. Scanner l'historique git pour s'assurer qu'aucun secret n'a été committé :

   ```bash
   # Si gitleaks est installé
   gitleaks detect --source . --verbose

   # Sinon, recherche basique
   git log --all -p | grep -iE "ghp_|sk_live_|sk_test_|SUPABASE_SERVICE_ROLE"
   ```

   Si un secret est trouvé dans l'historique, utiliser `git filter-repo` ou
   contacter GitHub Support pour purger les références caches.

---

## 3. Rotation Supabase keys

- Dashboard Supabase → Settings → API
- **Anon/Publishable key** : peut être régénérée sans impact (utilisée côté
  client)
- **Service Role key** : CRITIQUE — utilisée côté serveur uniquement
  - Régénérer → mettre à jour Render environment variables
  - Vérifier les Edge Functions qui l'utilisent
- **JWT Secret** : rotation possible mais invalide toutes les sessions
  utilisateurs

### Tableau de rotation Supabase

| Clé                 | Criticité | Impact rotation                                  | Action requise                                  |
| ------------------- | --------- | ------------------------------------------------ | ----------------------------------------------- |
| Anon key            | Low       | Aucun (régénérée côté client via build)          | Update `VITE_SUPABASE_PUBLISHABLE_KEY` + rebuild |
| Service Role key    | CRITICAL  | Casse tous les appels serveur (Edge Functions)   | Update Render + redeploy                         |
| JWT Secret          | HIGH      | Invalide toutes les sessions utilisateur         | À n'utiliser qu'en cas de fuite JWT             |
| Database password   | HIGH      | Casse connexions Edge Functions + admin          | Update Render + Supabase connection pooler       |
| Storage API key     | Medium    | Casse uploads fichiers                           | Update Edge Functions env                        |

### Edge Functions à vérifier

Les Edge Functions suivantes utilisent `SUPABASE_SERVICE_ROLE_KEY` et doivent
être redéployées après rotation :

```text
supabase/functions/admin-export-users-csv/
supabase/functions/admin-create-user/
supabase/functions/admin-manage-user/
supabase/functions/admin-send-reset-link/
supabase/functions/admin-list-user-emails/
supabase/functions/redeem-reset-token/
supabase/functions/rotate-test-accounts/
supabase/functions/subscription-lifecycle/
supabase/functions/stripe-checkout/
supabase/functions/stripe-portal/
supabase/functions/stripe-webhook/
supabase/functions/send-whatsapp/
```

Commande de redéploiement :

```bash
./deploy-functions.sh
```

---

## 4. Rotation Stripe (si applicable)

- Dashboard Stripe → Developers → API keys
- Rotate the secret key (`sk_live_` ou `sk_test_`)
- Update `STRIPE_SECRET_KEY` dans Render + Edge Functions env
- Vérifier les webhooks : Dashboard Stripe → Developers → Webhooks
- Le publishable key (`pk_`) n'a pas besoin d'être roté (public)

### Procédure détaillée

1. Dashboard Stripe → Developers → API keys → **Roll secret key**.
2. Ne pas supprimer l'ancienne clé immédiatement : la garder en lecture seule
   le temps de la bascule (Stripe permet 2 clés secrètes actives).
3. Mettre à jour `STRIPE_SECRET_KEY` dans :
   - Render → Environment (service `makitiplus`)
   - Render → Environment (Edge Functions, si service séparé)
   - Variables Supabase Edge Functions (Vault ou dashboard)
4. Vérifier les signatures de webhook :
   - Dashboard Stripe → Developers → Webhooks
   - Récupérer le **Signing secret** (`whsec_...`)
   - Mettre à jour `STRIPE_WEBHOOK_SECRET` dans Render.
5. Tester un paiement de bout en bout (carte test `4242 4242 4242 4242`).
6. Une fois validé : supprimer l'ancienne clé secrète dans Stripe.

### Endpoints webhook à valider

| Endpoint                                | Événement attendu              |
| --------------------------------------- | ------------------------------ |
| `https://api.makitiplus.com/stripe-webhook` | `checkout.session.completed` |
| (idem)                                  | `customer.subscription.updated` |
| (idem)                                  | `invoice.payment_failed`       |

---

## 5. Mise à jour Render

- URL : https://dashboard.render.com
- Sélectionner le service `makitiplus`
- Environment → mettre à jour toutes les variables d'environnement impactées :
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (server-side)
  - `STRIPE_SECRET_KEY` (si applicable)
  - `VITE_SENTRY_DSN`
- Trigger un nouveau déploiement (Manual Deploy → **Clear build cache & deploy**)

### Variables d'environnement Render — checklist

| Variable                          | Source        | Côté     | À rotater si…                  |
| --------------------------------- | ------------- | -------- | ------------------------------ |
| `VITE_SUPABASE_URL`               | Supabase      | Client   | Migration de projet Supabase   |
| `VITE_SUPABASE_PUBLISHABLE_KEY`   | Supabase      | Client   | Rotation anon key              |
| `SUPABASE_SERVICE_ROLE_KEY`       | Supabase      | Serveur  | Rotation service role key      |
| `STRIPE_SECRET_KEY`               | Stripe        | Serveur  | Rotation clé Stripe            |
| `STRIPE_WEBHOOK_SECRET`           | Stripe        | Serveur  | Recréation endpoint webhook    |
| `VITE_SENTRY_DSN`                 | Sentry        | Client   | Changement de projet Sentry    |
| `SENTRY_AUTH_TOKEN`               | Sentry        | Serveur  | Rotation token Sentry          |
| `SUPABASE_DB_URL`                 | Supabase      | Serveur  | Rotation mot de passe DB       |

### Procédure de redéploiement

```text
1. Render Dashboard → makitiplus service → Environment
2. Éditer chaque variable impactée → Save Changes
3. Render propose automatiquement "Create a new deploy" → accepter
4. Si non proposé : Manual Deploy → "Clear build cache & deploy"
5. Surveiller les logs : Dashboard → Logs (filtrer sur ERROR/WARN)
6. Confirmer le statut "Live" + health check OK
```

---

## 6. Vérification CI

- Pousser un commit de test sur une branche
- Vérifier que le workflow CI passe : https://github.com/skaba89/makitiplus/actions
- Vérifier que `release-readiness.yml` passe (tous les jobs bloquants)
- Si un job échoue à cause des secrets : corriger dans GitHub Settings → Secrets

### Workflow de validation

```bash
# 1. Créer une branche de test
git checkout -b chore/security-rotation-verify

# 2. Commit vide pour déclencher CI
git commit --allow-empty -m "chore(security): verify CI after secret rotation"

# 3. Pousser
git push origin chore/security-rotation-verify

# 4. Surveiller le run
gh run watch --repo skaba89/makitiplus
```

### Jobs bloquants à valider

| Job                         | Workflow                  | Critère de succès              |
| --------------------------- | ------------------------- | ------------------------------ |
| Unit tests                  | `ci.yml`                  | 100% passants                  |
| Build                       | `ci.yml`                  | Statut `completed / success`   |
| E2E pilot                   | `release-readiness.yml`   | Tous les specs passent         |
| Security gates (P0/P1/P2)   | `release-readiness.yml`   | Aucune régression sécurité     |
| Lint & typecheck            | `ci.yml`                  | 0 erreur                       |

Si un job échoue à cause des secrets (erreur 401, "Bad credentials") :
- Vérifier le nom exact du secret dans Settings → Secrets.
- Vérifier que le workflow référence bien `${{ secrets.GH_PAT }}`.
- Re-déclencher le workflow après correction.

---

## 7. Journal d'incident

Créer `/home/z/my-project/makitiplus/docs/production/incidents/YYYY-MM-DD-incident.md`
avec :

```md
# Incident YYYY-MM-DD

## Résumé
- Type: compromission token GitHub
- Gravité: HIGH
- Détection: utilisateur a partagé le token en clair

## Chronologie
- HH:MM: détection
- HH:MM: révocation PAT
- HH:MM: nouveau PAT créé
- HH:MM: Render redeploy
- HH:MM: CI verte

## Impact
- Commits potentiels non autorisés: [liste]
- Données exposées: [analyse]

## Actions correctives
1. [x] PAT révoqué
2. [x] Nouveau PAT créé
3. [x] Render redeploy
4. [ ] Audit des commits poussés pendant la fenêtre d'exposition

## Leçons apprises
- Ne jamais partager un token en clair
- Utiliser `gh auth login` au lieu d'un PAT persistant
- Rotation automatique tous les 90 jours
```

### Conventions de nommage

- Format : `YYYY-MM-DD-incident.md` (ex : `2026-07-12-incident.md`).
- Si plusieurs incidents le même jour : suffixe `-01`, `-02` (ex :
  `2026-07-12-01-incident.md`).
- Le répertoire `incidents/` doit être créé s'il n'existe pas :

  ```bash
  mkdir -p /home/z/my-project/makitiplus/docs/production/incidents
  ```

---

## 8. Vérifications post-rotation

Checklist à valider **après** le redéploiement Render et le passage CI vert :

- [ ] Tous les services fonctionnent (login, POS, création produit, paiement)
- [ ] Pas d'erreur 401/403 dans les logs Render
- [ ] Sentry ne montre pas de pics d'erreurs
- [ ] CI passe sur une PR de test
- [ ] E2E pilot passe

### Tests manuels critiques

| Parcours                               | Commande / URL                          | Résultat attendu               |
| -------------------------------------- | --------------------------------------- | ------------------------------ |
| Login utilisateur                      | https://makitiplus.com/login            | Connexion OK, session valide   |
| Création produit                       | Dashboard → Produits → Nouveau          | Produit persisté en DB         |
| Encaissement POS                       | POS → Ajouter article → Paiement        | Vente enregistrée + reçu généré|
| Paiement Stripe (carte test)           | Checkout avec `4242 4242 4242 4242`     | Paiement réussi + webhook reçu |
| Webhook Stripe                         | Dashboard Stripe → Webhooks → Logs      | Statut `200 OK`                |
| Export CSV admin                       | Admin → Utilisateurs → Export CSV       | Téléchargement OK              |
| Reset password                         | Login → "Mot de passe oublié"           | Email envoyé                   |

### Surveillance des logs (24h post-rotation)

```bash
# Render logs en temps réel (si CLI installée)
render logs --service makitiplus --tail

# Sentry : vérifier l'absence de pic d'erreurs
# URL : https://sentry.io/organizations/<org>/projects/makitiplus/
```

Critères d'alerte :
- Toute erreur 401/403 sur les Edge Functions → investigation immédiate.
- Augmentation >20% du taux d'erreur Sentry vs baseline 7 jours.
- Échec webhook Stripe (statut != 2xx).

---

## 9. Prévention

- Rotation des secrets tous les 90 jours (calendar reminder)
- Audit trimestriel des accès GitHub (Settings → Personal access tokens)
- Formation équipe : ne jamais partager un secret en clair, même en DM
- Utiliser un gestionnaire de secrets (1Password, Bitwarden) pour le partage
- Activer 2FA sur tous les comptes (GitHub, Supabase, Stripe, Render)

### Calendrier de rotation recommandé

| Secret                  | Fréquence      | Déclencheur additionnel                |
| ----------------------- | -------------- | -------------------------------------- |
| GitHub PAT              | 90 jours       | Départ d'un membre de l'équipe         |
| Supabase Service Role   | 90 jours       | Suspicion de fuite                     |
| Stripe secret key       | 180 jours      | Changement de prestataire de paiement  |
| Sentry auth token       | 180 jours      | Rotation de l'équipe Ops               |
| Render deploy hooks     | Annuel         | Changement de stack                    |
| Mots de passe DB        | 90 jours       | Rotation automatique Supabase si activée |

### Bonnes pratiques additionnelles

- **Privilégier `gh auth login`** (OAuth device flow) plutôt qu'un PAT
  persistant pour les développements locaux.
- **Fine-grained tokens** GitHub : préférer les tokens fine-grained avec
  permissions par repository plutôt que les classic tokens avec scope global.
- **Rotation programmée** : configurer une alerte calendrier (Google Calendar
  / Notion) 7 jours avant l'expiration de chaque secret.
- **Audit d'accès** : vérifier trimestriellement la liste des tokens actifs
  dans GitHub, Supabase, Stripe, Render.
- **Séparation des privilèges** : utiliser des comptes de service distincts
  pour CI vs accès humains.

---

## 10. Contacts

| Contact             | Canal                                                  | Usage                              |
| ------------------- | ------------------------------------------------------ | ---------------------------------- |
| GitHub Security     | security@github.com                                    | Signaler un abus / purge de cache  |
| Supabase Support    | support@supabase.com                                   | Rotation JWT secret, assistance DB |
| Stripe Support      | https://support.stripe.com                             | Disputes, fraude, rotation clés    |
| Render Support      | support@render.com                                     | Problèmes déploiement, env vars    |
| Sentry Support      | support@sentry.io                                      | Suppression de données PII         |
| Équipe interne Ops  | Canal Slack `#makitiplus-ops` (ou équivalent)          | Coordination incident              |

### Réponse attendue des fournisseurs

- **GitHub** : 24-48h pour purge de cache git, 1h pour suspension de compte
  en cas de compromission confirmée.
- **Supabase** : 24-48h pour assistance rotation JWT.
- **Stripe** : chat en direct 24/7 pour comptes production, réponse <1h pour
  fraude avérée.
- **Render** : 24-48h, communauté Discord pour questions non urgentes.

---

## Annexe A — Résumé d'exécution (one-pager)

En cas d'incident, suivre ces étapes dans l'ordre, sans sauter d'étape :

1. **Révoquer** le GitHub PAT compromis → https://github.com/settings/tokens
2. **Créer** un nouveau PAT fine-grained → stocker dans `GH_PAT` (GitHub
   Secrets).
3. **Purger** l'historique git si un secret y a été committé (`gitleaks`).
4. **Rotater** Supabase Service Role key → mettre à jour Render.
5. **Rotater** Stripe secret key (si applicable) → mettre à jour Render +
   webhook signing secret.
6. **Redéployer** Render avec "Clear build cache & deploy".
7. **Redéployer** les Edge Functions Supabase (`./deploy-functions.sh`).
8. **Vérifier** CI sur une branche de test → `gh run watch`.
9. **Tester** les parcours critiques (login, POS, paiement).
10. **Documenter** dans `docs/production/incidents/YYYY-MM-DD-incident.md`.

**Objectif de temps total** : < 2 heures entre détection et CI verte.
