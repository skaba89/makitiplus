# MakitiPlus — Runbook d'Onboarding Terrain (2 heures)

**À destination de** : la personne MakitiPlus (support/commercial/CS) qui
accompagne un nouveau magasin pilote lors de sa première session avec
l'application, en présentiel ou en visio.

**Objectif** : à la fin de la session, le magasin doit pouvoir encaisser sa
première vente réelle seul, sans assistance.

**Prérequis avant le rendez-vous** :
- [ ] Compte super_admin a créé l'organisation et le compte admin du magasin
      (voir `docs/production/ONBOARDING_ADMIN_ORG.md` pour le guide complet
      destiné à l'admin lui-même — ce runbook est le script de la *session
      d'accompagnement*, pas un remplacement).
- [ ] Identifiants (email + mot de passe temporaire) communiqués au magasin.
- [ ] Devise et pays de l'organisation vérifiés corrects.
- [ ] Connexion internet du magasin testée (mobile data en secours si le
      wifi est absent — l'app fonctionne aussi hors-ligne).

> Ce script est indicatif : un magasin qui va plus vite peut passer à
> l'étape suivante en avance ; un magasin qui a besoin de plus de temps sur
> les fondamentaux (connexion, ajout produit) doit avoir la priorité sur
> ces étapes plutôt que de tout couvrir en surface.

## Minute 0-10 — Accueil et connexion

- Se présenter, expliquer le déroulé de la session (2h, objectif : première
  vente autonome).
- Connexion : `https://makitiplus.onrender.com/auth`, email + mot de passe.
- Faire confirmer par le magasin le nom de la boutique et la devise
  affichés — c'est le moment de corriger une erreur de configuration avant
  d'aller plus loin.
- Montrer où trouver le menu principal et le sélecteur de langue (français
  par défaut, anglais disponible).

## Minute 10-30 — Catégories et premiers produits

- Menu → Catégories : montrer les 10 catégories par défaut, expliquer
  qu'elles sont personnalisables (nom, couleur, icône).
- Faire ajouter **3 à 5 produits réels** du magasin par la personne
  elle-même (pas par vous) : nom, prix de vente, prix d'achat, stock
  initial, unité. L'objectif est qu'elle sache le refaire seule après votre
  départ.
- Si le magasin a un catalogue important (> 20 produits), mentionner
  l'import CSV (Menu → Produits → Importer) plutôt que de tout saisir à la
  main pendant la session — à faire ensemble ou lui laisser en devoir avant
  la prochaine session.

## Minute 30-45 — Utilisateurs (si applicable)

- Si le magasin a des vendeurs en plus de l'admin : Menu → Utilisateurs →
  Ajouter, créer 1 compte vendeur pendant la session pour valider le
  parcours (rôle "vendeur", accès POS uniquement).
- Expliquer la différence de permissions entre admin/manager/vendeur/
  comptable en une phrase par rôle, pas en détail exhaustif à ce stade.

## Minute 45-70 — Première vente au POS

- Ouvrir le POS ensemble.
- Faire réaliser **une vente test avec de vrais produits mais un montant
  symbolique si possible**, ou directement la première vraie vente du jour
  si le timing du rendez-vous le permet.
- Couvrir dans l'ordre : ajouter un produit au panier (scanner code-barres
  si disponible, sinon recherche), modifier la quantité, choisir le mode de
  paiement (espèces vs mobile money — demander lequel le magasin utilise
  réellement, ne pas présumer), encaisser, imprimer/partager le reçu.
- Si mobile money est utilisé : montrer le champ de référence de
  transaction (optionnel) et expliquer pourquoi le renseigner (traçabilité,
  apparaît sur le reçu et les exports).
- Vérifier ensemble que le stock du produit vendu a bien diminué.

## Minute 70-90 — Clôture de caisse

- Expliquer que la clôture se fait normalement en fin de journée, mais la
  montrer maintenant pendant que c'est frais.
- Menu → Clôture de caisse → ouvrir une session de caisse (montant
  d'ouverture) → faire une démonstration du comptage et de la clôture avec
  le montant réel en caisse à ce moment.
- Si l'écart n'est pas zéro (cas fréquent lors d'un premier essai), profiter
  du moment pour expliquer que ce n'est pas bloquant et comment un manager
  approuve une clôture avec écart.

## Minute 90-105 — Mode hors-ligne (si pertinent pour le contexte réseau local)

- Si la connexion internet du magasin est instable : expliquer explicitement
  que l'app continue de fonctionner hors-ligne (ventes enregistrées
  localement, synchronisées à la reconnexion).
- Ne pas couper volontairement le réseau pendant la démo sauf si le magasin
  le demande explicitement — le risque de créer de la confusion dépasse la
  valeur pédagogique dans une première session.

## Minute 105-115 — FAQ et points de contact

- Donner le canal de support (WhatsApp Business recommandé — cohérent avec
  l'usage terrain observé) et le délai de réponse attendu (voir
  [`SUPPORT_RUNBOOK.md`](./SUPPORT_RUNBOOK.md)).
- Répondre aux questions ouvertes du magasin plutôt que de suivre un script
  figé à ce stade — c'est le moment le plus utile pour lever les doutes
  spécifiques à leur activité.

## Minute 115-120 — Clôture de la session

- Résumer les 3 actions que le magasin doit faire seul avant la prochaine
  fois (ex. : ajouter les produits restants, faire ses 2-3 premières vraies
  ventes, tester la clôture de caisse en fin de journée réelle).
- Confirmer la date/canal du prochain point de suivi (recommandé : sous 48h,
  pour lever tout blocage avant qu'il ne décourage l'usage).

## Checklist de fin de session

- [ ] Le magasin s'est connecté seul au moins une fois pendant la session.
- [ ] Au moins 3 produits réels sont dans le catalogue.
- [ ] Une vente réelle ou test a été réalisée par le magasin lui-même (pas
      par vous).
- [ ] Le mode de paiement réellement utilisé par le magasin (espèces et/ou
      mobile money) a été testé.
- [ ] La clôture de caisse a été montrée au moins une fois.
- [ ] Le canal de support et le délai de réponse ont été communiqués.
- [ ] Un prochain point de suivi est planifié.

## Voir aussi

- [`ONBOARDING_ADMIN_ORG.md`](./ONBOARDING_ADMIN_ORG.md) — guide de référence complet, à laisser au magasin après la session.
- [`SUPPORT_RUNBOOK.md`](./SUPPORT_RUNBOOK.md) — pour orienter le magasin en cas de blocage après votre départ.
