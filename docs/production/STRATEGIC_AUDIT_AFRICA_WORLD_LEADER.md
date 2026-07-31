# MakitiPlus — Audit stratégique & feuille de route pour le leadership Afrique puis mondial

## Date
2026-07-28

## Portée et limites de cet audit

Ce document est un audit **technique et produit**, fondé sur une lecture directe du code, des migrations, des dépendances et de la documentation existante du dépôt `skaba89/makitiplus` — pas une étude de marché. Je n'ai aucun accès à des données de trafic, de churn, de revenus, de parts de marché des concurrents (Loyverse, Odoo POS, Vend, Zoho, Wave POS, etc.), ni aux intentions réelles des utilisateurs. Les recommandations "leadership Afrique/mondial" qui suivent sont donc des **hypothèses de produit et d'exécution technique raisonnées à partir de ce que le code révèle**, pas une garantie de résultat business. Traiter comme un point de départ pour une discussion produit, pas comme une feuille de route validée par le marché.

---

## 1. Ce qui existe déjà — un socle réellement solide

Contrairement à beaucoup de MVP, MakitiPlus a déjà dépassé le stade du prototype sur plusieurs dimensions critiques :

- **27 pages/modules fonctionnels** : POS, Produits, Catégories, Stock, Clients (avec crédit), Fournisseurs, Commandes fournisseurs, Dépenses, Rapports, Multi-boutiques (Stores), Clôture de caisse, Utilisateurs/rôles, Paramètres, Facturation, Pricing public, Onboarding, Analyse vendeurs, Analytics admin, Gestion d'organisations, Assistant IA, Synchronisation offline, Diagnostics.
- **Sécurité multi-tenant réelle** : Row-Level Security PostgreSQL activée sur 67+ tables, RPC `SECURITY DEFINER` avec `search_path` systématiquement épinglé, audit log (`user_activity_logs`), scan de secrets en CI, `npm audit` bloquant, validateur SQL maison qui détecte les patterns dangereux (GRANT trop larges, DELETE non scopés, DROP destructifs) — un niveau de rigueur peu courant à ce stade.
- **Offline-first réel, pas cosmétique** : file de mutations IndexedDB, synchronisation automatique à la reconnexion, décrément de stock local best-effort, PWA installable, Capacitor pour iOS/Android natif (pas juste une PWA déguisée).
- **CI/CD mature** : deux workflows (`ci.yml` léger, `release-readiness.yml` bloquant avec 5 suites E2E réelles), gate `npm run typecheck` strict, budget ESLint, protection de branche sur `main`.
- **Modèle de paiement adapté au terrain** : décision assumée de ne jamais dépendre de Stripe/carte bancaire — Mobile Money (Orange Money, MTN Money, Moov Money, Wave, M-Pesa) et crédit client en premières classes, cohérent avec la réalité des moyens de paiement en Afrique de l'Ouest.
- **Un vrai pilote réel** : le magasin Diallo & Frères utilise l'application avec de vraies ventes, un vrai stock, un vrai historique — pas une démo. C'est rare et précieux : peu de SaaS africains à ce stade ont un utilisateur réel non captif.
- **SaaS engine déjà présent** : plans (`starter`/`croissance`/`enterprise`), feature flags par plan (`has_ai_assistant`, `has_multi_currency`, `has_api_access`, `has_loyalty_program`...), quotas (`max_stores`, `max_users`, `max_products`) — l'architecture de monétisation existe, elle n'attend que d'être activée pleinement.

Ce socle change la nature de la recommandation : il ne s'agit pas de "construire un MVP", mais de **combler des trous précis qui bloquent le passage à l'échelle**, et de **décider où investir en premier pour la différenciation**.

---

## 2. Constats précis — ce qui bloque aujourd'hui un vrai leadership

### 2.1. L'"Assistant IA" est une façade, pas de l'IA (constat critique) — RÉSOLU (2026-07-31)

`src/pages/AIAssistant.tsx` contenait une fonction `generateAIResponse()` documentée dans son propre commentaire :

> *"In production, this would call an LLM API (OpenAI, etc.). For now, we generate contextual responses based on the query keywords."*

C'était un moteur de correspondance de mots-clés qui renvoyait des réponses canned, pas un appel à un LLM. Or `has_ai_assistant` est déjà un feature flag payant dans le système de plans (`Pricing.tsx`). Un client qui payait pour "l'Assistant IA métier" recevait une simulation.

**Corrigé** : `generateAIResponse()` remplacée par un vrai appel à l'API Groq (modèle `llama-3.3-70b-versatile`) via une nouvelle Edge Function (`supabase/functions/ai-assistant-chat`), grounded sur les vraies données du commerce (ventes du jour, crédits clients, stock bas/rupture, dépenses du mois — lues via le JWT de l'appelant, donc scopées automatiquement par RLS à son organisation). L'accès est re-vérifié côté serveur (`check_feature_access('ai_assistant')`) indépendamment du `FeatureGate` frontend — défense en profondeur cohérente avec le fix `PlanLimitGuard`/`FeatureGate` de la section 3.5. Clé API stockée uniquement en secret Supabase, jamais dans le dépôt.

### 2.2. Zéro internationalisation — plafond de verre pour "leader mondial"

Aucune librairie i18n (`i18next`, `react-intl`, etc.) n'est présente dans le projet, et aucun mécanisme de traduction n'a été trouvé dans `src/`. Tout le texte est français, codé en dur dans les composants. Conséquence directe :
- Impossible d'adresser le Nigeria, le Kenya, le Ghana, l'Afrique du Sud, l'Éthiopie (marchés anglophones, les plus grands d'Afrique par PIB et population) sans une refonte de fond.
- Impossible de sortir d'Afrique francophone pour "le monde" sans la même refonte.
- Chaque jour qui passe sans architecture i18n rend la migration future plus coûteuse (plus de composants à retoucher).

### 2.3. Prix affichés en EUR, calculés en USD, pour un public qui paie en Mobile Money GNF/XOF

`Pricing.tsx` : `const PRICING_CURRENCY = "EUR";` — alors que la logique backend (`_deploy_combined.sql`, `20260702140000_saas_metrics_rpcs.sql`) raisonne en **cents USD** (`plan_id = 'croissance' THEN 2900 -- $29 in cents`). Aucune des deux devises n'est celle que l'utilisateur final manipule réellement (GNF, XOF via Mobile Money). Pour un produit dont toute la thèse est "on ne dépend pas des rails de paiement occidentaux", afficher un prix en euros à un commerçant guinéen est une incohérence de positionnement, pas juste un détail d'UI.

### 2.4. Le "cœur différenciant Afrique" (mobile money manuel, rapport quotidien) n'a jamais été livré

Le plan "Market Leader Readiness" documenté dans `docs/production/MARKET_LEADER_READINESS_REPORT.md` (25/07) listait explicitement P1.4 (mobile money manuel), P1.5 (rapport journalier), P2 (pricing/onboarding), P3 (différenciation, étude de cas, kit commercial), P4 (support/monitoring). P0/P1.1/P1.2/P1.3 et le module clôture de caisse ont été livrés depuis (dans cette session). **P1.4, P1.5, et surtout P3 (différenciation et argumentaire commercial) restent non commencés** — aucun fichier `docs/production/*DIFFERENTIATION*`, `*CASE_STUDY*`, ou `*SALES_KIT*` n'existe dans le dépôt.

### 2.5. Documentation en dérive par rapport au code réel

Le `README.md` annonce "174 unitaires" — le dépôt en compte aujourd'hui 1213 (91 fichiers). Signe mineur mais révélateur : la documentation publique/marketing du dépôt n'est pas maintenue au même rythme que le code. Pour un projet qui veut attirer des investisseurs ou des partenaires techniques, un README à jour est la première impression.

### 2.6. Dette technique connue et documentée (pas nouvelle, mais toujours ouverte)

- 2 vulnérabilités npm *moderate* sur `react-router` (montée majeure v6→v7 non planifiée).
- 152 fichiers de migration SQL — historique riche mais fragmenté ; pas de risque immédiat (le validateur SQL maison couvre l'essentiel) mais un coût cognitif croissant pour tout nouvel ingénieur.
- Aucune stratégie de cache CDN/edge documentée au-delà du déploiement Render/Netlify standard.
- Aucun outil d'analytics produit (Mixpanel/Amplitude/PostHog) — impossible aujourd'hui de mesurer l'activation, la rétention ou le "aha moment" des utilisateurs au-delà des KPI métier internes (ventes, stock).

### 2.7. Ce qui est déjà bien positionné et ne doit pas être touché

RLS, audit logs, offline-first, CI E2E bloquante, modèle de paiement local, feature-gating par plan : **ne pas refaire, construire dessus**. Le risque principal d'un audit de ce type est de recommander une réécriture — ce n'est pas le besoin ici.

---

## 3. Recommandations — devenir leader en Afrique (12–18 mois, exécutable avec l'équipe actuelle)

Priorisées par impact/effort, pas par ordre alphabétique.

### 3.1. Rendre l'Assistant IA réel (P0 produit) — FAIT (2026-07-31)
Voir section 2.1. Groq (`llama-3.3-70b-versatile`) via Edge Function, grounded sur les données réelles de l'organisation, accès re-vérifié côté serveur.

### 3.2. Aligner le prix affiché sur la réalité du paiement
Remplacer `PRICING_CURRENCY = "EUR"` par un affichage en devise locale (GNF, ou multi-devise avec détection du pays) — cohérent avec le choix stratégique "Mobile Money uniquement". Un commerçant qui voit "29 €" alors qu'il va payer en Orange Money GNF perd confiance avant même d'essayer.

### 3.3. Livrer le "mobile money manuel" et le "rapport quotidien" déjà planifiés — FAIT (2026-07-31)
Ce sont les deux items P1.4/P1.5 du plan Market Leader déjà écrit et jamais commencés. Ce sont aussi, empiriquement, les fonctionnalités les plus proches du geste quotidien réel d'un commerçant ouest-africain (confirmer une réception Mobile Money, envoyer le récap du jour au patron par WhatsApp — le module Clôture de caisse a déjà un bouton WhatsApp, `handleShareWhatsApp`, qui montre que le pattern est déjà validé dans le code).

**Rapport quotidien** : déjà livré (Dashboard.tsx, bouton "Rapport WhatsApp" gaté `FINANCIAL_ROLES`, agrège ventes/transactions/répartition par mode de paiement/stock bas/crédits/dépenses du mois — trouvé lors de la vérification, pas ajouté).

**Mobile money manuel** : la référence/numéro de transaction envoyé par l'opérateur peut désormais être saisie manuellement lors d'un paiement wave/orange_money/mtn_money/moov_money/mpesa au POS (preuve de paiement déclarative, aucune intégration API opérateur — voir `supabase/migrations/20260731020000_add_mobile_money_payment_reference.sql`, PR #51). Corrige au passage un bug pré-existant : mtn_money/moov_money/mpesa étaient sélectionnables mais sans contenu d'onglet dédié dans `POSPaymentDialog`.

### 3.4. Construire l'argumentaire de vente à partir du pilote réel
Diallo & Frères est un actif sous-exploité : c'est une preuve terrain, pas une démo. Documenter (avec l'accord explicite du magasin — RULE 1 s'applique aussi à la communication, pas seulement au code) une étude de cas courte et concrète : combien de ventes, quelle fiabilité offline, quel gain de temps à la clôture de caisse. C'est l'élément P3 du plan Market Leader jamais fait, et c'est souvent ce qui convainc le deuxième client bien plus que n'importe quelle fonctionnalité technique.

### 3.5. Activer réellement le modèle multi-tiers — audit fait (2026-07-31), 1 écart trouvé
`has_advanced_reports`, `has_supplier_management`, `has_multi_currency`, `has_loyalty_program`, `has_api_access` existent comme flags mais leur application effective (bridage réel des fonctionnalités par plan) mérite une vérification systématique — un flag non appliqué au bon endroit dans l'UI/API est une fuite de revenu silencieuse.

**Audit effectué** : sur les 16 `feature_key` de `feature_flags`, 6 ne sont gatées nulle part côté code (`advanced_reports`, `offline_advanced`, `loyalty_program`, `backup_restore`, `api_access`, `priority_support`) — apparaissent uniquement comme lignes de comparaison marketing sur `Pricing.tsx`/`Billing.tsx`/`Onboarding.tsx`.

- `priority_support`/`api_access` : pas de fuite — ce sont des promesses opérationnelles (support) ou une fonctionnalité qui n'existe pas encore dans le code (API publique), rien à gater.
- `loyalty_program`/`backup_restore` : **vendus sur la page Pricing sans exister comme fonctionnalité construite nulle part dans le code** — pas une fuite de revenu (rien à contourner), mais un risque de crédibilité commerciale (vendre ce qu'on n'a pas construit) à trancher côté produit.
- `offline_advanced` : idem, aucune distinction "offline basique/avancé" n'existe dans le code — le offline-first actuel est uniforme pour tous les plans.
- **`advanced_reports` : écart réel, non résolu.** `Reports.tsx` (KPI vendeurs/catégories/produits, graphiques ventes/dépenses) est accessible en entier à tous les plans sans distinction — seuls les sous-blocs "exports" et "gestion fournisseurs" sont gatés. Un abonné `starter` (qui existe réellement en base) voit donc le même contenu qu'un `enterprise` payant pour "rapports avancés". Corriger nécessite de décider PRODUIT quels graphiques/cartes constituent le "basique" inclus dans tous les plans vs. l'"avancé" réservé — une décision non dérivable du code, volontairement non tranchée ici pour ne pas retirer une fonctionnalité à un client réel sans validation.

### 3.6. Verrouiller la fiabilité perçue avant l'échelle
Avant de recruter des dizaines de nouveaux magasins pilotes, fermer les items connus qui touchent la confiance : bug `daysUntilExpiry()` documenté (impact nul en UTC+0 mais à nettoyer), README à jour, dette npm modérée. Rien de bloquant individuellement, mais l'accumulation de petites incohérences documentées-mais-non-corrigées finit par coûter cher en crédibilité technique face à un partenaire ou investisseur qui audite le dépôt.

### 3.7. Étendre la couverture linguistique locale minimale
Sans aller jusqu'à une architecture i18n complète (voir §4), livrer au moins l'anglais pour les marchés anglophones limitrophes (Nigeria, Ghana, Sierra Leone, Liberia — tous voisins ou proches de la Guinée) est un premier pas à coût raisonnable et à fort effet de levier régional, avant l'investissement plus lourd du §4.1.

---

## 4. Recommandations — passer d'Afrique à mondial (18–36 mois, investissement plus lourd)

### 4.1. Internationalisation réelle (i18n)
Introduire `react-i18next` (ou équivalent) dès maintenant, même sans traduire tout de suite — chaque nouveau composant écrit avec les strings déjà externalisées ne coûte presque rien de plus à internationaliser ensuite, alors que chaque composant écrit sans y penser coûte cher à corriger après coup. C'est un investissement d'architecture à faire tôt, pas tard.

### 4.2. Multi-devise réel côté paiement, pas seulement côté affichage
`has_multi_currency` existe déjà comme flag — le faire vivre pleinement (devise de vente ≠ devise de reporting ≠ devise de facturation SaaS) est un prérequis pour toute expansion hors zone GNF/XOF.

### 4.3. API/plateforme partenaire
`has_api_access` existe comme flag payant mais la maturité de l'API publique (documentation, rate limiting, webhooks sortants) n'a pas été auditée ici en détail — c'est pourtant ce qui permet à un écosystème de développeurs tiers, d'intégrateurs comptables, ou de partenaires (téléphonie mobile money, plateformes e-commerce locales) de construire autour de MakitiPlus plutôt que MakitiPlus devant tout construire seul. C'est souvent ce qui distingue un "bon produit" d'un "leader de plateforme".

### 4.4. Data & BI au-delà des KPI internes
Les rapports actuels (Reports.tsx, AdminAnalytics.tsx) sont solides pour un usage interne magasin. Un leader mondial de la catégorie POS/commerce (Square, Toast, Loyverse) se différencie aussi par la BI cross-marchands anonymisée (benchmarks sectoriels : "vos marges sont dans le 3ᵉ quartile de votre catégorie dans votre région") — une fonctionnalité à haute valeur perçue, construite sur des données déjà collectées, à condition de la traiter avec la même rigueur RLS/anonymisation que le reste du projet.

### 4.5. Conformité et résidence des données par région
Une expansion hors Guinée pose potentiellement des questions de résidence de données et de conformité locale (variables selon les pays). Non urgent tant que l'app reste mono-pays, mais à anticiper architecturalement avant, pas après, une expansion réelle.

---

## 5. Feuille de route priorisée (résumé exécutif)

| Horizon | Action | Pourquoi maintenant |
|---|---|---|
| ~~Immédiat~~ **fait** | ~~Corriger l'incohérence de devise sur `Pricing.tsx`~~ livré (2026-07-30, PR #47) | Coût quasi nul, incohérence visible par tout prospect |
| ~~Court terme~~ **fait** | ~~Vrai LLM derrière l'Assistant IA~~ Groq + Edge Function livré (2026-07-31) | Écart promesse/réalité sur une fonctionnalité déjà facturable |
| ~~Court terme~~ **fait** | ~~Mobile money manuel + rapport quotidien~~ livré (2026-07-31, PR #51 — référence transaction + rapport quotidien déjà présent) | Cœur du besoin terrain, déjà spécifié, jamais livré |
| Court terme (2–6 semaines) | Étude de cas Diallo & Frères + argumentaire commercial | Actif sous-exploité, coût de production faible — nécessite l'accord explicite du magasin |
| ~~Moyen terme~~ **fait, 1 écart restant** | Audit d'application réelle des feature flags par plan — 2 bugs corrigés (PR #48 admin bypass, PR #50 pilot_national) + `advanced_reports` jamais gaté sur `Reports.tsx` identifié (2026-07-31), décision produit requise avant correction | Fuite de revenu potentielle si non vérifié |
| Moyen terme (1–3 mois) | Anglais pour marchés limitrophes | Effet de levier régional avant investissement i18n complet |
| Long terme (3–12 mois) | ~~Architecture i18n complète~~ **plan écrit** (2026-07-31, `docs/production/I18N_MIGRATION_PLAN.md` — react-i18next, phasage 0→3, aucun code touché) | Prérequis dur pour toute ambition hors Afrique francophone |
| Long terme (6–18 mois) | API partenaire mature + BI cross-marchands | Différenciation "plateforme" vs "outil" |

---

## 6. Ce que cet audit ne peut pas vous dire

Aucune analyse de code ne peut établir : le positionnement prix optimal, la taille réelle du marché adressable par pays, la solidité de la concurrence locale (souvent informelle, mal documentée en ligne), la disponibilité de financement pour l'expansion, ou la capacité d'exécution commerciale de l'équipe. Ces recommandations réduisent le risque technique et produit d'un plan de croissance — elles ne remplacent pas une étude de marché ni une décision de financement/expansion, qui restent des choix humains et business, pas des constats de code.
