# Étude de cas — Diallo & Frères (BROUILLON INTERNE, NON PUBLIABLE)

## ⚠️ Statut : consentement requis avant toute utilisation externe

Ce document est un **brouillon interne**, à usage strictement interne
(équipe produit/commerciale MakitiPlus). Il ne doit **jamais** être publié,
partagé avec un prospect, ou utilisé en support commercial/marketing tant
que les conditions suivantes ne sont pas remplies :

- [ ] Consentement explicite et écrit du propriétaire de Diallo & Frères
      pour l'utilisation du nom du commerce à des fins commerciales/marketing.
- [ ] Confirmation qu'aucune donnée financière précise (montants de vente
      individuels) ne doit être anonymisée/arrondie avant publication —
      à défaut, arrondir/agréger avant toute diffusion externe.
- [ ] Relecture et validation du contenu final par le propriétaire avant
      publication (aucune citation ne doit lui être attribuée sans qu'il
      l'ait lui-même formulée et validée).
- [ ] Décision sur l'usage ou non du nom réel du commerce vs. une
      dénomination anonymisée ("un commerce pilote à Conakry") si le
      consentement pour le nom réel n'est pas obtenu.

**Tant que ces cases ne sont pas cochées, ce document reste dans
`docs/commercial/` à titre de matériau de travail interne uniquement.**
Aucune citation attribuée au propriétaire n'a été rédigée dans ce
document — uniquement des faits vérifiés en base de données, en lecture
seule, conformément à la protection permanente de ce compte pilote (RULE 1
des audits de hardening).

## Contexte

Diallo & Frères est le premier magasin pilote de MakitiPlus, en usage réel
en production depuis le 12/07/2026. Les données ci-dessous sont vérifiées
directement en base (lecture seule), pas déclaratives.

## Le commerce

- Commerce de détail à Conakry, Guinée.
- Vend des articles de valeur unitaire élevée plutôt que du détail à faible
  marge (montants de vente moyens observés : ~530-580 $US équivalent par
  transaction).
- 2 utilisateurs du système (compte admin + 1 autre profil).

## Ce que les données montrent (vérifié en base, période initiale du pilote)

| Indicateur | Constat |
|---|---|
| Ventes enregistrées | 4 ventes dans les 2 premières semaines d'usage, mix espèces (1) et Orange Money (3) |
| Catalogue produits | 35 références actives |
| Mode de paiement mobile money | Utilisé activement (75% des ventes observées) — confirme la pertinence du paiement Mobile Money pour ce profil de commerce |
| Fiabilité | Aucune vente perdue, aucun montant incohérent, aucune corruption de données observée sur la période auditée |
| Modules encore peu utilisés | Fournisseurs, commandes fournisseurs, dépenses (0 usage à date) — pistes d'accompagnement plutôt que signal négatif |

## Ce que cela démontre (candidat, à valider avec le client)

- MakitiPlus fonctionne en conditions réelles pour un commerce guinéen,
  sans incident de fiabilité sur les transactions enregistrées.
- Le paiement Mobile Money (Orange Money observé ici) est un canal de
  paiement réellement utilisé sur le terrain, pas seulement une case à
  cocher — argument concret pour d'autres prospects utilisant les mêmes
  opérateurs.
- L'app reste utilisable par un commerce à faible volume de transactions
  mais à ticket moyen élevé — un profil différent du commerce de détail à
  fort volume/faible marge souvent pris comme cas d'usage par défaut.

## Ce que ce document n'est pas (limites actuelles, à ne pas déguiser)

- Ce n'est **pas encore** un témoignage — aucune citation du propriétaire
  n'a été recueillie avec son accord dans le cadre de ce document.
- L'usage reste léger (4 ventes sur 2 semaines au moment de l'audit) — trop
  tôt pour prétendre à une validation "sous charge réelle soutenue" ; à
  mettre à jour avec des données plus récentes avant publication.
- Les modules fournisseurs/dépenses n'étant pas utilisés, ce cas ne peut
  pas (encore) servir à démontrer ces fonctionnalités.

## Prochaines étapes avant publication

1. Recontacter le propriétaire du commerce pour discuter d'un partenariat
   de témoignage (transparence totale sur l'usage prévu : site web,
   supports commerciaux, réseaux sociaux — préciser lesquels).
2. Si accord : recueillir une citation authentique de sa part (pas rédigée
   pour lui), avec sa relecture et validation explicite du texte final.
3. Mettre à jour les métriques avec des données plus récentes (idéalement
   après 30 jours d'usage soutenu, cohérent avec le critère de
   "stabilisation" déjà utilisé ailleurs dans la documentation production).
4. Décider du niveau de détail financier acceptable à publier (arrondir/
   agréger les montants si le client préfère ne pas exposer de chiffres
   précis).
5. Une fois toutes les cases de la section "Statut" cochées : déplacer ce
   contenu vers un document marketing distinct, hors de `docs/commercial/`
   (qui reste réservé au matériau de travail interne), et retirer ce
   bandeau d'avertissement.

## Voir aussi

- [`DIALLO_FRERES_PILOT_STATUS.md`](../production/DIALLO_FRERES_PILOT_STATUS.md) — audit technique complet (source des données ci-dessus).
