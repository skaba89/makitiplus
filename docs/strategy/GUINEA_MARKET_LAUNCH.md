# MakitiPlus — Plan de lancement en Guinée

> **Date** : 2026-11-02 · **Point de départ factuel** : un magasin pilote payant (Diallo & Frères, Conakry) en production depuis juillet 2026 ; aucun 2ᵉ magasin onboardé (`docs/production/FIELD_READINESS_AUDIT_2026_08_22.md`).
> Les objectifs chiffrés ci-dessous sont des **hypothèses de travail** à confirmer par la première vague d'entretiens (`CUSTOMER_NEEDS_RESEARCH.md`).

## 1. Conditions d'entrée (portes à franchir dans l'ordre)

| Porte | Critère vérifiable | État au 2026-11-02 |
|---|---|---|
| **P0 fiabilité** | MKP-001 fusionné, migration appliquée, frontend déployé ; 0 vente en file > 24 h sur 14 jours au pilote | En revue (PR ouverte) |
| **Sauvegarde prouvée** | MKP-005 : restauration réelle chronométrée | Non fait |
| **Prix local** | MKP-017 : grille en GNF validée par ≥ 10 entretiens | Non fait (prix affichés en €) |
| **Légal** | CGU et confidentialité finalisées avec raison sociale, RCCM, siège ; relecture juridique | Brouillon (informations entreprise manquantes) |
| **2ᵉ magasin** | `STORE_ONBOARDING_2H_RUNBOOK.md` exécuté sur un vrai client, rapport rédigé | Non fait |
| **Preuve client** | Consentement écrit de Diallo & Frères pour le cas client | Non obtenu |

Tant qu'une porte n'est pas franchie, l'étape suivante n'est pas lancée. Aucune campagne d'acquisition avant les portes P0, sauvegarde et prix local.

## 2. Segments et ordre d'attaque

| Ordre | Segment | Pourquoi | Offre d'entrée |
|---|---|---|---|
| 1 | **Commerces spécialisés de Conakry** (quincaillerie, cosmétiques, pièces détachées, électronique) | Panier moyen élevé, stock à forte valeur, crédit fréquent, propriétaire souvent alphabétisé | Croissance (stock + crédit + clôture de caisse) |
| 2 | **Multi-boutiques et demi-grossistes** (Madina, Kaloum) | Besoin de contrôle à distance et de clôture de caisse ; capacité à payer | Enterprise + accompagnement |
| 3 | **Supérettes de quartier** | Volume ; sensibles au prix | Starter gratuit → conversion par le crédit client |
| 4 | **Villes de l'intérieur** (Kankan, Labé, Nzérékoré, Kindia) | Réseau plus faible : vitrine idéale du hors-ligne | Après preuve à Conakry |

## 3. Proposition de valeur (à tester, pas à déclarer)

1. **« Aucune vente perdue, même sans réseau. »** Ne l'afficher qu'une fois l'indicateur « ventes en file > 24 h » à 0 pendant 30 jours chez au moins 3 magasins.
2. **« Vos dettes clients sous contrôle. »** Crédit par téléphone, relances, balance âgée (MKP-014).
3. **« Payez en GNF, par Orange Money ou MTN MoMo. »** Dépend de MKP-016/017.
4. **« Vos données vous appartiennent. »** Export complet à tout moment (MKP-019).

## 4. Prix (hypothèses à valider)

- Référence de marché documentée : **8 000–20 000 FCFA/mois** pour un SaaS POS au Sénégal [V, contenu d'un prestataire]. Aucun repère public guinéen fiable trouvé.
- Démarche : questions Q19–Q20 du questionnaire, puis test de 2 prix sur 2 groupes de commerçants comparables (sans mentir sur le prix : offre de lancement datée et identique pour tout le groupe).
- Règle : un seul catalogue de prix (table `plans`), en GNF, avec engagement annuel optionnel ; mobile money accepté.

## 5. Distribution

| Canal | Rôle | Coût | Mesure |
|---|---|---|---|
| **Agents terrain** (2 au départ, rémunération fixe + prime à l'activation à 30 jours) | Démonstration, installation (2 h), formation | Moyen | Magasins activés par agent et par semaine |
| **Parrainage commerçant** (1 mois offert au parrain et au filleul) | Confiance entre pairs | Faible | Part des inscriptions parrainées |
| **Associations de commerçants / chambre de commerce** | Crédibilité, sessions collectives | Faible | Inscriptions par session |
| **Fournisseurs et grossistes** | Équiper leurs revendeurs (effet réseau sur les commandes) | Moyen | Revendeurs actifs par grossiste |
| **WhatsApp** (support, tutoriels vidéo courts en français et langues locales) | Rétention, support | Faible | Délai de première réponse, tickets résolus |

## 6. Support et formation

- Support WhatsApp aux heures d'ouverture des marchés (7 h–20 h), délai de première réponse < 30 min (`SUPPORT_RUNBOOK.md`).
- Formation de 2 h à l'installation (`STORE_ONBOARDING_2H_RUNBOOK.md`) + fiches illustrées (`docs/formation/`).
- Vidéos de 60 s : vendre, vendre à crédit, clôturer la caisse, que faire en cas de coupure.

## 7. Tableau de bord du lancement (revue hebdomadaire)

| Indicateur | Définition | Seuil d'alerte |
|---|---|---|
| Ventes en file > 24 h | Mutations critiques non synchronisées depuis plus de 24 h, toutes boutiques | > 0 |
| Activation J7 | ≥ 20 ventes la première semaine | < 50 % |
| Rétention M1 / M3 | Boutiques actives | < 80 % / < 60 % |
| Conversion payante | Payants / actifs à M2 | < 15 % |
| Tickets support / boutique / mois | | > 4 |
| Incidents P0/P1 | Perte de données, fuite, indisponibilité > 30 min | > 0 |

## 8. Objectifs par trimestre (hypothèses)

| Horizon | Objectif | Condition |
|---|---|---|
| T1 (nov. 2026 – janv. 2027) | Portes du §1 franchies ; 30 entretiens ; 5 magasins payants | P0 déployé |
| T2 | 30 magasins payants à Conakry ; rétention M3 ≥ 60 % | Prix GNF + crédit avancé |
| T3 | 100 magasins ; 1 ville de l'intérieur ; paiement mobile money intégré | Contrat agrégateur |
| T4 | 250 magasins ; marge brute positive par magasin (coûts d'hébergement, support, acquisition) | Unit economics mesurées |

## 9. Risques

| Risque | Mitigation |
|---|---|
| Perte de confiance après un incident de données | P0 d'abord ; communication transparente ; export des données |
| Concurrence gratuite (Loyverse) | Se battre sur le crédit, le mobile money, le support local et la fiabilité, pas sur le prix |
| Dépendance à Supabase, Render et Stripe (hors Guinée) | Sauvegardes testées ; plan de sortie documenté ; paiement local pour l'abonnement |
| Réglementation (données personnelles, facturation) | Veille DGI et APDP ; conseil juridique local avant T2 |
| Cas Kippa (produit gratuit sans modèle économique) | Viser des magasins payants dès T1 ; mesurer la marge par magasin |
