# Guide de dépannage production — MakitiPlus

**Objectif** : Résoudre rapidement les incidents courants en production.

---

## 🔍 Méthodologie de diagnostic

### 1. Identifier l'étendue
- **Un seul utilisateur** concerné ? → problème de compte/permissions
- **Plusieurs utilisateurs d'une org** ? → problème de données org
- **Tous les utilisateurs** ? → problème système (API, DB, déploiement)

### 2. Vérifier les indicateurs
1. **Console navigateur** (F12 → Console) → erreurs JavaScript ?
2. **Network** (F12 → Network) → requêtes en échec (4xx/5xx) ?
3. **Application** (F12 → Application → Service Workers) → SW actif ?
4. **Supabase Dashboard → Logs → Edge Functions** → erreurs serveur ?
5. **Sentry** (si configuré) → erreurs remontées ?

### 3. Isoler la cause
- **Frontend** (code React) → erreur dans la console
- **Backend** (Edge Function) → erreur dans Supabase logs
- **Base de données** (RLS, RPC) → erreur SQL dans Network
- **Réseau** (connectivité) → test sur différent réseau

---

## 🚨 Incidents critiques (bloquants)

### Login impossible ("rôle n'a pas pu être chargé")

**Cause** : L'utilisateur n'a pas d'entrée dans `user_roles` OU la policy RLS bloque la lecture.

**Diagnostic** :
```sql
-- Vérifier si l'utilisateur a un rôle
SELECT ur.user_id, ur.role, p.owner_name, p.organization_id
FROM public.user_roles ur
LEFT JOIN public.profiles p ON p.user_id = ur.user_id
WHERE ur.user_id = (SELECT id FROM auth.users WHERE email = 'EMAIL_CONCERNE');
```

**Fix** :
```sql
-- Si pas de rôle, en créer un
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'EMAIL_CONCERNE'
ON CONFLICT DO NOTHING;
```

Si le problème persiste → ré-exécuter la migration `20260715200000_CONSOLIDATED_ALL_FIXES.sql`.

---

### Vente impossible au POS

**Cause possible** : RLS bloque l'insertion de la vente, ou stock insuffisant.

**Diagnostic** :
1. Console → vérifier l'erreur exacte
2. Network → voir la requête `create_sale_with_limit` → statut + body

**Fix** :
- Si erreur "Limite de ventes atteinte" → l'org a dépassé son plan (Billing → changer le plan)
- Si erreur "RLS policy" → vérifier que le user a `organization_id` dans son profil
- Si erreur "Stock insuffisant" → ajuster le stock (Produits → Stock)

---

### Organisation invisible dans la liste

**Cause** : La policy RLS `stores_select_org_member` ne retourne pas l'org.

**Diagnostic** :
```sql
-- Vérifier si l'org existe
SELECT id, name, owner_user_id FROM public.organizations WHERE name ILIKE '%NOM_ORG%';

-- Vérifier si l'user est super_admin
SELECT public.is_super_admin();
```

**Fix** :
- Si l'org n'existe pas → la créer (page Magasins)
- Si l'org existe mais invisible → ré-exécuter la migration consolidée
- Si `is_super_admin()` retourne false → vérifier `user_roles` et `organizations.owner_user_id`

---

### Edge Function retourne 403 Forbidden

**Cause** : `requireAdminContext` échoue (user n'est ni admin ni super_admin).

**Diagnostic** :
1. Supabase Dashboard → Logs → Edge Functions → `admin-manage-user` ou `admin-create-user`
2. Vérifier le message d'erreur

**Fix** :
- Vérifier que l'utilisateur a un rôle dans `user_roles`
- Si admin → vérifier qu'il a `organization_id` dans son profil
- Si super_admin → vérifier `organizations.owner_user_id = auth.uid()` (ownership d'org)
- Redéployer les Edge Functions si `orgScope.ts` a été modifié

---

### PWA ne se met pas à jour

**Cause** : Ancien Service Worker en cache.

**Fix** :
1. Demander à l'utilisateur de faire un **hard refresh** : Ctrl+Shift+R (ou Cmd+Shift+R sur Mac)
2. Si ça ne suffit pas :
   - DevTools (F12) → Application → Service Workers → **Unregister**
   - Recharger la page
3. En dernier recours : vider le cache (DevTools → Application → Clear storage → Clear site data)

**Prévention** : Le PWA a `skipWaiting: true` + `clientsClaim: true` → les futures mises à jour s'activeront automatiquement.

---

## ⚠️ Incidents modérés (non bloquants)

### Conversion de devise ne fonctionne pas

**Symptôme** : Les prix restent dans la devise org malgré la sélection d'une autre devise.

**Cause** : API de taux de change indisponible ou cache corrompu.

**Fix** :
1. Vérifier la connectivité internet
2. Vider le localStorage : `localStorage.removeItem('makitiplus_exchange_rates_v1')`
3. Recharger la page (le hook re-fetch les taux)
4. Vérifier que `open.er-api.com` est accessible (CORS)

**Fallback gracieux** : si l'API est down, les prix s'affichent dans la devise org avec mention "(taux indisponible)".

---

### Rapport vide (aucune donnée)

**Cause** : Pas de ventes sur la période sélectionnée, ou RLS bloque la lecture.

**Diagnostic** :
1. Changer de période (Jour → Semaine → Mois)
2. Vérifier en super_admin (voit-il des données ?)
3. Si super_admin voit des données mais pas l'admin → problème RLS

**Fix** :
- Si pas de ventes → normal (nouvelle org)
- Si RLS bloque → ré-exécuter la migration consolidée

---

### Doublon de magasins (2 stores au lieu d'1)

**Cause** : Le trigger `on_organization_created` a créé un store automatique en plus du store explicite.

**Fix** :
```sql
-- Nettoyer les doublons
DELETE FROM public.stores s
USING public.organizations o
WHERE s.organization_id = o.id
  AND s.name = o.name
  AND EXISTS (
    SELECT 1 FROM public.stores s2
    WHERE s2.organization_id = s.organization_id
      AND s2.id != s.id
  );
```

**Prévention** : La migration consolidée désactive les 2 triggers pendant la création d'org.

---

### Mode hors-ligne ne synchronise pas

**Symptôme** : Ventes créées hors-ligne n'apparaissent pas après reconnexion.

**Diagnostic** :
1. Vérifier l'indicateur "Hors-ligne" disparaît après reconnexion
2. DevTools → Application → IndexedDB → vérifier les ventes en attente
3. Console → erreurs de sync ?

**Fix** :
1. Recharger la page (F5) — déclenche la sync
2. Si échec : DevTools → Application → IndexedDB → supprimer la DB locale → recharger
3. Vérifier que l'Edge Function `create_sale_with_limit` fonctionne

---

## 🔧 Outils de diagnostic

### Script SQL de diagnostic complet

```sql
-- État global du système
SELECT 
  (SELECT COUNT(*) FROM public.profiles) as total_profiles,
  (SELECT COUNT(*) FROM public.user_roles) as total_user_roles,
  (SELECT COUNT(*) FROM public.organizations) as total_orgs,
  (SELECT COUNT(*) FROM public.stores) as total_stores,
  (SELECT COUNT(*) FROM public.products) as total_products,
  (SELECT COUNT(*) FROM public.sales) as total_sales;

-- Users sans rôle (bug login)
SELECT p.user_id, p.owner_name, p.organization_id
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id
);

-- Orgs sans admin
SELECT o.id, o.name
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'admin'
  WHERE p.organization_id = o.id
);

-- Stores doublons
SELECT s.organization_id, o.name as org_name, s.name, COUNT(*) as cnt
FROM public.stores s
JOIN public.organizations o ON o.id = s.organization_id
GROUP BY s.organization_id, o.name, s.name
HAVING COUNT(*) > 1;

-- Abonnements expirés
SELECT s.organization_id, o.name, s.plan_id, s.status, s.current_period_end
FROM public.subscriptions s
JOIN public.organizations o ON o.id = s.organization_id
WHERE s.current_period_end < NOW()
  AND s.status = 'active';
```

### Vérification Edge Functions

```bash
# Tester une Edge Function manuellement
curl -X POST https://exxntkuursgwhxvehekr.supabase.co/functions/v1/admin-list-user-emails \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"userIds": []}'

# Réponse attendue : {"emails": {}}
# Si 403 → problème de permissions
# Si 500 → vérifier les logs Supabase
```

---

## 📞 Escalade

### Niveau 1 : Auto-résolution
- Ce guide couvre 90% des incidents courants
- Toujours commencer ici

### Niveau 2 : Support technique
- Si le diagnostic SQL ne suffit pas
- Contacter : [support technique à définir]
- Fournir : screenshot console + Supabase logs + description étapes pour reproduire

### Niveau 3 : Supabase Support
- Pour les problèmes de base de données (corruption, performance)
- Dashboard → Help → Contact Support
- Plan Pro recommandé pour support prioritaire

### Niveau 4 : Rollback
- Si rien ne fonctionne → rollback Render au commit précédent
- Render → Manual Deploy → Deploy a specific commit
- Puis restaurer le backup Supabase si data loss

---

## ✅ Checklist de diagnostic rapide

En cas d'incident, vérifier dans cet ordre :
1. [ ] Status Supabase (https://status.supabase.com)
2. [ ] Status Render (https://status.render.com)
3. [ ] Console navigateur (F12)
4. [ ] Supabase Dashboard → Logs → Edge Functions
5. [ ] Sentry (si configuré)
6. [ ] Dernier déploiement Render (Dashboard → Events)
7. [ ] Dernier backup Supabase (Database → Backups)
