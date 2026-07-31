# MakitiPlus — Plan de migration i18n (anglais marchés limitrophes)

## Date
2026-07-31

## Statut
Phase 0 et Phase 1 **livrées** (2026-08-01). Item §3.7/§4.1 de l'audit stratégique (`docs/production/STRATEGIC_AUDIT_AFRICA_WORLD_LEADER.md`).

- **Phase 0** (infrastructure, zéro changement visible) — react-i18next installé, langue forcée à "fr", namespace `common` de départ. PR #54.
- **Phase 1** (parcours "connexion → dashboard → caisse" traduit fr/en + sélecteur de langue) — `Auth.tsx` (PR #56), `Dashboard.tsx` (PR #57), `POS.tsx` (PR #58) intégralement migrés vers `useTranslation()`. Sélecteur de langue dans Settings > Pays et devise.
  - **Portée volontairement limitée aux 3 pages elles-mêmes** — les composants ENFANTS du parcours caisse (`POSCart.tsx`, `POSPaymentDialog.tsx`, `POSProductGrid.tsx`/`POSProductList.tsx`, `MobileCartDrawer.tsx`, `ReceiptActionsDialog.tsx`, `BarcodeScannerDialog.tsx`) ne sont **pas encore traduits** — le namespace `pos` est en place et prêt à les accueillir, mais leur volume (7+ fichiers, contenu du panier/paiement/reçu) justifie un incrément séparé plutôt que de faire déborder la Phase 1 sur un scope non annoncé.
- Chaque page migrée a son propre test de couverture (`i18nPhase1{Auth,Dashboard,Pos}Translations.test.ts`) : toute clé `t()` utilisée doit résoudre en fr ET en, les deux fichiers de ressources doivent avoir exactement les mêmes clés, et les variables d'interpolation `{{...}}` doivent être identiques entre les deux langues pour chaque clé partagée.

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

### Phase 0 — Fondations (FAIT, PR #54)
- Installer `react-i18next` + `i18next`.
- Créer `src/i18n/` : config, namespace `common` de départ.
- `main.tsx` importe la config avant le rendu, langue forcée à `fr` (comportement inchangé).

### Phase 1 — Un vertical complet en anglais (FAIT, PR #56/#57/#58)
- `Auth.tsx`, `Dashboard.tsx`, `POS.tsx` (page elle-même, pas ses composants enfants — voir Statut ci-dessus) traduits intégralement.
- Sélecteur de langue ajouté dans Settings > Pays et devise.
- Vérifié en direct (dev server + navigateur, `i18n.changeLanguage("en")` déclenché depuis la console) pour chaque page : re-rendu correct, interpolation fonctionnelle, zéro erreur console. Pas de test manuel humain du parcours complet (contrainte de session : impossible de se connecter avec un vrai compte — RULE 1).

### Phase 1.5 — Composants enfants du parcours caisse (PAS FAIT — prochaine étape suggérée)
- `POSCart.tsx`, `POSPaymentDialog.tsx`, `POSProductGrid.tsx`/`POSProductList.tsx`, `MobileCartDrawer.tsx`, `ReceiptActionsDialog.tsx`, `BarcodeScannerDialog.tsx` — namespace `pos` déjà créé, il ne reste qu'à y ajouter les clés et migrer chaque composant.
- Sans cette étape, un utilisateur qui bascule en anglais voit la page POS traduite mais le panier/dialogue de paiement/reçu encore en français — incohérence à corriger avant de considérer le parcours caisse "complet".

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

Phase 1.5 (composants enfants du parcours caisse — voir ci-dessus) ou Phase 2 (reste de l'application), selon la priorité voulue. Attend une décision explicite avant de démarrer.
