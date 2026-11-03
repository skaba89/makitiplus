# MakitiPlus — Matrice concurrentielle

> **Date de collecte** : 2026-11-02. Toutes les sources ont été consultées à cette date.
> **Règle de lecture** : chaque affirmation porte un niveau de preuve.
> - **[O]** source officielle de l'éditeur (site, aide, tarifs)
> - **[T]** source tierce (comparateur, presse, avis agrégés) : à recouper
> - **[V]** contenu commercial d'un vendeur concurrent ou prestataire : à prendre avec prudence
> - **[NV]** non vérifié / introuvable : on ne s'appuie pas dessus
>
> Les tarifs bougent souvent. Avant toute décision commerciale, revérifier sur la page officielle.

---

## 1. Synthèse en une page

| Critère | Loyverse | Odoo POS | Shopify POS | Square | Lightspeed | Bumpa | Plazza POS | **MakitiPlus (main, 2026-11-02)** |
|---|---|---|---|---|---|---|---|---|
| Prix d'entrée | Gratuit + modules payants [O] | Gratuit (1 app), puis par utilisateur [T] | Lite inclus avec un plan Shopify ; Pro ≈ 89 $/mois/site [T] | Logiciel gratuit ; encaissement carte payant [O] | ≈ 69–109 $/mois en entrée (chiffres divergents) [T] | Freemium, prix variables par pays [T] | « Compte gratuit » annoncé [V] | Starter 0, Croissance 29, Enterprise 79 (en base) ; la page d'accueil affiche **39,90 € / 99,90 €** (incohérence, voir GAP) |
| Disponible en Guinée | Application mondiale sur les stores ; usage local non mesuré [NV] | Logiciel accessible ; présence de partenaires locaux non vérifiée [NV] | Logiciel oui ; **Shopify Payments indisponible en Afrique** [T] | **Encaissement carte limité à 8 pays, aucun en Afrique** [O] | Pas de présence africaine identifiée [NV] | Surtout Nigeria et Ghana [T] | Annonce viser l'Afrique, dont RDC [V] | **Oui, pilote réel à Conakry** |
| Hors-ligne | Oui, avec limites (remboursements, création de clients…) ; **reçus non synchronisés perdus à la déconnexion** [O] | Oui une fois la session ouverte ; **ouverture de session impossible hors-ligne** [T, forum officiel] | Partiel [NV] | 1 h à 24 h selon le matériel ; **paiements non synchronisés expirés = perdus** [O] | [NV] | [NV] | **Annoncé « indisponible » dans son propre comparatif** [V] | Oui : file IndexedDB, rejeu idempotent côté serveur. Les correctifs « zéro perte » sont dans la PR `fix/offline-sale-zero-loss` |
| Mobile money local | Non natif [NV] | Via modules tiers [NV] | Via passerelles tierces (Paystack, Flutterwave) [T] | Non | Non | Terminal maison au Nigeria [T] | Annoncé [V] | Saisie manuelle de la référence (Orange Money, Wave, MoMo) ; **pas d'intégration API** |
| Crédit client (dette) | Non natif [NV] | Oui (comptes clients ERP) [NV] | Non natif | Non natif | Comptes clients [T] | Partiel [T] | Annoncé [V] | **Oui** (crédit par téléphone, paiements partiels) |
| Fidélité | **Gratuite, intégrée** [O] | Oui [T] | Applications tierces | Square Loyalty (payant, **non disponible hors-ligne**) [O] | Oui [T] | [NV] | [NV] | Tables et RPC présentes, **aucune interface** |
| Multi-magasins | Gratuit [O] | Oui | Oui (Pro par site) | Oui | Oui | Oui (« multi-location ») [O-page tarifs] | Oui [V] | Oui (stock par magasin, sélecteur, KPIs) |
| Transferts de stock | Module payant « Advanced inventory » 25 $/mois/magasin [O] | Oui | Oui | Oui | Oui | [NV] | [NV] | RPC présentes, **aucune interface** |
| Comptabilité | Export | **ERP complet** | Applications tierces | Square Banking (hors Afrique) | Intégrations | Tenue de livres simple [T] | **OHADA annoncé** [V] | Dépenses + rapports ; **pas d'export comptable** |
| E-commerce / catalogue | Non | Module e-commerce | **Natif (cœur du produit)** | Square Online | eCom | **Cœur du produit (boutique + réseaux sociaux)** [T] | Module séparé [V] | **Absent** (envoi de reçus WhatsApp uniquement) |
| Langues | Multiples | Multiples | Multiples | Multiples | Multiples | Anglais | Français [V] | Français, anglais |
| Données exportables / réversibilité | Oui | Oui (open source) | Oui | Oui | Oui | [NV] | [NV] | Exports CSV/PDF/Excel ; **pas d'export complet « emporter mes données »** |

**Lecture rapide.** Aucun acteur global n'associe, pour un commerce guinéen : hors-ligne fiable, crédit client, mobile money local, prix en GNF et support local. C'est la fenêtre de MakitiPlus. Elle ne vaut que si la **fiabilité** (zéro vente perdue) et le **prix en monnaie locale** sont tenus. Ces deux points sont aujourd'hui les écarts les plus nets (voir `MAKITIPLUS_GAP_ANALYSIS.md`).

---

## 2. Fiches concurrents

### 2.1 Loyverse — la référence gratuite en Afrique francophone

- **Modèle** : application gratuite ; modules payants. Gestion des employés et inventaire avancé à **25 $/mois ou 250 $/an par magasin chacun** ; historique de ventes illimité 5 $/mois par magasin [O, [tarifs](https://loyverse.com/en-us/pricing)]. Certains comparateurs indiquent encore 5 $/employé/mois : tarif probablement obsolète [T, [Merchant Maverick](https://www.merchantmaverick.com/reviews/loyverse-review/)].
- **Gratuit inclus** : caisse, analytique sur 31 jours, inventaire de base, **programme de fidélité**, écran client, écran cuisine, **multi-magasins**, intégrations [O, [tarifs](https://loyverse.com/en-us/pricing)].
- **Hors-ligne** : ventes possibles, mais remboursements, création de clients et d'articles limités ; **les reçus « non synchronisés » sont perdus si l'utilisateur se déconnecte** [O, [aide Loyverse](https://help.loyverse.com/help/offline-work-of-pos)].
- **Avis** : environ 4,8/5 sur ~457 avis (Capterra / Software Advice) [T, [Software Advice](https://www.softwareadvice.com/retail/loyverse-profile)]. Anecdote de perte totale de données après vol d'une tablette [T, Capterra]. Support jugé réactif [T].
- **Position en Afrique de l'Ouest** : cité comme la solution gratuite la plus utilisée au Sénégal [V, [Kolonell](https://kolonell.com/fr/blog/logiciel-caisse-pos-commerce-senegal-2026), prestataire concurrent].
- **Limites exploitables par MakitiPlus** : pas de crédit client natif, pas de mobile money local, dette « hors-ligne = risque de perte » documentée par l'éditeur lui-même, rapports limités à 31 jours en gratuit.

### 2.2 Odoo Point of Sale — l'ERP modulaire

- **Modèle** : une application gratuite ; ensuite par utilisateur. Standard ≈ 16,90–24,90 $/utilisateur/mois, Custom ≈ 25,50–49 $ selon la source et le pays [T, [comparatif](https://www.swell.is/content/odoo-pricing), [Octura](https://octurasolutions.com/resources/how-much-does-odoo-cost-per-month-2026)]. **Tarification géolocalisée** : l'écart peut atteindre 7× selon le pays [T]. Aucun tarif Afrique publié trouvé.
- **Hors-ligne** : fonctionne une fois la session ouverte ; **ouvrir une session exige Internet** ; le back-office exige Internet [T, [forum Odoo](https://www.odoo.com/forum/help-1/how-is-the-point-of-sale-offline-mode-working-218314)]. Données hors-ligne plafonnées à 2 Go, les plus anciennes purgées [O, [doc Odoo 19](https://www.odoo.com/documentation/19.0/applications/general/offline_mode.html)].
- **Forces** : comptabilité, achats, e-commerce, RH dans un seul système.
- **Limites** : coût d'intégration (partenaire), complexité pour une boutique de quartier, dépendance au réseau à l'ouverture de caisse.

### 2.3 Shopify POS — l'omnicanal mondial

- **Modèle** : POS Lite inclus dans tout plan Shopify ; **POS Pro ≈ 89 $/mois par site** (≈ 79 $ en annuel) ; frais de carte en sus [T, [Style Factory](https://www.stylefactoryproductions.com/blog/shopify-pos-pricing), [G2](https://www.g2.com/products/shopify-shopify-pos/pricing)].
- **Afrique** : **Shopify Payments indisponible en Afrique** ; il faut passer par des passerelles tierces (Paystack : Nigeria, Ghana, Kenya, Rwanda, Côte d'Ivoire, Afrique du Sud) [T, [communauté Shopify](https://community.shopify.com/t/integration-de-moyens-de-paiement/374276), [Paystack app](https://apps.shopify.com/paystack)]. Des marchands guinéens cherchent encore à intégrer Orange Money et MTN MoMo sans solution établie [T, [fil Shopify](https://community.shopify.com/t/need-a-developer-to-intergrate-a-check-out-payment-using-mtn-and-orange-mobile-money-momo-api/6281?page=2)].
- **Leçon à retenir** : le catalogue en ligne et la caisse partagent le même stock. C'est ce que les commerçants qui vendent sur WhatsApp, Facebook ou Instagram cherchent.

### 2.4 Square — l'intégration paiement + caisse

- **Disponibilité** : encaissement carte limité à **8 pays** (États-Unis, Canada, Australie, Japon, Royaume-Uni, Irlande, France, Espagne), **aucun en Afrique** [O, [Square](https://squareup.com/help/us/en/article/4956)].
- **Hors-ligne** : session de 1 h (Reader/Stand) à 24 h (Terminal/Register). Un paiement non transmis à temps **expire et l'argent n'est pas perçu**. Les paiements en attente sont **perdus définitivement** en cas de déconnexion, désinstallation ou réinitialisation. Fidélité indisponible hors-ligne [O, [Square aide 8106](https://squareup.com/help/us/en/article/8106-offline-payments-time-limits)].
- **Leçon** : même le leader assume des pertes hors-ligne et les reporte sur le commerçant. MakitiPlus peut se différencier avec une **garantie mesurée de non-perte**, à condition de la prouver.

### 2.5 Lightspeed Retail — le haut de gamme

- **Modèle** : 3 ou 4 paliers ; les montants divergent selon les sources (69/119/199 $ ou 89/149/289 $ ou 109/179/339 $ par mois) [T, [PricingSaaS](https://pricingsaas.com/companies/lightspeed), [G2](https://www.g2.com/products/lightspeed-retail/pricing)]. Pas de plan gratuit [T].
- **Afrique** : aucune présence identifiée [NV].
- **Leçon** : inventaire avancé (variantes, numéros de série, commandes fournisseurs) attendu par les chaînes et les grossistes, l'un des segments cibles de MakitiPlus.

### 2.6 Bumpa — commerce social africain (Nigeria, Ghana)

- **Modèle** : freemium ; paliers Basic, Starter, Pro, Growth ; prix variables par pays, entrée citée à ~₦5 000/mois facturé par trimestre [T, [Take App](https://www.take.app/alternatives/bumpa)] ; ₦30 000 apparaît sur la page officielle sans palier identifiable [O, [tarifs](https://getbumpa.com/pricing)].
- **Fonctions** : site marchand, domaine personnalisé, dépenses, rapprochement de transactions, **multi-emplacements**, comptes du personnel, migration assistée [O, page tarifs] ; SMS groupés, terminal de paiement, logistique Shipbubble [T, blog Bumpa].
- **Financement** : 4 M$ en seed [T, [The Condia](https://thecondia.com/?p=2294)].
- **Leçon** : en Afrique, le catalogue social (WhatsApp/Instagram) **est** le canal de vente. La caisse seule ne suffit pas.

### 2.7 Kivo — **non identifié**

- Aucune solution de caisse « Kivo » destinée aux commerçants africains n'a été trouvée. Les homonymes trouvés sont un projet GitHub hispanophone, une application brésilienne (Kivoshop, paiements PIX) et Kivoo, une boutique en ligne visant Cameroun/Nigeria/Ghana [NV, [kivoohub.com](https://kivoohub.com/), [kivoshop.app](https://www.kivoshop.app/)].
- **Action** : demander au fondateur le site exact de « Kivo » visé. **Aucune conclusion n'est tirée tant que la cible n'est pas confirmée.**

### 2.8 Plazza POS — concurrent direct déclaré (Afrique francophone)

- Se présente comme « logiciel de caisse & ERP pour l'Afrique » : ventes, stocks, clients, multi-boutiques, e-commerce, paiements, **comptabilité OHADA** ; compte gratuit en 30 s [V, [plazzapos.app](https://plazzapos.app/)].
- Son propre comparatif (cas RDC) indique **hors-ligne robuste « indisponible »** et e-commerce en module séparé [V].
- Aucun avis indépendant ni tarif détaillé trouvé.
- **Leçon** : la promesse « OHADA » parle aux PME formalisées. MakitiPlus n'a pas d'export comptable aujourd'hui.

### 2.9 Autres acteurs identifiés pendant l'étude

| Acteur | Pays | Intérêt pour l'analyse | Preuve |
|---|---|---|---|
| **Kweeli** | Côte d'Ivoire | Gestion commerciale + boutique en ligne, Orange Money et Wave | [V, [kweeli.com](https://www.kweeli.com/)] |
| **Stokimba** | Cameroun, Côte d'Ivoire, Sénégal | Gestion de stock pour commerçants africains | [V, [stokimba.com](https://www.stokimba.com/)] |
| **Kippa** (Nigeria) | Nigeria | **Contre-exemple** : application de tenue de livres gratuite, plus de 11 M$ levés. Produit de paiement fermé en 2023 (dévaluation du naira), puis **application inaccessible depuis janvier 2024 : commerçants privés de leurs données** | [T, [TechCabal](https://techcabal.com/2024/02/23/kippa-users-left-in-the-dark/), [Launch Base Africa](https://launchbaseafrica.com/2025/08/18/founders-exit-website-down-the-unraveling-of-target-global-backed-kippa-that-raised-over-14m/)] |
| **Kolonell** | Sénégal | Agence de caisse sur mesure. Fourchette SaaS POS au Sénégal **8 000–20 000 FCFA/mois** | [V, [Kolonell](https://kolonell.com/fr/blog/logiciel-caisse-pos-commerce-senegal-2026)] |
| **Paycard, CinetPay, Moneroo, Lengo Pay** | Guinée / régional | Agrégateurs mobile money couvrant Orange Money GN et MTN MoMo GN (Moneroo référence `mtn_gf` en GNF) | [O, [doc Moneroo](https://docs.moneroo.io/fr/payments/methodes-disponibles)] ; [T, [Lengo Pay SDK](https://pub.dev/packages/lengopay_flutter/changelog)] |

---

## 3. Ce que les avis et demandes publiques révèlent

| Problème | Qui le subit | Preuve |
|---|---|---|
| Perte de ventes hors-ligne (déconnexion, expiration, appareil perdu) | Loyverse, Square | [O] aides officielles ; [T] avis Capterra |
| Mobile money local non intégré | Shopify, Loyverse | [T] forums Shopify (Guinée, Ghana) |
| Ouverture de caisse impossible sans réseau | Odoo | [T] forum officiel |
| Prix en dollars et facturation par site, lourds pour une petite boutique | Shopify Pro, Lightspeed | [T] comparateurs |
| Disparition d'un fournisseur = données prises en otage | Kippa | [T] presse tech nigériane |

**Implication** : les engagements différenciants de MakitiPlus doivent être **vérifiables** : 1) aucune vente perdue (test reproductible + indicateur en production), 2) mobile money local, 3) prix en GNF, 4) **réversibilité** (export complet des données à tout moment), qui répond directement à la crainte créée par Kippa.

---

## 4. Limites de cette étude

- Aucun entretien commerçant n'a été mené : voir `CUSTOMER_NEEDS_RESEARCH.md` pour le protocole.
- Les tarifs tiers divergent (Lightspeed, Odoo) : seules les pages officielles font foi.
- Kivo n'a pas pu être identifié ; Plazza n'est documenté que par sa propre communication.
- Les articles Kolonell sont des contenus commerciaux d'un prestataire concurrent, cités uniquement à titre d'indice.


---

## Vérification additionnelle — 2026-11-03 (sources primaires)

Cette section complète la collecte du 2 novembre. **Les prix ci-dessous dépendent du pays, de la devise et de la périodicité affichée** et ne constituent pas un devis pour un commerçant guinéen.

| Acteur | Constat vérifié sur le site officiel le 2026-11-03 | Source | Conséquence produit |
|---|---|---|---|
| Loyverse | POS, fidélité, multi-magasins et stock essentiel gratuits ; personnel et stock avancé à 25 USD/mois/magasin chacun sur la page française ; historique illimité à 5 USD/mois/magasin sur cette page | https://loyverse.com/fr/pricing | MakitiPlus doit différencier sa fidélité autrement que par sa simple présence ; comparer le coût total de 3 magasins |
| Odoo | Offre « One App Free » avec utilisateurs illimités ; Standard affiché à partir de 24,90 USD/utilisateur/mois et Custom 49 USD/utilisateur/mois dans le contexte consulté, avec remise initiale et autres affichages possibles | https://www.odoo.com/pricing | Éviter la comparaison « Odoo toujours payant » ; confronter coût de configuration et périmètre réellement utile |
| Odoo POS offline | L'éditeur précise que les commandes hors-ligne restent dans le cache navigateur ; il déconseille fermeture/rechargement et effacement du cache avant synchronisation. Certaines fonctions restent indisponibles hors ligne | https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale/use.html | Tester explicitement fermeture, redémarrage, purge du cache, mise à jour de PWA et reprise du rejet serveur pour MakitiPlus |
| Shopify POS | Page US : forfait Basic à partir de 39 USD/mois en mensuel et option POS Pro de 89 USD/mois **par emplacement** | https://www.shopify.com/pos/pricing | Tester le coût total omnicanal (abonnement, points de vente, transaction, matériel), pas seulement le prix POS |
| Square | Page US : plan gratuit, frais de traitement ; Square prévient que les paiements offline peuvent expirer si la reconnexion n'a pas lieu sous 24 h et que le commerçant supporte les refus | https://squareup.com/us/en/point-of-sale/software/pricing | Distinguer **vente offline enregistrée** et **paiement effectivement garanti** : ne jamais promettre la garantie de paiement sans vérification fournisseur |
| Lightspeed Retail | Page officielle consultée en contexte AUD : Basic 129 AUD/mois, Core 229 AUD/mois, Plus 329 AUD/mois ; tarifs variables par pays | https://www.lightspeedhq.com/pos/retail/pricing/ | Ne pas recycler des prix US/AUD sans préciser la région, la devise et la date |
| Bumpa | Site officiel : Starter 15 000 NGN/trimestre et Pro 30 000 NGN/trimestre ; offre orientée vente en ligne, commandes, clients et collaborateurs | https://www.getbumpa.com/pricing | Tester une expérience catalogue WhatsApp + commande et conversion vers la caisse, pas simplement la parité POS |
| Plazza POS | L'éditeur **annonce** un POS mobile, multi-boutiques, comptabilité OHADA et fonctionnement offline sur sa page d'accueil ; son comparatif/landing peut contenir des indications différentes | https://plazzapos.app/ ; https://plazzapos.app/landing | Le statut offline doit être classé **contradictoire / non validé en essai**, et non « indisponible » de manière certaine |

### Corrections méthodologiques et points de vigilance

1. Ne pas affirmer qu'un concurrent « n'a pas » une fonctionnalité à partir de son absence dans une page marketing. Classer **non confirmé** tant qu'une documentation ou un essai ne l'établit pas.
2. **Paiement ≠ vente** : une vente conservée en IndexedDB et un paiement mobile money/card validé sont deux garanties distinctes. Le marketing « zéro perte » exige preuves d'encaissement, file persistante, sauvegarde, reprise et rapprochement.
3. Les écarts sur les prix Odoo, Loyverse et Lightspeed dans les sections historiques restent des captures/contextes différents. **Cette section n'efface pas les anciennes observations**, elle les précise.
4. Prochaine expérience comparative : 2 appareils, 2 vendeurs, 1 dernier article, déconnexion de 48 h, même vente rejouée 5 fois, redémarrage, mise à jour PWA, client crédité, export complet, restauration sur instance isolée. Publier les résultats et incidents, pas uniquement « test passé ».
5. **Kivo** reste non identifié avec certitude ; aucune comparaison chiffrée ne lui est attribuée.
