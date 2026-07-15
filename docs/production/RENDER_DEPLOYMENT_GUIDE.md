# Guide de déploiement Render — MakitiPlus

**Objectif** : Déployer MakitiPlus sur Render (static site) en production.

---

## 📋 Prérequis

- Compte Render : https://render.com
- Repo GitHub : https://github.com/skaba89/makitiplus
- Projet Supabase : `exxntkuursgwhxvehekr`
- (Optionnel) Compte Stripe pour les paiements
- (Optionnel) Compte Sentry pour le monitoring

---

## 🚀 Déploiement initial

### 1. Créer un Static Site sur Render

1. Allez sur https://dashboard.render.com
2. **New +** → **Static Site**
3. Connectez votre repo GitHub : `skaba89/makitiplus`
4. Configuration :
   - **Name** : `makitiplus`
   - **Branch** : `main`
   - **Runtime** : `Static Site`
   - **Build Command** : `npm ci && rm -rf dist && npm run build`
   - **Publish Directory** : `dist`
5. Cliquez **Save**

### 2. Configurer les variables d'environnement

Dans Render → **Environment** → ajoutez chaque variable :

| Variable | Valeur | Obligatoire |
|----------|--------|-------------|
| `NODE_VERSION` | `20` | ✅ |
| `VITE_SUPABASE_URL` | `https://exxntkuursgwhxvehekr.supabase.co` | ✅ |
| `VITE_SUPABASE_PROJECT_ID` | `exxntkuursgwhxvehekr` | ✅ |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | (clé anon Supabase) | ✅ |
| `VITE_SUPABASE_DASHBOARD_URL` | `https://supabase.com/dashboard/project/exxntkuursgwhxvehekr` | Optionnel |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` ou `pk_test_...` | Optionnel |
| `VITE_SENTRY_DSN` | `https://...@sentry.io/...` | Optionnel |
| `VITE_SENTRY_ENVIRONMENT` | `production` | Optionnel |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | `0.1` | Optionnel |
| `VITE_SENTRY_REPLAY_SAMPLE_RATE` | `0.05` | Optionnel |
| `VITE_DEMO_MODE` | `false` | ✅ |
| `VITE_APP_VERSION` | `1.0.0` | Optionnel |

### 3. Déclencher le premier déploiement

- Render build automatiquement après sauvegarde
- Attendez ~3-5 minutes (build + déploiement)
- URL : `https://makitiplus.onrender.com` (ou personnalisée)

---

## 🔄 Déploiement automatique

Render redéploie automatiquement à chaque push sur `main`.

### Pour forcer un redéploiement
1. Render → votre Static Site → **Manual Deploy** → **Deploy latest commit**
2. Ou : `git commit --allow-empty -m "deploy: trigger rebuild" && git push`

---

## ⚡ Configuration SPA (cruciale)

Le fichier `render.yaml` ou les paramètres Render doivent inclure :

```yaml
routes:
  - type: rewrite
    source: /*
    destination: /index.html
```

**Sans cela**, les routes comme `/dashboard/pos` retourneront 404 au refresh.

### Vérification
1. Allez sur `https://makitiplus.onrender.com/dashboard/pos`
2. Rechargez la page (F5)
3. Doit afficher le POS, pas une erreur 404

---

## 📊 Monitoring post-déploiement

### Vérifications à faire après chaque déploiement

1. **Page d'accueil** : `https://makitiplus.onrender.com` → doit afficher le logo MakitiPlus
2. **Login** : tester avec un compte de test
3. **Dashboard** : vérifier que les données se chargent
4. **PWA** : vérifier que le Service Worker s'enregistre (DevTools → Application → Service Workers)
5. **Console** : aucune erreur JavaScript (F12 → Console)

### Logs Render
- Render → votre Static Site → **Events** → logs de build/déploiement
- Pour les logs runtime : pas de logs pour static site (logs navigateur uniquement)

### Sentry (si configuré)
- Vérifier les erreurs sur le dashboard Sentry
- Taux d'erreur cible : < 1% des sessions

---

## 🔧 Dépannage

### Build échoue sur Render
1. Vérifier que `npm run build` fonctionne en local
2. Vérifier les variables d'environnement (`VITE_SUPABASE_URL` obligatoire)
3. Vérifier la version Node.js (`NODE_VERSION=20`)

### Erreur 404 au refresh
→ Configurer les routes SPA (voir section ci-dessus)

### Erreur "Supabase client not initialized"
→ Vérifier `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` dans Render env vars

### PWA ne se met pas à jour
→ Le Service Worker `skipWaiting: true` est configuré. Faire un hard refresh (Ctrl+Shift+R)

### Lent au premier chargement
→ Normal : le PWA pré-cache 66 fichiers (~4 MB). Les chargements suivants sont instantanés.

---

## 🌐 Domaine personnalisé

1. Render → votre Static Site → **Settings** → **Custom Domains**
2. Ajoutez votre domaine (ex: `app.makitiplus.com`)
3. Configurez le DNS : CNAME vers `makitiplus.onrender.com`
4. SSL automatique via Render (Let's Encrypt)

---

## 📦 Rollback

### Rollback rapide
1. Render → **Manual Deploy** → **Deploy a specific commit**
2. Sélectionnez le commit précédent
3. Render rebuild avec cette version

### Rollback d'urgence (base de données)
- Les migrations SQL sont idempotentes → ré-exécuter l'ancienne migration est safe
- En cas de doute, contacter le support Supabase

---

## ✅ Checklist post-déploiement

- [ ] Build Render OK
- [ ] URL accessible (`https://makitiplus.onrender.com`)
- [ ] Login fonctionne
- [ ] Dashboard s'affiche
- [ ] POS accessible (pour admin/vendeur)
- [ ] POS NON accessible (pour super_admin)
- [ ] Conversion devise fonctionne (icône 💰)
- [ ] PWA installable sur mobile
- [ ] Mode hors-ligne fonctionne
- [ ] Sentry ne remonte pas d'erreurs (si configuré)
- [ ] Aucune erreur dans la console navigateur
