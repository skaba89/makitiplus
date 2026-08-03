# MakitiPlus — i18n Phase 2 — Rapport d'avancement

## Périmètre demandé (audit final hardening 2026-08-01, section P1)
- Persister la langue choisie côté profil.
- Garder le français par défaut.
- Traduire Reports, Products, Categories, Customers, Suppliers, CashClosing, Pricing, Billing.
- Traduire toasts et messages d'erreur.
- Ajouter un test qui interdit les chaînes FR codées en dur dans les pages traduites.

## Méthode

Identique à la Phase 1 (Auth/Dashboard/POS) : un namespace i18n par page, migration complète de la page, tests de couverture des clés (fr/en alignées, pas de valeur vide, variables d'interpolation cohérentes), validation `typecheck`/`lint`/`build`/`vitest` avant chaque commit. Traité **page par page**, pas en un seul changement massif — 8 pages représentent ~5600 lignes de code au total, un chantier volontairement fractionné pour rester révisable et sans régression.

## 1. Persistance de la langue (fait)

`profiles.language` existait déjà en base (colonne jamais câblée). Deux morceaux, aucune migration nécessaire :

- `src/components/ui/language-selector.tsx` — écrit désormais dans `profiles.language` au changement (même pattern que `currency-selector.tsx` pour `profiles.currency`). Le changement visuel est immédiat et non bloqué par la persistance (si elle échoue — hors ligne, réseau —, la langue reste changée à l'écran, seule la prochaine session repartirait en français).
- `src/components/i18n/ProfileLanguageSync.tsx` — nouveau composant invisible, monté une fois sous `AuthProvider` dans `App.tsx`, qui synchronise `i18n` avec `profiles.language` dès que le profil charge. Volontairement **séparé** d'`AuthContext.tsx` (fichier critique pour l'authentification, hors scope de ce changement) pour limiter le rayon d'impact.
- Le français reste la langue par défaut : `i18n.config.ts` garde `lng: "fr"` / `fallbackLng: "fr"` inchangés — un profil sans `language` enregistré démarre toujours en français.

Test : `src/test/i18nLanguagePersistence.test.ts`.

## 2. Pricing.tsx (fait)

Premier incrément de traduction de page, choisi en premier car :
- Page publique (pas d'authentification requise, périmètre de test le plus simple).
- La plus petite des 8 pages demandées (226 lignes).
- Isolée du reste de l'app (pas de dépendance croisée avec les autres pages à traduire).

Namespace `pricing` créé (`src/i18n/locales/{fr,en}/pricing.json`), page migrée vers `useTranslation("pricing")` dans le composant principal et dans `PlanCard`. Pluralisation gérée explicitement (boutique/boutiques, utilisateur/utilisateurs, produit/produits) plutôt que par plugin automatique, pour rester cohérent avec la simplicité du reste de l'infrastructure i18n de ce dépôt.

Test : `src/test/i18nPricingTranslations.test.ts` (41 assertions : résolution de toutes les clés utilisées en fr/en, alignement des ressources, absence de chaîne FR codée en dur résiduelle sur les libellés visibles).

## 3. Reports.tsx (fait)

Deuxième incrément — la plus volumineuse des 8 pages (950 lignes : cartes de stats, section rentabilité, 2 graphiques Recharts, tableau fournisseurs, alerte produits orphelins). Seule la page elle-même est migrée, pas ses composants enfants importés (`ProductKpisCard`, `CategoryKpisCard`, `SellerKpisCard`, `EnhancedDashboardStats`) — même principe que POS.tsx/Phase 1.5, ce sont des unités de travail séparées.

Point d'attention corrigé pendant la migration : le graphique "Valeur du stock par fournisseur" utilisait le libellé français affiché ("Valeur stock (achat)") à la fois comme `dataKey` de la donnée, comme clé de `ChartConfig`, et comme variable CSS générée (`--color-Valeur stock (achat)`). Changer de langue aurait cassé le graphique (barres invisibles, faute de correspondance dataKey/CSS var). Corrigé en introduisant des clés techniques stables et indépendantes de la langue (`purchaseValue`/`saleValue`), le libellé traduit ne vivant plus que dans `ChartConfig.label`.

Un message combinant texte et mise en emphase (`<strong>`) — l'alerte "produits sans fournisseur" — utilise le composant `Trans` de `react-i18next` plutôt qu'une interpolation de chaîne brute, premier usage de `Trans` dans ce dépôt.

Test : `src/test/i18nReportsTranslations.test.ts` (166 assertions, incluant une vérification anti-régression spécifique sur les clés techniques du graphique fournisseurs et un scan anti-chaîne-FR-codée-en-dur sur tout le JSX de la page).

## 4. Products.tsx (fait)

Troisième incrément (743 lignes) : en-tête, actions (import CSV/export/ajouter), bandeau d'alertes stock (rupture/stock bas, avec pluralisation `_one`/`_other`), recherche, filtre magasin, filtres catégorie, liste vide, pagination, dialogue formulaire, dialogue de suppression. Composants enfants (`ProductList`, `ProductForm`, `StockAdjustDialog`, `ProductImportDialog`, `StockMovementHistory`) hors périmètre.

**Toasts et messages d'erreur** (demandés explicitement par la section 7) : toutes les mutations (créer/modifier/supprimer un produit, ajuster le stock, exporter) sont couvertes — succès, erreur RLS, erreur générique avec message d'origine interpolé, limite de plan atteinte.

**Écart connu, documenté et volontairement hors périmètre** : `blockMutation()` (`src/contexts/DemoContext.tsx`) affiche un toast "Mode démo" en français codé en dur, mais c'est un fichier **partagé par toutes les pages de l'app** (pas seulement Products.tsx) — le traiter correctement demanderait de le migrer une seule fois pour toutes les pages qui l'utilisent, une tâche à part, pas un sous-produit de la migration d'une page individuelle.

Test : `src/test/i18nProductsTranslations.test.ts` (93 assertions). Au passage, correction d'un bug de regex dans le test anti-chaîne-codée-en-dur (aussi corrigé rétroactivement dans `i18nReportsTranslations.test.ts`) : le pattern `[^<{]` traversait les retours à la ligne, donc un générique TypeScript comme `useState<Product | null>` fournissait un `>` qui faisait dériver le match jusqu'au prochain `<` bien plus loin dans le fichier, engloutissant du code et des commentaires sans rapport. Corrigé en `[^<{\n]` (borné à une seule ligne).

## 5. Restant (pas encore fait)

Categories, Customers, Suppliers, CashClosing, Billing — chacune sera traitée comme un incrément séparé (namespace + migration + tests + validation complète), suivant exactement la même méthode que ci-dessus. CashClosing en particulier demandera une attention accrue vu sa criticité (voir section P0.5 de l'audit du 2026-08-01) — traduction uniquement, aucune logique métier à toucher. `DemoContext.tsx` (blockMutation) reste également à traiter comme une tâche transversale séparée si on veut une couverture i18n complète.

Toasts et messages d'erreur globaux (hors namespaces de page) et le test anti-chaînes-FR-codées-en-dur généralisé restent également à faire, une fois les 8 pages couvertes (le test générique n'a de sens qu'une fois qu'on sait exactement quelles pages sont "censées" être entièrement traduites vs. celles qui ne le sont pas encore).

## Critère d'acceptation de la section (rappel)

> Le français reste intact. L'anglais devient exploitable sur les parcours principaux. Aucun texte critique non traduit dans Auth/Dashboard/POS/CashClosing.

Auth/Dashboard/POS : déjà couverts (Phase 1). CashClosing : **pas encore fait** — reste le principal écart par rapport à ce critère à ce stade.
