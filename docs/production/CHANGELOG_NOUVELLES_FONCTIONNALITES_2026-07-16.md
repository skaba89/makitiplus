# MakitiPlus — Changelog des nouvelles fonctionnalités

**Date** : 2026-07-16
**Version** : Post-consolidation (migration `20260715200000`)

Ce document référence toutes les nouvelles fonctionnalités ajoutées récemment et comment les utiliser.

---

## 1. Création d'organisation indépendante + admin + magasin

### Avant
- Le super_admin créait une organisation, puis devait séparément créer l'admin via le bouton "Admin"
- L'ancien RPC `create_first_organization` rattachait le magasin à l'org existante du super_admin (bug)

### Maintenant
- **Un seul formulaire** crée l'organisation + le premier magasin + l'administrateur en une opération
- Le RPC `super_admin_create_organization` crée une organisation **indépendante** (owner = super_admin, mais le profil du super_admin n'est pas modifié)
- Les deux triggers (`trigger_auto_create_store_settings` et `on_organization_created`) sont désactivés pendant la création → **1 seul magasin** par org (pas de doublon)

### Comment utiliser
1. Page **Magasins** → bouton **"Nouvelle organisation"**
2. Remplir : nom org + nom magasin + catégorie + pays + devise
3. Section admin (optionnelle) : nom + téléphone + email + mot de passe
4. Badge **"Rôle : Administrateur"** visible en lecture seule
5. Bouton **"Créer org. + admin"** (dynamique selon qu'un email est renseigné)

---

## 2. Séparation des rôles super_admin / admin

### Règles
| Rôle | Voit | Peut faire |
|------|------|------------|
| **super_admin** | Toutes les orgs, tous les magasins, tous les users, tous les rapports | Créer orgs, gérer abonnements, reset mots de passe, voir l'audit |
| **super_admin** | ❌ POS, ❌ Clients | **Ne peut pas vendre** (retiré de `POS_ROLES`) |
| **admin** | Sa propre org, ses magasins, ses users (sauf super_admin) | Gérer users, produits, ventes, rapports |
| **admin** | ❌ super_admin dans sa liste users | Le super_admin est invisible aux admins d'org |
| **manager/vendeur/comptable** | Leur org (sauf super_admin) | Selon leur rôle |

### Implémentation
- `POS_ROLES = ["admin", "manager", "vendeur"]` (super_admin retiré)
- Policy RLS `profiles_select_scoped` : `user_id = auth.uid()` en priorité absolue (login OK)
- Policy RLS `user_roles_select_scoped` : admins ne voient pas `role = 'super_admin'`
- Filtre frontend `Users.tsx` : defense-in-depth

---

## 3. Gestion des abonnements multi-organisations (super_admin)

### Fonctionnalité
Le super_admin peut gérer l'abonnement de **n'importe quelle organisation** depuis la page **Billing**.

### Comment utiliser
1. Page **Billing** → section "Gestion manuelle des abonnements (Super Admin)"
2. **Sélecteur d'organisation cible** en haut (dropdown avec toutes les orgs)
3. Chaque entrée affiche : nom + plan actuel + nombre de magasins
4. Détails de l'org sélectionnée : plan, statut, date d'expiration, liste des magasins
5. Bouton **"Changer le plan"** → choisir plan + durée + référence paiement + motif
6. Bouton **"Prolonger"** → garde le plan actuel, ajoute la durée

### Plans disponibles
- **Starter** — Gratuit
- **Pilote National** — Gratuit (7 jours)
- **Croissance** — 39,90 EUR/mois
- **Enterprise** — 99,90 EUR/mois

### Sécurité
- RPC `admin_update_organization_subscription` vérifie `is_super_admin()` côté serveur
- Toute modification est journalisée dans `user_audit_log`

---

## 4. Réinitialisation de mots de passe (super_admin)

### Fonctionnalité
Le super_admin peut réinitialiser le mot de passe de **n'importe quel utilisateur** (sauf autres super_admins).

### Comment utiliser
1. Page **Utilisateurs** → icône **clé** à côté d'un user
2. 3 modes disponibles :
   - **Email** — envoie un lien à usage unique (valide 1h)
   - **SMS** — envoie un lien par SMS (valide 30min, nécessite Twilio)
   - **Manuel** — définit un nouveau mot de passe directement
3. Pour le mode manuel : mot de passe conforme (min 8 car., maj/min/chiffre/symbole)
4. Toutes les sessions de l'utilisateur sont déconnectées après reset

### Sécurité
- Edge Function `admin-manage-user` vérifie `is_super_admin()` ou `has_role('admin')`
- Le super_admin peut modifier les admins d'org (mais pas les autres super_admins)
- Un admin simple ne peut modifier que les users de **sa propre org**
- Journalisation dans `user_audit_log` avec IP

---

## 5. Conversion automatique des devises au taux de change réel

### Fonctionnalité
Tous les prix peuvent être affichés dans la devise de votre choix, convertis au **taux de change réel** (mis à jour toutes les 24h).

### Source des taux
- API : `open.er-api.com` (gratuite, sans clé, CORS-enabled)
- Basée sur les données de la Banque Centrale Européenne
- Cache localStorage 24h pour éviter de surcharger l'API
- Fallback gracieux : si l'API est indisponible, affiche dans la devise source avec mention "(taux indisponible)"

### Pages avec conversion
| Page | Sélecteur | KPIs convertis |
|------|:-:|----------------|
| **Produits** | ✅ | Prix + marges |
| **Rapports** | ✅ | CA, panier moyen, dépenses, bénéfice, marge brute, remises, valeur stock, top produits |
| **Commandes** | ✅ | Valeurs totales, montants commandes, totaux formulaire |
| **Dépenses** | ✅ | Total dépenses mensuel, montant chaque dépense |
| **Dashboard** | ✅ | Ventes jour/mois, dépenses, bénéfice net, top ventes |
| **Clôture caisse** | ✅ | Ventes, dépenses, caisse attendue/réelle, écart |
| **Clients** | ✅ | Crédits en cours, total achats, crédit par client |
| **Fournisseurs** | ✅ | Valeur du stock fournisseur |
| **Activité vendeurs** | ✅ | CA total, CA par vendeur, panier moyen |
| **AdminAnalytics** | ℹ️ Auto | Tous les KPIs convertis vers **EUR pivot** pour comparaison cross-org |

### Comment utiliser
1. Cliquer sur le bouton **💰** (Coins) dans le header de la page
2. Une boîte de dialogue s'ouvre avec :
   - La devise org (référence, en lecture seule)
   - Un sélecteur pour choisir la devise d'affichage (28 devises africaines + EUR, USD, etc.)
   - Un indicateur de taux avec la source et la date de mise à jour
   - Un bouton "Rafraîchir" pour forcer le re-fetch
3. Une fois une devise différente sélectionnée :
   - Tous les prix s'affichent convertis au taux réel
   - Un badge "conv" apparaît sur le bouton
   - Le prix original s'affiche en infobulle : `33 FCFA (≈ 465 GNF)`

### Particularité AdminAnalytics
Le dashboard super_admin compare des magasins de devises différentes. Tous les montants sont convertis vers **EUR** comme devise pivot :
- KFM SARI (GNF) → montants convertis en €
- Diallo & Frères (GNF) → montants convertis en €
- Comparaison **apples-to-apples** désormais possible

### Pourquoi pas le POS ?
Le POS encaisse dans la **devise org**. Convertir les prix affichés créerait une confusion dangereuse entre le montant affiché et le montant réellement encaissé. Le POS reste donc en devise org uniquement.

---

## 6. Améliorations de sécurité

### Cacher le super_admin aux admins d'org
- Policies RLS durcies sur `user_roles`, `profiles`, `user_audit_log`
- Les admins ne voient pas les entrées `role = 'super_admin'`
- Defense-in-depth : filtre frontend supplémentaire dans `Users.tsx`

### `is_super_admin()` robuste
- Vérifie `user_roles` **ET** `organizations.owner_user_id`
- Tout propriétaire d'org est implicitement super_admin
- Plus besoin de synchroniser manuellement les rôles

### Edge Functions sécurisées
- `requireAdminContext` (orgScope.ts) : fallback sur ownership d'org si pas de rôle dans `user_roles`
- `admin-manage-user` : super_admin peut modifier les admins d'org (mais pas les autres super_admins)
- `admin-create-user` : `targetOrganizationId` explicite requis pour super_admin créant un admin

---

## 7. Responsive mobile

### Page Magasins
- Vue **cartes mobile** (au lieu du tableau écrasé)
- Dialogs adaptatifs (pleine largeur mobile, padding réduit)
- Boutons empilés en pleine largeur sur mobile
- Toggle "Org/Magasin" en grille 2 colonnes

### Toutes les pages
- Headers responsive (`flex-col sm:flex-row`)
- Boutons `w-full sm:w-auto` (pleine largeur mobile)
- Filtres catégorie avec scroll horizontal propre

---

## 8. PWA — Mise à jour immédiate

### Problème
Le Service Worker PWA (Workbox `autoUpdate`) attendait que tous les onglets soient fermés avant d'activer la nouvelle version. L'utilisateur voyait l'ancienne version cachée.

### Fix
- `skipWaiting: true` + `clientsClaim: true` dans la config Workbox
- Détection `updatefound` + `postMessage(SKIP_WAITING)` au nouveau SW
- Reload automatique après `controllerchange`
- Check de mise à jour toutes les 60 minutes

### Résultat
Les nouvelles versions s'activent **immédiatement** sans attendre la fermeture des onglets.

---

## Résumé technique

| Composant | Fichier(s) |
|-----------|------------|
| RPC `super_admin_create_organization` | `supabase/migrations/20260715200000_CONSOLIDATED_ALL_FIXES.sql` |
| `is_super_admin()` robuste | Idem |
| `has_role()` avec cast `app_role` | Idem |
| Policies RLS (stores, user_roles, profiles, audit_log) | Idem |
| `POS_ROLES` sans super_admin | `src/types/index.ts` |
| Sélecteur d'org (Billing) | `src/pages/Billing.tsx` |
| Reset mot de passe (fetch direct) | `src/pages/Users.tsx` |
| Hook `useExchangeRates` | `src/hooks/useExchangeRates.ts` |
| Hook `useDisplayCurrency` | `src/hooks/useDisplayCurrency.ts` |
| Composant `CurrencyDisplaySelector` | `src/components/ui/currency-display-selector.tsx` |
| Edge Function `orgScope.ts` (fallback ownership) | `supabase/functions/_shared/orgScope.ts` |
| Edge Function `admin-manage-user` (super_admin scope) | `supabase/functions/admin-manage-user/index.ts` |
| PWA `skipWaiting` | `vite.config.ts` + `src/lib/registerServiceWorker.ts` |
| Tests unitaires conversion | `src/test/currencyConversion.test.ts` (15 tests) |

**Tests** : 946/946 passent, 0 régression
**Build** : TypeScript OK, Vite OK
