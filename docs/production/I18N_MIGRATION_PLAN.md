# MakitiPlus — Plan de migration i18n (anglais marchés limitrophes)

## Date
2026-07-31

## Statut
Plan écrit, **aucun code touché**. Item §3.7/§4.1 de l'audit stratégique (`docs/production/STRATEGIC_AUDIT_AFRICA_WORLD_LEADER.md`) — chantier structurant volontairement scopé avant exécution plutôt que codé à l'aveugle, vu son ampleur (213 fichiers composants/hooks, ~87 fichiers contenant des chaînes françaises en dur détectés par un scan grossier).

## Pourquoi ce n'est pas un simple ajout de traductions

Aucune librairie i18n n'existe dans le dépôt (`react-i18next`, `react-intl`, etc. absents de `package.json`). Toutes les chaînes utilisateur sont du français codé en dur directement dans le JSX (`<p>Vente à crédit</p>`), dans des objets de labels (`FEATURE_LABELS`, `paymentMethodLabels`), et dans des messages toast/erreur. Il n'y a pas de couche d'indirection à activer — il faut la construire.

## Décision d'architecture recommandée

**`react-i18next`** (pas `react-intl`/FormatJS) :
- Écosystème le plus mature pour React + Vite, intégration triviale avec le lazy-loading déjà en place (`lazyWithRecovery` dans `App.tsx`) via `i18next-http-backend` ou des namespaces bundlés par route.
- Pattern `useTranslation()` / `<Trans>` proche des hooks déjà omniprésents dans ce code (`useAuth()`, `useCurrency()`, etc.) — cohérent avec les conventions existantes.
- Détection de langue via `i18next-browser-languagedetector`, mais **la langue par défaut doit rester dérivée de `profile.country`** (comme `useCurrency()` le fait déjà pour la devise) plutôt que la langue du navigateur — un commerçant guinéen sur un téléphone configuré en anglais par défaut doit quand même voir l'app en français par défaut.

## Ce qui existe déjà et qu'il ne faut PAS casser

- `src/utils/currencies.ts` — `COUNTRIES` avec `phoneCode`/`mobilePayments`/`currency` par pays. La langue par défaut par pays devrait s'accrocher à cette même structure plutôt que créer un second registre pays parallèle.
- `date-fns/locale` `fr` déjà importé (`Reports.tsx` et ailleurs, 10 occurrences) pour le formatage de dates — devra devenir dynamique (`fr`/`en` selon la langue active) une fois l'i18n en place, pas avant.
- `useCurrency()`/`formatPrice` — le formatage des montants (séparateurs, position du symbole) est un axe orthogonal à la langue de l'UI ; ne pas les coupler dans la même passe.

## Phasage recommandé (ne pas tout faire d'un coup)

### Phase 0 — Fondations (1 PR, sans traduction visible)
- Installer `react-i18next` + `i18next`.
- Créer `src/i18n/` : config, structure de namespaces (`common`, `pos`, `reports`, `settings`, `billing`, ...), fichier `fr.json` **généré à partir des chaînes déjà en dur** (pas retapé à la main — risque d'erreur/incohérence).
- Wrapper `I18nextProvider` dans `App.tsx`, langue forcée à `fr` (comportement actuel inchangé).
- Objectif : zéro changement visible, juste l'infrastructure posée + le premier fichier de traduction FR comme source de vérité.

### Phase 1 — Un vertical complet en anglais (POS + Auth + Dashboard)
- Choisir le parcours le plus court utilisé par un nouveau commerçant anglophone (connexion → dashboard → caisse) et le traduire intégralement, pas page par page dispersée.
- Ajouter le sélecteur de langue (Settings, probablement à côté du `CurrencyDisplaySelector` déjà existant — pattern UI déjà connu des utilisateurs).
- Valider avec un test manuel complet du parcours POS en anglais avant d'étendre.

### Phase 2 — Reste de l'application
- Étendre namespace par namespace, dans l'ordre d'usage réel (Reports/Customers/Suppliers avant Diagnostic/OrganizationManagement qui sont des pages admin peu visitées).
- Chaque nouveau composant écrit APRÈS la Phase 0 doit utiliser `useTranslation()` dès l'écriture — coût marginal quasi nul si fait dès le départ, coût élevé si rattrapé après coup (rappel de l'audit §4.1).

### Phase 3 — Langue par défaut par pays
- Une fois l'anglais complet et stable, brancher la langue par défaut sur `profile.country` (Nigeria/Ghana/Sierra Leone/Liberia → `en`, reste → `fr`), avec sélecteur manuel toujours disponible pour override.

## Non-objectifs explicites de ce plan

- **Pas de traduction automatique/IA en production** — les 1200+ tests unitaires de ce dépôt reposent en partie sur des assertions de texte français (`expect(...).toMatch(/Vente à crédit/)` etc.) ; une traduction mal maîtrisée casserait ces tests en cascade sans qu'on s'en rende compte avant la CI. Traduction humaine ou revue humaine systématique.
- **Pas de traduction des templates de reçus imprimés** dans cette première itération (`receiptGenerator.ts`) — le client final du commerçant reste très majoritairement francophone même si le commerçant lui-même utilise l'app en anglais ; risque de confusion si le ticket change de langue sans que ce soit le choix explicite du commerçant. À rediscuter en Phase 3.
- **Pas de RTL** — aucun marché cible actuel (Nigeria, Ghana, Sierra Leone, Liberia) n'en a besoin.

## Effort estimé (ordre de grandeur, pas un engagement)

- Phase 0 : 1 PR, faible risque (infrastructure pure).
- Phase 1 : le chantier le plus coûteux en temps humain de révision (traduction + vérification manuelle du parcours), mais à surface de code limitée (3-4 pages).
- Phase 2 : le plus long en volume (213 fichiers composants/hooks au total, extension incrémentale), mais mécaniquement répétitif une fois le pattern de Phase 1 établi.

## Prochaine étape

Aucune — ce document attend une décision explicite de démarrage de la Phase 0. Rien n'est codé.
