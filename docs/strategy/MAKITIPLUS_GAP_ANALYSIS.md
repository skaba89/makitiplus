# MakitiPlus — Audit fonctionnel et analyse d'écarts

> **Date** : 2026-11-02 · **Référence auditée** : `main` @ `a6cc74c` (2026-09-12)
> **Méthode** : lecture du code, des migrations (`supabase/migrations/`, 160 fichiers), des fonctions Edge (`supabase/functions/`), des workflows CI et des tests (`src/test/`, 124 fichiers ; `e2e/`, 12 specs). Suite unitaire exécutée localement : **2969/2969 tests verts**. Dernier run CI `main` : vert (2026-09-12).
> **Ce que cet audit n'a pas pu faire** : interroger la base Supabase de production, ouvrir le dashboard Render, exécuter les E2E (les secrets ne sont présents que dans GitHub Actions).

## 1. Légende des statuts

| Statut | Signification |
|---|---|
| ✅ **Testé** | Présent, couvert par des tests unitaires et/ou E2E |
| 🟡 **Partiel** | Une partie du parcours manque |
| 🟠 **Non fonctionnel** | Le code existe (tables, RPC) mais l'utilisateur ne peut pas s'en servir (pas d'interface, ou cassé) |
| 🔵 **Non déployé** | Prêt dans une branche ou une PR, absent de la production |
| ❌ **Absent** | Rien dans le code |
| 🔧 **À améliorer** | Fonctionne, avec un défaut identifié |

## 2. Priorités absolues (Mission D)

### 2.1 Zéro perte ou duplication de vente

| Élément | Statut | Preuve |
|---|---|---|
| Vente en ligne atomique (vente + lignes + stock, une transaction) | ✅ | `create_sale_with_limit` → `create_full_sale` ; `src/hooks/useOfflineSale.ts` ; `src/test/salesStoreScope.test.tsx`, `e2e/pilot-critical.spec.ts` |
| Unicité `(organization_id, sale_number)` et rejeu idempotent | ✅ | `supabase/migrations/20260723130000_fix_sale_idempotency.sql` |
| **Vente offline en échec supprimée au bout de 24 h ou de 5 essais** | 🔵 corrigé dans la PR `fix/offline-sale-zero-loss` | `cleanupExpiredMutations()` supprimait aussi `create_sale_with_limit` : une vente encaissée pouvait **disparaître silencieusement** |
| **Compteur d'essais incrémenté deux fois par tentative** | 🔵 idem | `updateMutationStatus()` comptait aussi le passage en `syncing` → abandon après ~3 tentatives réelles |
| **Vente offline de plus de 7 jours rejetée** | 🔵 idem | règle « H4 » de péremption appliquée aux ventes |
| **Entrée bloquée en `syncing` (onglet ou application tués pendant l'envoi) jamais rejouée** | 🔵 idem | `getPendingMutations()` ne reprenait que `pending`/`failed` |
| **Coupure réseau ambiguë en ligne → doublon au réessai** | 🔵 idem | erreur levée, le caissier réessaie avec un **nouveau** numéro de vente. Corrigé : bascule dans la file avec le **même** numéro |
| **Ventes offline d'une session précédente non synchronisées au redémarrage en ligne** | 🔵 idem | sync déclenchée seulement sur une transition hors-ligne → en ligne ; ajout d'une sync au démarrage et toutes les 60 s s'il reste des éléments |
| **Crédit client rejoué deux fois (dette doublée)** | 🔵 idem | `increment_customer_credit_by_phone` non idempotente ; migration `20261102100000_credit_by_phone_idempotent.sql`, testée sur Postgres 16 jetable (10 scénarios + course concurrente) |
| Vente offline refusée à la synchro pour « Stock insuffisant » | 🔧 **décision produit requise** | La vente a eu lieu physiquement ; elle reste désormais en file (plus de perte), mais n'entre pas en base. Options : accepter en stock négatif avec alerte, ou file de conflits gérant |
| Crédit en ligne hors de la transaction de vente | 🔧 | `useOfflineSale.ts` : vente OK puis RPC crédit séparée ; en cas d'échec → toast « crédit en attente ». À intégrer dans `create_full_sale` |
| Écran listant les ventes en attente ou en échec (export, relance) | 🟡 | Compteurs + bouton « réessayer » dans `src/components/ui/offline-indicator.tsx` ; pas de liste détaillée pour le gérant |
| Retours, remboursements, annulation de vente | ❌ | aucune RPC ni interface |

### 2.2 Stock et marges fiables

| Élément | Statut | Preuve |
|---|---|---|
| Décrément de stock atomique à la vente | ✅ | `create_full_sale` ; « Stock insuffisant » levé côté serveur |
| Snapshot du coût d'achat dans `sale_items` (marge historique) | ✅ | `20260719130000_add_sale_items_cost_price_snapshot.sql`, `20260719140000_update_create_full_sale_cost_price.sql` |
| Contraintes financières non négatives (CHECK) | ✅ | `20260814010000_add_financial_nonneg_constraints.sql` ; `src/test/financialNonnegConstraints.test.ts` |
| Ajustements et historique des mouvements | ✅ | `StockAdjustDialog.tsx`, `StockMovementHistory.tsx` |
| Réception de commandes fournisseurs (partielle) | ✅ | `20260723140000_fix_receive_purchase_order_partial.sql` ; `e2e/stock-and-purchase-orders.spec.ts` |
| Coût moyen pondéré à la réception | ❌ | `cost_price` écrasé ou saisi à la main ; la marge dépend de la dernière saisie |
| Inventaire physique (session de comptage, écarts valorisés) | 🟡 | ajustement unitaire avec motif « Inventaire » seulement |
| Transferts entre magasins | 🟠 | RPC `create_stock_transfer`, `send_…`, `receive_…` présentes ; **aucune interface** |
| Stock décrémenté localement hors-ligne | ✅ | `decrementLocalStock()` ; `src/test/offlineQueue.test.ts` |

### 2.3 Sécurité multi-tenant

| Élément | Statut | Preuve |
|---|---|---|
| RLS sur les tables métier, corrections cross-tenant successives | ✅ | migrations `20260724100000`→`20260724140000` ; `src/test/authRlsPolicies.test.ts`, `p1/p2/p3SecurityFixes.test.ts` |
| Vérification que le magasin appartient à l'organisation dans la vente | ✅ | `create_full_sale` (« Magasin invalide ») |
| **`increment_customer_credit_by_phone` (SECURITY DEFINER) sans contrôle d'appartenance** | 🔵 corrigé dans la même PR | un utilisateur de l'org A pouvait créer client et dette dans l'org B. Le scénario S6 du test Postgres le démontre puis le bloque |
| Contrôle automatisé de **toutes** les fonctions SECURITY DEFINER prenant un `p_organization_id` | ❌ | à ajouter en CI (backlog MKP-007) |
| Rotation des secrets, runbook | ✅ | `docs/production/SECURITY_ROTATION_RUNBOOK.md` |
| Edge functions : JWT obligatoire | ✅ | `src/test/edgeFunctionSecurity.test.ts` |

### 2.4 Restauration des sauvegardes

| Élément | Statut | Preuve |
|---|---|---|
| Procédure documentée (snapshots Supabase, PITR sur plan Pro) | ✅ doc | `docs/production/BACKUP_RESTORE_PROCEDURE.md` |
| **Test de restauration réellement exécuté et chronométré (RTO/RPO)** | ❌ | la procédure « recommande » un test mensuel ; aucune trace d'exécution dans le dépôt |
| RPC `create_backup` / `restore_backup` / `get_backups` | 🟠 | présentes en base, **appelées par aucune page** |
| Export complet des données d'une organisation (réversibilité) | ❌ | exports partiels CSV/PDF seulement |

### 2.5 Production alignée avec le code validé

| Élément | Statut | Preuve |
|---|---|---|
| CI bloquante (lint, types, build, tests, validateurs SQL, audit npm) | ✅ | `.github/workflows/ci.yml` ; protection de branche : `build-and-test` + `Release Readiness Summary` obligatoires |
| E2E pilote bloquants sur PR | ✅ | `.github/workflows/release-readiness.yml` |
| Frontend Render à jour par rapport à `main` | ✅ **probable** (preuve indirecte) | `last-modified` servi = 2026-09-13 06:57 UTC, postérieur au dernier commit `main` (2026-09-12 21:55 UTC). L'écart d'août (`RENDER_DEPLOYMENT_PROOF.md`) semble résorbé |
| Migrations Supabase appliquées en production = migrations du dépôt | ⚠️ non vérifiable ici | dernière preuve live : 2026-08-22. La migration `20260912000000` n'a pas de preuve d'application |
| SHA du build exposé et vérifié automatiquement après déploiement | ❌ | `VITE_APP_VERSION` existe mais n'est pas comparé automatiquement à `main` |

## 3. Fonctionnalités de complément

| Domaine | Statut | Détail et preuve | Écart vs concurrents |
|---|---|---|---|
| **Caisse (POS)** | ✅ | recherche, scan code-barres, raccourcis, remise plafonnée (#74), multi-paiement ; `src/pages/POS.tsx`, `posCart*.test.ts`, `e2e/pos.spec.ts` | Au niveau |
| **Reçus** | ✅ | PDF, QR, 58/80 mm, WhatsApp, file de livraison offline ; ~20 tests `receiptDelivery*` | Au-dessus (livraison offline) |
| **Clôture de caisse** | ✅ | ouverture/clôture/validation/rejet, PDF, rôles ; 11 tests `cashClosing*` + `e2e/cash-closing.spec.ts` | Au niveau de Lightspeed, au-dessus de Loyverse gratuit |
| **Fidélité client** | 🟠 | tables `loyalty_*`, RPC `earn_loyalty_points`, `redeem_loyalty_points`, `update_loyalty_tier` ; **aucun appel depuis le POS** | Loyverse l'offre **gratuitement** |
| **Personnel** | 🟡 | rôles `admin`, `manager`, `vendeur`, `comptable`, `super_admin` ; activité vendeur ; journal d'audit | Manquent PIN vendeur rapide, permissions fines (remise max, annulation), pointage |
| **Multi-magasins** | 🟡 | magasins, sélecteur, stock et ventes par magasin, KPIs ; `e2e/sales-store-scope.spec.ts` | Transferts sans interface, pas de prix par magasin |
| **Crédit et recouvrement** | 🟡 | crédit par téléphone, paiements partiels (`process_credit_payment`), fiche client | Manquent plafond, échéance, âge de la dette, relances automatiques WhatsApp/SMS |
| **Grossistes** | ❌ | aucune grille de prix (détail/demi-gros/gros), pas d'unités de conditionnement | Lightspeed, Odoo l'ont |
| **Catalogue WhatsApp / e-commerce** | ❌ | seulement l'envoi de reçus (`supabase/functions/send-whatsapp`) | Cœur de Bumpa et Shopify |
| **Paiements locaux** | 🟡 | référence mobile money saisie à la main (`20260731020000_add_mobile_money_payment_reference.sql`) ; abonnement par Stripe uniquement | Aucune intégration Orange Money GN / MTN MoMo GN |
| **Comptabilité** | 🟡 | dépenses, rapports, marges | Pas d'export journal (SYSCOHADA/OHADA) ; Plazza l'annonce |
| **Assistant IA** | 🟡 | Edge function Groq réelle, scopée RLS ; `aiAssistantSecurityRegression.test.ts` | **Jamais validé sur un compte payant réel**, coût par requête inconnu (`AI_ASSISTANT_LIVE_VALIDATION.md`) |
| **API et intégrations** | ❌ | pas de clés API par organisation, pas de webhooks sortants | Tous les leaders en ont une |
| **Support** | 🟠 | tables et RPC `support_tickets` sans interface ; runbook WhatsApp | — |
| **i18n** | 🟡 | `fr`, `en` (`src/i18n/locales`) | Pas de langue locale (pular, malinké, soussou) |
| **Tarification** | 🔧 | page d'accueil 39,90 € / 99,90 € ; table `plans` 29 / 79 ; Stripe | Incohérent et non libellé en GNF ; marché ouest-africain ≈ 8 000–20 000 FCFA/mois [V] |
| **Légal** | 🟡 | CGU et confidentialité en brouillon avec bandeau | Informations d'entreprise (RCCM, siège) non fournies |

## 4. Écarts concurrentiels prioritaires (synthèse)

1. **Fiabilité hors-ligne démontrée** : le différenciateur n°1 ; les correctifs de la PR doivent être déployés, puis mesurés en production (indicateur « ventes en file > 24 h »).
2. **Fidélité et transferts de stock** : le moteur existe déjà, il ne manque que l'interface. Gain rapide face à Loyverse.
3. **Crédit et recouvrement avancés** : avantage naturel (Loyverse et Square ne le font pas) à renforcer avec relances, plafonds et échéances.
4. **Prix en GNF et paiement d'abonnement en mobile money** : barrière à l'achat évidente.
5. **Catalogue WhatsApp** : canal de vente réel en Afrique (preuve : Bumpa).
6. **Réversibilité des données** : réponse directe à la peur créée par Kippa.

Le détail chiffré et ordonné est dans `PRIORITIZED_BACKLOG.md`.
