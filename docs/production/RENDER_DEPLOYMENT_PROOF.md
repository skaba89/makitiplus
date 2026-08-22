# MakitiPlus — Preuve de déploiement Render — 2026-08-22

## Portée

Vérification demandée : le dernier SHA déployé sur Render (`https://makitiplus.onrender.com`) correspond-il au dernier commit `main` (`a86be2f`, après merge PR #76) ?

**Contrainte d'accès** : je n'ai ni accès au dashboard Render ni à son API dans cet environnement (déjà documenté dans `FINAL_PRODUCTION_PROOF_2026_08_15.md`, §2). Impossible d'obtenir le SHA déployé de façon directe et certaine. Ce qui suit est une vérification **indirecte mais réelle**, construite à partir de signaux effectivement observés — pas une simulation.

## Méthode et preuve

### 1. En-tête HTTP `last-modified`

```
curl -sI https://makitiplus.onrender.com/
```

Résultat : `last-modified: Fri, 14 Aug 2026 05:31:31 UTC` (= 2026-08-14 07:31:31 CEST).

### 2. Corrélation avec l'historique `main`

```
git log origin/main --format='%H %ci %s'
```

Le commit `main` immédiatement antérieur à cet horodatage est **`c57aedb`** (merge PR #72, `2026-08-11 19:42:35 +0200`), et le commit suivant sur `main` (**`0371c2fe`**, tête de PR #73) est postérieur (`2026-08-14 09:19:00 +0200`, soit ~1h48 après le `last-modified` observé). Aucun autre commit `main` ne tombe dans cette fenêtre.

**Conclusion directe** : le build actuellement servi par Render date d'avant PR #73, très probablement `c57aedb` exactement (dernier commit `main` avant un déploiement Render déclenché entre le 11 et le 14 août).

### 3. Tentative de confirmation par hash d'assets (résultat non concluant)

J'ai reconstruit `c57aedb` dans un worktree isolé (`npm ci && npm run build`) pour comparer le hash de `index-*.js` à celui servi en direct :

| Source | Fichier |
|---|---|
| Live (`makitiplus.onrender.com`) | `index-BDMLxVUh.js` |
| Build local de `c57aedb` | `index-CflO7_tk.js` |

Les hashes ne correspondent pas. **Ce n'est pas une infirmation** : le hash Vite dépend des valeurs exactes des variables d'environnement `VITE_*` injectées au build (`VITE_SUPABASE_URL`, `VITE_SENTRY_DSN`, etc.), qui diffèrent entre mon `.env` local et l'environnement Render réel — un build strictement identique au commit près produit un hash différent si une seule variable d'environnement change. Ce test ne peut donc ni confirmer ni infirmer le commit exact ; seul le signal `last-modified` (§1-2) fait foi ici.

## Résultat

⚠️ **Render n'est pas aligné avec `main`.** Le déploiement en production sert un build antérieur à PR #73, soit un retard d'au moins 4 PRs mergées :

| PR manquante en production | Contenu | Impact |
|---|---|---|
| #73 | Refactor `useCurrency` → `resolveCountry()` partagé | Cosmétique/dette technique, aucun risque utilisateur |
| **#74** | **Plafonnement de la remise en pourcentage à 100 %** | **Bug métier réel non corrigé en production** : sans ce fix, une remise saisie à 150 % n'est pas clampée côté UI (la contrainte DB `sales_discount_amount_nonneg` protège la base, mais l'expérience utilisateur en caisse reste bugguée) |
| #75 | Contraintes CHECK financières (migration DB) | **Sans impact** — les migrations SQL s'appliquent au niveau Supabase, indépendamment du déploiement frontend Render ; déjà confirmées live en §Supabase du rapport `FIELD_READINESS_AUDIT_2026_08_22.md` |
| #76 | Documentation uniquement | Aucun impact |

**Le point le plus important : PR #74 (fix du plafonnement de remise) n'est probablement pas actif en production.** C'est un vrai bug utilisateur, pas seulement un retard cosmétique.

## Action engagée

Le Release Readiness workflow a été redéclenché explicitement sur `main` (`a86be2f`) suite à cette demande : run [32600293746](https://github.com/skaba89/makitiplus/actions/runs/32600293746). **Cela ne redéploie pas Render** — Release Readiness est un pipeline de vérification CI (lint/build/tests/E2E), distinct et sans effet sur le service Render qui se redéploie soit via auto-deploy sur push (si configuré), soit manuellement depuis son dashboard.

## Action requise de votre côté

Aucune action automatique de ma part ne peut redéployer Render (pas d'accès dashboard/API dans cet environnement). Deux hypothèses à vérifier :
1. **Auto-deploy désactivé ou cassé** sur le service Render — à vérifier dans Settings → Build & Deploy.
2. **Auto-deploy actif mais des déploiements ont échoué silencieusement** depuis le 14/08 — à vérifier dans l'onglet Events/Deploys du dashboard Render.

Dans les deux cas : **déclencher un déploiement manuel maintenant** (`Manual Deploy → Deploy latest commit`) pour mettre en production le fix de remise (#74) et les 3 autres PRs en attente.

## Voir aussi
- [`FIELD_READINESS_AUDIT_2026_08_22.md`](./FIELD_READINESS_AUDIT_2026_08_22.md) — rapport complet.
- [`FINAL_PRODUCTION_PROOF_2026_08_15.md`](./FINAL_PRODUCTION_PROOF_2026_08_15.md) — cycle précédent, où ce même écart Render avait déjà été noté comme non vérifiable (§2), sans confirmation à l'époque.
