# Guide Super Admin — MakitiPlus

**À destination de** : Le super_admin (Ousmane Kaba) qui gère la plateforme SaaS
**Rôle** : Administrer toutes les organisations, magasins, abonnements et utilisateurs

---

## 🎯 Votre rôle

En tant que **super_admin**, vous gérez la **plateforme SaaS** dans son ensemble :

✅ **Ce que vous faites** :
- Créer des organisations (boutiques clientes)
- Créer les administrateurs de chaque organisation
- Gérer les abonnements (plans, durées, prolongations)
- Réinitialiser les mots de passe
- Surveiller l'activité via AdminAnalytics
- Voir toutes les organisations, magasins et utilisateurs

❌ **Ce que vous NE faites PAS** :
- Vendre au POS (réservé aux admins/managers/vendeurs)
- Gérer les clients (réservé aux vendeurs)
- Créer des produits ou des ventes (réservé aux admins d'org)

---

## 📋 Tâches quotidiennes

### 1. Vérifier l'activité globale
**Menu → Analyse Multi-Magasins** (AdminAnalytics)

Vérifiez :
- **KPIs globaux** (convertis en € pivot pour comparaison cross-org)
- **Tableau par magasin** : CA, panier moyen, dépenses, résultat net
- **Top articles** (les plus vendus) et **bad articles** (en rupture)
- **Mouvements de stock** (entrées/sorties)
- **Distribution des paiements** (espèces, Wave, Orange Money, etc.)

💡 Les montants sont convertis en **EUR** pour comparer les magasins de devises différentes (GNF, XOF, NGN, etc.).

### 2. Surveiller les nouvelles organisations
**Menu → Magasins**

- Vérifiez les organisations créées récemment
- Vérifiez que chaque org a un admin assigné (sinon, bouton "Admin")
- Vérifiez le plan d'abonnement de chaque org

---

## 📋 Tâches hebdomadaires

### 1. Gérer les abonnements
**Menu → Billing**

#### Changer le plan d'une organisation
1. Dans la section "Gestion manuelle des abonnements"
2. **Sélecteur d'organisation cible** → choisissez l'org
3. Vérifiez les détails (plan actuel, statut, expiration, magasins)
4. Cliquez **"Changer le plan"**
5. Sélectionnez :
   - **Plan** : Starter (gratuit) / Pilote National (7j) / Croissance (39,90€) / Enterprise (99,90€)
   - **Durée** : 1 mois / 3 mois / 6 mois / 1 an
   - **Référence paiement** (ex: MM-20260716-001)
   - **Motif** (ex: Paiement Mobile Money reçu)
6. Validez → le plan est mis à jour immédiatement

#### Prolonger un abonnement
1. Sélectionnez l'org
2. Bouton **"Prolonger"**
3. Choisissez la durée
4. Validez → la date d'expiration est repoussée

💡 Toutes les modifications sont **journalisées** dans l'audit log.

### 2. Vérifier les organisations sans admin
**Menu → Magasins**

- La carte "Magasins sans admin" affiche le count
- Pour chaque org sans admin, cliquez **"Admin"** pour en créer un
- Remplissez : nom + téléphone + email + mot de passe

---

## 📋 Tâches mensuelles

### 1. Audit de sécurité
**Menu → Utilisateurs → onglet Audit**

Vérifiez :
- Les **créations d'utilisateurs** (par qui, pour qui)
- Les **désactivations** (avec motif)
- Les **réinitialisations de mot de passe**
- Les **suppressions** (définitives)

⚠️ Si vous voyez des actions suspectes, investigatez immédiatement.

### 2. Nettoyage des comptes inactifs
**Menu → Utilisateurs**

- Triez par "Dernière connexion"
- Identifiez les comptes inactifs depuis 30+ jours
- Désactivez-les (avec motif "Inactivité prolongée")
- Ne supprimez pas (pour préserver l'historique)

---

## 🛠️ Opérations courantes

### Créer une nouvelle organisation + admin + magasin

**Menu → Magasins → "Nouvelle organisation"**

1. **Toggle** : "Nouvelle organisation" (pas "Magasin dans org existante")
2. **Nom de l'organisation** (ex: "KFM SARI")
3. **Nom du premier magasin** (ex: "KFM Shopping")
4. **Type de magasin** (épicerie, vêtements, etc.)
5. **Pays + Devise** (ex: Guinée + GNF)
6. **Section admin** (optionnelle mais recommandée) :
   - Nom complet
   - Téléphone
   - Email
   - Mot de passe (min 8 car., maj/min/chiffre/symbole)
7. Badge **"Rôle : Administrateur"** visible
8. Cliquez **"Créer org. + admin"**

✅ L'organisation, le magasin et l'admin sont créés en **une seule opération**.
✅ L'admin peut se connecter immédiatement.
✅ L'admin ne verra PAS le super_admin dans sa liste d'utilisateurs.

### Ajouter un magasin à une organisation existante

**Menu → Magasins → "Nouvelle organisation"**

1. **Toggle** : "Magasin dans org existante"
2. **Organisation cible** (dropdown)
3. **Nom du magasin**
4. **Ville** (optionnel)
5. **Type + Pays + Devise**
6. Cliquez **"Créer le magasin"**

### Réinitialiser un mot de passe

**Menu → Utilisateurs → icône clé** à côté d'un user

3 modes disponibles :

#### Mode Email (recommandé)
- Envoie un **lien à usage unique** à l'email de l'utilisateur
- Valide **1 heure**
- L'utilisateur définit lui-même son nouveau mot de passe
- Sécurisé : le super_admin ne connaît pas le mot de passe

#### Mode SMS
- Envoie un lien par **SMS** (nécessite Twilio configuré)
- Valide **30 minutes**
- Utile si l'utilisateur n'a pas accès à son email

#### Mode Manuel
- Le super_admin définit **directement** le nouveau mot de passe
- Doit être conforme : min 8 car., maj/min/chiffre/symbole
- ⚠️ Toutes les sessions de l'utilisateur sont **déconnectées**
- Le super_admin doit transmettre le mot de passe de manière sécurisée

### Supprimer une organisation

⚠️ **Action irréversible**

1. **Menu → Magasins** → icône corbeille à côté de l'org
2. Confirmez la suppression
3. L'org, tous ses magasins, et toutes ses données (ventes, produits, etc.) sont supprimés

💡 **Alternative recommandée** : désactivez l'org au lieu de la supprimer (contactez le support Supabase).

### Supprimer un magasin spécifique

1. **Menu → Magasins** → dans la liste des magasins sous l'org, cliquez la corbeille
2. Seul ce magasin est supprimé (l'org reste intacte)

---

## 🔐 Bonnes pratiques de sécurité

### 1. Comptes admin d'org
- Créez **un seul admin** par org (le gérant)
- L'admin créera lui-même ses vendeurs/managers
- Ne donnez JAMAIS les identifiants super_admin à un admin d'org

### 2. Mots de passe
- **Min 8 caractères** avec majuscule, minuscule, chiffre et symbole
- Ne réutilisez pas un mot de passe déjà utilisé
- Changez votre mot de passe super_admin tous les 90 jours
- Utilisez un gestionnaire de mots de passe (Bitwarden, 1Password)

### 3. Tokens et clés
- **Révoquez immédiatement** tout token GitHub/Supabase/Stripe compromis
- Ne partagez JAMAIS de tokens en clair (email, chat, commit)
- Utilisez des secrets GitHub Actions pour les CI/CD

### 4. Audit
- Consultez l'audit log **au moins une fois par semaine**
- Investiguez les actions inhabituelles (suppressions multiples, reset en chaîne)
- En cas de doute, désactivez le compte suspect

---

## 📊 Monitoring

### AdminAnalytics (quotidien)
- Vérifiez qu'aucun magasin n'a un CA anormalement bas (bug ?)
- Vérifiez les ruptures de stock (bad articles)
- Vérifiez les mouvements de stock inhabituels

### Sentry (si configuré)
- Vérifiez le taux d'erreur (< 1% cible)
- Investiguez les erreurs 500
- Surveillez les timeouts Edge Functions

### Supabase Dashboard
- **Logs → Edge Functions** : vérifiez les erreurs
- **Database → Reports** : vérifiez la taille de la DB
- **Authentication → Users** : vérifiez les comptes inactifs

---

## ❓ FAQ

### Un admin d'org ne peut pas se connecter, que faire ?
1. Vérifiez qu'il a un **profil** dans `public.profiles` (SQL Editor)
2. Vérifiez qu'il a un **rôle** dans `public.user_roles` (SQL Editor)
3. Si manquant, exécutez la migration `20260715200000` (elle crée les manquants)
4. Sinon, **réinitialisez son mot de passe** (page Utilisateurs → clé)

### Comment voir tous les utilisateurs de toutes les orgs ?
→ Connectez-vous en super_admin → Menu **Utilisateurs**. Vous voyez TOUS les users de TOUTES les orgs.

### Un admin d'org me voit dans sa liste ?
→ Non. Le super_admin est **invisible** aux admins d'org (policy RLS `profiles_select_scoped`).

### Je ne vois pas le POS, est-ce normal ?
→ Oui. Le super_admin **ne peut pas vendre** (retiré de `POS_ROLES`). Le POS est réservé aux admins/managers/vendeurs.

### Comment changer la devise d'une organisation ?
→ La devise est fixée à la création de l'org. Pour la changer, contactez le support Supabase (modification manuelle dans la DB).

### Un magasin a un doublon (2 stores au lieu d'1)
→ Exécutez la migration `20260715200000` (elle nettoie les doublons : `DELETE FROM stores WHERE name = organization.name AND EXISTS autre store`).

---

## 🆘 Procédure d'urgence

### Bug critique en production
1. **Évaluez la gravité** : bloquant (vente impossible) ou non-bloquant (cosmétique)
2. **Si bloquant** : rollback Render au commit précédent (Manual Deploy → specific commit)
3. **Si data loss** : contactez Supabase support + restaurez le backup quotidien
4. **Communiquez** : informez les admins d'org concernés

### Compte super_admin compromis
1. **Changez immédiatement** votre mot de passe
2. **Révoquez** tous les tokens (GitHub, Supabase, Stripe)
3. **Vérifiez** l'audit log pour détecter des actions malveillantes
4. **Désactivez** tout compte suspect créé récemment
5. **Régénérez** les clés Supabase (Dashboard → Settings → API → Rotate)

---

## ✅ Checklist mensuelle super_admin

- [ ] AdminAnalytics consulté (activité globale)
- [ ] Audit log vérifié (actions sensibles)
- [ ] Organisations sans admin traitées
- [ ] Abonnements expirés ou expirants vérifiés
- [ ] Comptes inactifs désactivés
- [ ] Sentry vérifié (taux d'erreur)
- [ ] Backup Supabase vérifié (daily backups)
- [ ] Mot de passe super_admin pivoté (tous les 90 jours)
- [ ] Tokens et clés audités (GitHub, Supabase, Stripe)
