# MakitiPlus — Feuille de route globale

> **Date** : 2026-11-02 · Document de synthèse. Détails : `PRIORITIZED_BACKLOG.md` (quoi), `GUINEA_MARKET_LAUNCH.md` et `AFRICA_EXPANSION.md` (où), `CUSTOMER_NEEDS_RESEARCH.md` (pourquoi), `COMPETITOR_MATRIX.md` (contre qui), `MAKITIPLUS_GAP_ANALYSIS.md` (d'où l'on part).

## 1. Thèse

Les leaders mondiaux (Shopify, Square, Lightspeed) ne servent pas correctement le commerçant ouest-africain : paiements carte indisponibles, mobile money non intégré, prix en dollars par site, hors-ligne qui reporte le risque de perte sur le commerçant. Les acteurs gratuits (Loyverse) n'ont ni crédit client ni mobile money, et documentent eux-mêmes leurs pertes de reçus hors-ligne. MakitiPlus peut gagner sur **fiabilité hors-ligne + crédit client + paiements locaux + prix local + support local**, à condition de **prouver** chacun de ces points.

**Le leadership se mesure, il ne se déclare pas** : adoption, fiabilité, satisfaction, rétention, rentabilité (§4).

## 2. Horizons

### Horizon 0 — Fondations fiables (novembre–décembre 2026)
- MKP-001 (zéro perte / doublon), MKP-005 (restauration testée), MKP-006 (alignement production), MKP-007 (garde SECURITY DEFINER).
- MKP-003 (crédit atomique), MKP-004 (écran des ventes en file), décision et implémentation MKP-002.
- 30 entretiens commerçants ; décision de prix en GNF (MKP-017).
- **Sortie** : 0 vente en file > 24 h pendant 30 jours au pilote ; restauration chronométrée ; 2ᵉ magasin onboardé.

### Horizon 1 — Leader crédible en Guinée (T1–T2 2027)
- MKP-014 (recouvrement), MKP-019 (réversibilité), MKP-012 (transferts), MKP-011 (fidélité), MKP-008 (coût moyen), MKP-009 (retours), MKP-013 (personnel).
- MKP-016 : premier connecteur mobile money (agrégateur).
- **Sortie** : 30 → 100 magasins payants ; rétention M3 ≥ 60 % ; NPS ≥ 40.

### Horizon 2 — Plateforme commerçant (T3–T4 2027)
- MKP-018 (catalogue WhatsApp), MKP-015 (grossistes), MKP-020 (export comptable), MKP-021 (IA validée et facturable si utile).
- MKP-022 (modèle multi-pays), début de MKP-023 (API).
- **Sortie** : 250 magasins ; marge brute positive par magasin ; architecture prête pour un 2ᵉ pays.

### Horizon 3 — Afrique de l'Ouest (2028)
- Sénégal ou Côte d'Ivoire (choix selon les entretiens et les partenariats de paiement) : Wave, XOF.
- API publique et premiers partenaires (fournisseurs, comptables).
- **Sortie** : 2ᵉ pays avec rétention M3 ≥ 70 %.

### Horizon 4 — Afrique élargie puis international (2029 et après)
- Multi-devises au comptoir (RDC), anglophone (Ghana, Nigeria), diaspora.
- Conformité par région (résidence des données, e-invoicing).

## 3. Ce que nous ne ferons pas (pour l'instant)

- Matériel propriétaire subventionné (leçon Kippa : coût et dévaluation).
- Paiement carte en propre (pas de licence, hors cœur de métier) : intégration via agrégateurs.
- Nouvelles fonctionnalités avant la sortie de l'horizon 0.
- Revendiquer « leader » ou « zéro perte » dans la communication avant que les indicateurs le prouvent.

## 4. Indicateurs de leadership (revue mensuelle)

| Dimension | Indicateur | Source |
|---|---|---|
| Adoption | Magasins actifs (≥ 20 ventes/semaine) ; part des inscriptions issues du parrainage | Base (agrégats sans données personnelles) |
| Fiabilité | Ventes en file > 24 h ; incidents P0/P1 ; disponibilité | File offline (télémétrie anonyme à ajouter), Sentry, monitoring |
| Satisfaction | NPS trimestriel ; délai de première réponse au support | Questionnaire WhatsApp ; outil de support |
| Rétention | Rétention M1/M3/M12 par cohorte | Base |
| Rentabilité | Revenu mensuel récurrent ; marge brute par magasin ; délai de récupération du coût d'acquisition | Facturation, coûts d'infrastructure, coûts terrain |
| Écart concurrentiel | Lignes de `COMPETITOR_MATRIX.md` où MakitiPlus est « au niveau » ou « au-dessus » | Revue trimestrielle de la matrice |

## 5. Gouvernance

- Revue de backlog toutes les 2 semaines : scores recalculés à partir des nouvelles preuves (entretiens, tickets support, télémétrie).
- Matrice concurrentielle et analyse d'écarts mises à jour chaque trimestre (sources datées).
- Toute fusion vers `main` exige une CI verte **et** l'accord explicite du propriétaire du dépôt.
