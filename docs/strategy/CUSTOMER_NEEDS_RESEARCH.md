# MakitiPlus — Recherche sur les besoins clients

> **Date** : 2026-11-02. **Statut** : cadre de recherche + premières preuves documentaires. **Aucun entretien commerçant n'a encore été réalisé dans le cadre de ce document.** Les besoins ci-dessous sont classés par niveau de preuve, pas par conviction.

## 1. Niveaux de preuve

| Code | Signification | Poids dans la priorisation |
|---|---|---|
| **R** | Recherche publiée ou statistique officielle (avec méthode connue) | 1,0 |
| **C** | Avis clients ou documentation officielle d'un concurrent qui reconnaît le problème | 0,8 |
| **P** | Observé dans le pilote MakitiPlus (Diallo & Frères) ou dans le code | 0,8 |
| **H** | Hypothèse plausible, **à tester** en entretien ou en pilote | 0,4 |

Un besoin **H** ne peut pas, seul, justifier un développement de plus de 5 jours. Il doit d'abord passer par le questionnaire (§4).

## 2. Contexte documenté

| Fait | Source | Niveau | Limite |
|---|---|---|---|
| Le commerce informel représente 67 % du commerce de détail (Kenya, Nigeria, Afrique du Sud) | Enquête 2022 relayée par [The Star](https://www.the-star.co.ke/news/africa/2022-09-16-shops-still-king-despite-e-commerce-boom-report) | R (secondaire) | Pays anglophones ; rapport original non consulté |
| 24 % des consommateurs achètent régulièrement à crédit dans leur boutique de quartier | Même étude, [Standard Media](https://www.standardmedia.co.ke/sports/amp/enterprise/article/2001456170/why-business-is-brisk-at-corner-shops-in-african-markets) | R (secondaire) | Idem |
| Cahiers de crédit papier perdus (exemple : registre détruit par de l'huile, Sénégal) | [Phys.org/AFP 2017](https://phys.org/news/2017-06-senegal-corner-digital-track.html) | R (reportage) | Anecdotique |
| Guinée : ~18,3 M d'habitants, >14 M de connexions mobiles, ~4 M d'internautes (DataReportal 2025, cité par l'ARPT) | [Forbes Afrique](https://forbesafrique.com/mamady-doumbouya-ceo-de-larpt-le-numerique-guineen-est-entre-dans-une-phase-de-structuration-irreversible/embed/) | R | Ne pas confondre abonnements et utilisateurs |
| Guinée : 7,7 M d'abonnés à l'Internet mobile en 2023 (ARPT) | [Digital Business Africa](https://www.digitalbusiness.africa/guinee-le-taux-dacces-a-internet-progresse-a-33-tandis-que-la-penetration-du-mobile-est-de-79) | R | Abonnements ≠ personnes |
| Orange Money Guinée : 3 M de clients inscrits (2022) | [Guinéenews, communiqué Orange](https://guineenews.org/2022/10/13/guinee-les-services-orange-money-ont-10-ans-communique-de-presse/) | R (communiqué) | Donnée datée |
| TVA Guinée : taux normal 18 %, seuil d'assujettissement cité à 1 Md GNF (CGI art. 359) | [Kintsugi](https://trykintsugi.com/sales-tax-guides/africa/guinea) | C | Guide tiers ; **à confirmer auprès de la DGI** |
| La disparition d'un éditeur peut priver les commerçants de leurs données (Kippa, 2024) | [TechCabal](https://techcabal.com/2024/02/23/kippa-users-left-in-the-dark/) | R (presse) | Un cas |

## 3. Matrice des problèmes

Colonnes : **F** fréquence, **G** gravité, **V** valeur économique (1 à 5, estimées) ; **Preuve** ; **Couverture MakitiPlus** (voir `MAKITIPLUS_GAP_ANALYSIS.md`).

### 3.1 Guinée (cible prioritaire)

| # | Problème | F | G | V | Preuve | Couverture actuelle |
|---|---|---|---|---|---|---|
| G1 | Coupures réseau ou électricité pendant la vente : la caisse doit continuer **sans perdre une vente** | 5 | 5 | 5 | C (Loyverse, Square documentent leurs pertes) + P (code) | Hors-ligne présent ; **4 risques de perte/doublon corrigés dans la PR #fix/offline-sale-zero-loss** |
| G2 | Ventes à crédit aux clients réguliers, suivi des remboursements | 5 | 4 | 5 | R (24 %, pays voisins) + P (fonction utilisée au pilote) | Présent ; **pas de plafond, d'échéance ni de relance automatique** |
| G3 | Encaissement Orange Money / MTN MoMo : rapprochement manuel, erreurs, fraude à la capture d'écran | 4 | 4 | 4 | H (+ C : forums Shopify Guinée) | Référence saisie à la main ; aucune vérification API |
| G4 | Vol ou erreur du personnel (caisse, stock) | 4 | 4 | 4 | H (+ P : clôture de caisse demandée au pilote) | Clôture de caisse + écarts + journal d'audit ; **pas d'annulation contrôlée ni de remise plafonnée par rôle** |
| G5 | Ruptures de stock et surstock, commande fournisseur au jugé | 4 | 3 | 4 | H | Alertes, suggestions de réassort, bons de commande : présents |
| G6 | Prix qui changent souvent (inflation, taux de change GNF) : mise à jour de prix en masse | 3 | 3 | 3 | H | Import produits présent ; **pas de mise à jour en masse par % ni d'historique des prix** |
| G7 | Abonnement affiché en euros ou dollars, paiement par carte peu répandu | 4 | 4 | 4 | P (page d'accueil en €, Stripe) | **Écart** : prix incohérents (29/79 en base, 39,90/99,90 € affichés) ; pas de paiement d'abonnement en mobile money |
| G8 | Vente en gros et au détail dans la même boutique (carton / pièce, prix par quantité) | 3 | 3 | 4 | H | **Absent** |
| G9 | Faible littératie numérique ; téléphone d'entrée de gamme partagé | 4 | 3 | 3 | H | PWA légère, raccourcis ; **pas de mode « caisse simplifiée » ni d'icônes/voix** |
| G10 | Peur de perdre ses données (téléphone volé, éditeur qui disparaît) | 3 | 5 | 4 | C (Loyverse avis) + R (Kippa) | Données serveur ; **pas d'export complet « réversibilité »** |

### 3.2 Afrique (au-delà de la Guinée)

| # | Problème | Preuve | Note |
|---|---|---|---|
| A1 | Multi-devises au comptoir (CDF/USD en RDC, par exemple) | V ([Kolonell Kinshasa](https://kolonell.com/fr/blog/logiciel-caisse-boutique-kinshasa-2026)) | Conversion d'affichage présente ; encaissement multi-devises absent |
| A2 | Wallets dominants différents selon le pays (Wave au Sénégal et en Côte d'Ivoire, M-Pesa en Afrique de l'Est) | V + R | Plaide pour une **couche de connecteurs** (voir `AFRICA_EXPANSION.md`) |
| A3 | Vente via WhatsApp et Instagram (commerce social) | C (Bumpa, 4 M$ levés sur ce besoin) | Catalogue absent |
| A4 | Comptabilité OHADA pour les PME formalisées | V (Plazza) | Export absent |

### 3.3 International

| # | Problème | Preuve |
|---|---|---|
| I1 | Fiscalité par pays (TVA multiple, taxes locales) et e-invoicing obligatoire dans certains pays | H, à cartographier pays par pays |
| I2 | Intégrations (comptabilité, e-commerce, paiement) via API | C (tous les leaders en ont une) |

## 4. Questionnaire commerçant (entretien de 25 minutes)

**Règles** : on interroge sur le **passé récent** (« la dernière fois que… »), jamais sur des intentions (« utiliseriez-vous… »). Pas de démonstration avant la fin. Consentement oral enregistré ; aucune donnée nominative publiée.

**A. Profil (2 min)**
1. Type de commerce, nombre de points de vente, nombre d'employés.
2. Qui tient la caisse la plupart du temps ? Qui fait les comptes ?
3. Téléphone ou appareil utilisé pour le commerce (modèle approximatif, partagé ou non).

**B. Ventes et réseau (5 min)**
4. La dernière fois que le réseau ou le courant a coupé pendant une vente, qu'avez-vous fait ?
5. Avez-vous déjà perdu la trace d'une vente ? Combien de fois le mois dernier ? Quel montant approximatif ?
6. Comment savez-vous en fin de journée combien vous avez vendu ?

**C. Crédit (5 min)**
7. Combien de clients vous doivent de l'argent en ce moment (ordre de grandeur) ?
8. Comment notez-vous les dettes aujourd'hui ? Montrez-moi si possible (cahier, téléphone…).
9. La dernière fois qu'un client a contesté une dette, comment l'avez-vous réglé ?
10. Combien d'argent estimez-vous ne jamais récupérer par an ?

**D. Paiements (4 min)**
11. Part approximative des ventes payées en Orange Money / MTN MoMo / espèces.
12. Comment vérifiez-vous qu'un paiement mobile est réellement arrivé ?
13. Avez-vous déjà été victime d'une fausse preuve de paiement ?

**E. Stock, personnel, fournisseurs (5 min)**
14. La dernière rupture de stock d'un produit important : comment l'avez-vous découverte ?
15. Vendez-vous au carton **et** à la pièce ? Avec quels prix ?
16. Comment contrôlez-vous ce que fait le personnel à la caisse ?
17. Comment passez-vous commande à vos fournisseurs ? Achetez-vous à crédit ?

**F. Outils et budget (4 min)**
18. Quels outils avez-vous essayés (cahier, Excel, Loyverse, autre) ? Pourquoi les avoir gardés ou abandonnés ?
19. Combien payez-vous aujourd'hui pour gérer votre commerce (téléphone, crédit, comptable…) ?
20. Si un outil vous faisait récupérer [montant cité en Q10], combien seriez-vous prêt à payer par mois, et comment (Orange Money, espèces, carte) ?
21. Qu'est-ce qui vous ferait arrêter d'utiliser un logiciel du jour au lendemain ?

**Échantillon cible (première vague)** : 30 commerçants à Conakry (Madina, Kaloum, Matoto, Ratoma), répartis en 10 boutiques de quartier, 10 commerces spécialisés (quincaillerie, cosmétique, pièces auto…), 5 demi-grossistes et grossistes, 5 multi-boutiques. Puis 10 commerçants à Kankan ou Labé pour contrôler le biais de la capitale.

**Sortie attendue** : un tableau anonymisé (une ligne par entretien, une colonne par question) dans `docs/strategy/research/` (à créer après la première vague), et une mise à jour des colonnes F/G/V et des niveaux de preuve de la §3.

## 5. Méthode de priorisation

Pour chaque besoin ou ticket :

```
Score = (F × G × V) × Confiance / Coût
```

- **F, G, V** : 1 à 5 (fréquence, gravité, valeur économique), recalibrés après les entretiens.
- **Confiance** : poids du niveau de preuve (R = 1,0 ; C/P = 0,8 ; H = 0,4).
- **Coût** : 1 (≤ 2 jours), 2 (≤ 1 semaine), 3 (≤ 2 semaines), 5 (≤ 1 mois), 8 (> 1 mois), incluant tests, migration et documentation.

**Garde-fous** (prioritaires sur le score) :
1. Tout risque de **perte ou duplication de vente**, de **fuite inter-organisations** ou d'**écart de stock ou de marge** est P0, quel que soit le score.
2. Un ticket dont la confiance est H et le coût ≥ 3 doit d'abord passer par un test léger (entretien, maquette, ou fonctionnalité derrière drapeau chez un pilote volontaire).
3. Une fonctionnalité n'est « livrée » que si elle est **déployée en production, mesurée et documentée** pour l'utilisateur.

Le backlog priorisé résultant est dans `PRIORITIZED_BACKLOG.md`.

## 6. Indicateurs de validation (preuve d'adoption, pas de déclaration)

| Indicateur | Définition | Cible à 6 mois du lancement Guinée (hypothèse à valider) |
|---|---|---|
| Ventes perdues | Ventes offline jamais synchronisées / ventes offline totales | **0** sur les scénarios testés ; < 0,01 % mesuré en production |
| Activation | Boutiques ayant fait ≥ 20 ventes la 1re semaine / boutiques inscrites | ≥ 60 % |
| Rétention M3 | Boutiques actives au mois 3 / cohorte | ≥ 70 % |
| Conversion payante | Boutiques payantes / boutiques actives | ≥ 25 % |
| Satisfaction | NPS trimestriel (questionnaire WhatsApp) | ≥ 40 |
| Recouvrement | Dette recouvrée à 30 jours (avant / après relances) | +20 % vs référence du commerçant |
