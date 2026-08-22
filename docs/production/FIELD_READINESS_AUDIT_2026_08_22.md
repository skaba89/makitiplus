# MakitiPlus — Audit field readiness — 2026-08-22

## Portée et méthode

Audit demandé sur `audit/field-readiness-no-regression`, visant le passage vers une commercialisation contrôlée multi-magasins. Toutes les vérifications ci-dessous sont réelles (CI déclenchée et observée, requêtes SQL en lecture seule, commandes locales effectivement exécutées) — aucune simulation. RULE 1 (protection Diallo & Frères) respectée intégralement sur tout le cycle.

## RULE 1 — Diallo & Frères

Aucune vente factice, clôture factice, import test, suppression, reset, cleanup ou backfill exécuté. Aucune écriture d'aucune sorte sur les données de ce magasin pendant cet audit — uniquement les vérifications système génériques (RLS, contraintes, RPC) qui ne touchent aucune ligne de données métier.

---

## P0 — Preuve production

### 1. Render — écart détecté

**⚠️ Render n'est pas aligné avec `main`.** Détail complet dans [`RENDER_DEPLOYMENT_PROOF.md`](./RENDER_DEPLOYMENT_PROOF.md).

En résumé : l'en-tête `last-modified` du site en production (`Fri, 14 Aug 2026 05:31:31 UTC`) place le build actuellement servi **avant** PR #73, soit un retard d'au moins 4 PRs mergées depuis. Le point le plus important : **PR #74 (plafonnement de la remise à 100 %) n'est probablement pas actif en production** — un vrai bug utilisateur, pas seulement un retard cosmétique. PR #75 (contraintes DB) n'est pas concernée (les migrations Supabase sont indépendantes du déploiement frontend Render et déjà confirmées actives, voir §3). Action manuelle de déploiement requise de votre côté — je n'ai pas accès au dashboard/API Render.

### 2. Release Readiness — re-déclenché sur le commit actuel

- **Run** : [32600293746](https://github.com/skaba89/makitiplus/actions/runs/32600293746)
- **Commit** : `a86be2f` (HEAD de `main`, après merge PR #76)
- **Résultat** : `success`, 9/9 jobs verts (code-quality, sql-validation, security-audit, E2E Pilot/Staging/Sales Store Scope/Seller Activity, E2E Cash Closing, summary).

### 3. Supabase live (lecture seule) — re-vérifié aujourd'hui

| Vérification | Résultat |
|---|---|
| Contraintes CHECK financières (14) | ✅ toutes présentes, identiques au cycle précédent |
| `cash_register_sessions` RLS enabled + forced | ✅ `true`/`true` |
| Une seule policy sur `cash_register_sessions`, SELECT uniquement | ✅ `cash_sessions_select_own_vendeur` — aucun INSERT/UPDATE/DELETE direct possible pour `authenticated` |
| `sales.payment_reference` | ✅ colonne `text`, nullable |
| `get_cash_closing_operators` | ✅ existe, 1 argument (`p_organization_id uuid`) |
| `is_user_super_admin` | ✅ existe, 1 argument |

Aucune dérive détectée par rapport au cycle du 15/08.

## P0 — Tests métier sur E2E_TEST_ORG

**Contrainte inchangée** : aucun identifiant `E2E_TEST_ORG`/`E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` disponible dans cet environnement local (secrets GitHub Actions uniquement). Preuve apportée via CI + vérifications directes, identique en substance au cycle précédent, ré-exécutée sur le commit actuel :

| Scénario | Preuve |
|---|---|
| Vente cash | `E2E Sales Store Scope` (CI, run 32600293746) — ✅ vert |
| Vente crédit `amount_paid = 0` | Contrainte `sales_amount_paid_nonneg` re-vérifiée en direct (accepte 0) + logique `POSPaymentDialog.tsx` inchangée |
| Remise 100 % → `total_amount = 0` | Test unitaire dédié (`businessAuditFollowup.test.tsx`), toujours vert dans la suite complète (2865/2866 passés aujourd'hui) |
| Remise 150 % → clamp à 100 | Même test — **mais voir §Render : ce clamp n'est probablement pas déployé en production actuellement**, bien qu'il soit vert en CI/local |
| Mobile Money avec référence | Tests unitaires (`mobileMoneyPaymentReference.test.ts`) + colonne/RPC confirmés en direct |
| Clôture caisse | `E2E Cash Closing` (CI) — ✅ vert |
| Export PDF clôture | Test unitaire avec génération PDF réelle (`cashClosingPdfExport.test.ts`) |
| Dépense positive | Contrainte `expenses_amount_positive` re-vérifiée en direct |
| Dépense négative rejetée | Contrainte présente et vérifiée (test en transaction déjà effectué le 15/08, non répété aujourd'hui — même mécanisme, aucune migration modifiant cette contrainte depuis) |
| `sale_items` quantité 0 rejetée | Contrainte `sale_items_quantity_positive` présente et vérifiée en direct |

**Recommandation inchangée** : une preuve E2E stricte (clic réel UI sur `E2E_TEST_ORG`) nécessite un environnement avec les secrets CI.

## Validation finale — exécutée localement

| Commande | Résultat |
|---|---|
| `npm ci` | ✅ (déjà à jour) |
| `npm run lint` (scope repo entier) | 80 problèmes, tous pré-existants et hors périmètre CI (mocks de tests, `stripeApi.ts`, `tailwind.config.ts`) — identique aux cycles précédents |
| Lint scope CI (`eslint src/ --ignore-pattern 'src/test/**' --max-warnings 10`) | ✅ 9 warnings `react-hooks/exhaustive-deps` pré-existants, sous le budget de 10 |
| `npm run typecheck` | ✅ 0 erreur |
| `npm run build` | ✅ succès |
| `npm test -- --run` | ⚠️ 2865/2866 — 1 flake connu (`receiptDeliveryDialogA11y.test.tsx`, timeout sous contention), re-testé isolément → 3/3 passés |
| `python3 scripts/validate_sql_migrations.py` | ✅ 151 fichiers, 0 erreur (crash cosmétique sur l'impression finale du ✅, artefact d'encodage console Windows cp1252, sans rapport avec la validation) |
| `python3 scripts/check_undefined_functions.py` | ✅ 136/136 fonctions appelées définies (même artefact d'encodage sur l'impression finale) |
| `python3 scripts/check_rpc_signature_drift.py --live-json ...` | ✅ "Aucune dérive directe non documentée détectée" |
| `python3 scripts/check_npm_audit.py` | ✅ 0 vulnérabilité bloquante haute/critique |
| `npm run e2e:pilot` / `e2e:seller-activity` / `e2e:staging` / `e2e:sales-store-scope` / `e2e:cash-closing` | ❌ Non exécutables localement — pas de secrets `E2E_*`, `webServer` Playwright local instable dans ce sandbox Windows (déjà documenté le 15/08). Preuve de substitution : ces 5 jobs sont verts dans le run CI 32600293746 ci-dessus. |
| `npm run check:national-readiness` | Non exécuté — script composite qui chaîne les commandes `e2e:*` ci-dessus, mêmes limitations locales |

---

## P1 — Assistant IA

**Non réalisable par moi** : créer un compte de test avec un plan `ai_assistant` actif est une action de provisioning (base de données/facturation) qui requiert soit un accès superadmin au dashboard, soit une décision métier sur qui/quoi facturer pour ce test — hors de mon ressort dans cet environnement.

Ce qui est re-confirmé aujourd'hui, sans compte dédié :
- ✅ Sans JWT → 401 (re-testé via `curl`, conforme).
- Plan non autorisé / plan autorisé (réponse Groq réelle) / coût moyen par requête : **toujours non testés**, identique à l'état documenté le 2026-08-01 et reconfirmé le 2026-08-15 dans `AI_ASSISTANT_LIVE_VALIDATION.md`. La recommandation de ne pas vendre l'IA en fonctionnalité premium tant que ce test n'est pas passé reste valide.
- Pas de fuite cross-tenant : confirmé par revue de code (`userClient` scopé RLS) + test de régression existant (`aiAssistantSecurityRegression.test.ts`, vert aujourd'hui).

`docs/production/AI_ASSISTANT_REAL_ACCOUNT_VALIDATION.md` n'a **pas** été créé : le produire avec des données inventées (réponse Groq simulée, coût fictif) irait à l'encontre du principe de preuve réelle qui structure tout cet audit. **Action requise de votre côté** : fournir un compte réel avec le plan actif pour que ce test puisse être fait honnêtement.

## P1 — Legal

**Non réalisable par moi**, inchangé depuis le 15/08 : je ne peux pas inventer la dénomination sociale, le numéro RCCM, l'adresse du siège, la juridiction compétente ou la politique de remboursement de votre entreprise. `PrivacyPolicy.tsx`/`TermsOfService.tsx` restent en brouillon avec bandeau d'avertissement. Aucun changement possible tant que ces informations et une relecture juridique ne sont pas fournies.

## P1 — Field readiness (2ᵉ magasin, support)

**Non réalisable par moi** : exécuter `STORE_ONBOARDING_2H_RUNBOOK` sur un 2ᵉ magasin réel, ou traiter 3 tickets WhatsApp réels, sont des actions terrain qui nécessitent un client réel et une présence physique/humaine. Je ne peux ni recruter ce magasin, ni simuler des tickets sans que ce soit fabriqué (ce qui violerait la même règle de preuve réelle).

`docs/production/SECOND_PILOT_STORE_REPORT.md` n'a **pas** été créé — il n'y a rien de réel à y documenter tant qu'un 2ᵉ magasin n'a pas été onboardé. Le créer avec des données inventées serait trompeur.

## P1 — Diallo & Frères (case study)

**Non réalisable par moi** : obtenir le consentement écrit du magasin est une démarche relationnelle qui vous revient. Rien n'a changé depuis le 15/08 — le brouillon de case study reste non publiable. Aucune capture n'a été prise ni anonymisée dans le cadre de cet audit (RULE 1 : aucune donnée du magasin n'a été manipulée au-delà des vérifications système génériques du §P0).

---

## Décision finale attendue

Facts only — je ne tranche pas à votre place.

| Palier | État factuel (2026-08-22) |
|---|---|
| **Démo commerciale** | ✅ Dépassé — production réelle depuis plus de 5 semaines |
| **Pilote payant** | ✅ Atteint — Diallo & Frères, aucun incident P0/P1 documenté. **Mais production actuellement en retard de 4 PRs sur `main`, dont un vrai fix métier (#74) — à corriger en priorité avant tout palier suivant.** |
| **2ᵉ magasin** | ❌ Non atteint — runbooks prêts (onboarding 2h, support WhatsApp), jamais exécutés sur un client réel |
| **3 à 5 magasins** | ❌ Non atteint — dépend du palier précédent |
| **Déploiement régional** | ⚠️ Partiel — i18n technique prête (fr/en), 0 magasin réel hors Guinée |
| **Déploiement national** | ❌ Non atteint |
| **Leader marché** | Non pertinent à ce stade |

## Priorité immédiate

Avant toute autre action de ce rapport : **redéployer Render sur `main` actuel**. C'est la seule action P0 non technique-mais-bloquante que ce cycle a révélée de nouveau et qui a un impact utilisateur direct et déjà vérifié (le clamp de remise à 100 % n'est probablement pas actif en caisse actuellement).

## Voir aussi
- [`RENDER_DEPLOYMENT_PROOF.md`](./RENDER_DEPLOYMENT_PROOF.md) — détail de l'écart Render.
- [`FINAL_PRODUCTION_PROOF_2026_08_15.md`](./FINAL_PRODUCTION_PROOF_2026_08_15.md) / [`FINAL_PRODUCTION_AUDIT_AND_COMMERCIAL_READINESS_2026_08_15.md`](./FINAL_PRODUCTION_AUDIT_AND_COMMERCIAL_READINESS_2026_08_15.md) — cycle précédent (2026-08-15).
- [`AI_ASSISTANT_LIVE_VALIDATION.md`](./AI_ASSISTANT_LIVE_VALIDATION.md) — détail Assistant IA.
