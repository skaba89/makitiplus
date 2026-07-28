# Guide Manager / Admin — Clôture de caisse

## Vue d'ensemble

En tant que manager ou admin, vous avez trois responsabilités sur ce module :
1. **Ouvrir/clôturer votre propre caisse** si vous encaissez vous-même (mêmes étapes qu'un vendeur, voir `CASH_CLOSING_GUIDE_VENDEUR.md`).
2. **Suivre les caisses ouvertes de votre équipe** en temps réel.
3. **Approuver** les clôtures faites par vos vendeurs avant qu'elles soient considérées comme définitives.

## Suivre les caisses ouvertes

Sur **Clôture caisse**, la carte "Caisses ouvertes de l'équipe" liste en direct toutes les sessions actuellement ouvertes dans votre boutique (ou votre organisation si vous êtes admin) : qui a ouvert, à quelle heure, avec quel fond de caisse.

## Approuver une clôture

1. Quand un vendeur clôture sa caisse, elle apparaît dans la carte **"Clôtures en attente d'approbation"**.
2. Vérifiez :
   - Le total par moyen de paiement correspond-il à un volume d'activité cohérent pour ce vendeur/cette période ?
   - L'**écart** (différence entre caisse comptée et caisse attendue) est-il raisonnable ?
   - Le vendeur a-t-il laissé une **note explicative** si l'écart n'est pas nul ?
3. Si tout est cohérent, cliquez **Approuver**. La session passe au statut définitif "Approuvée".
4. Il n'y a pas encore de bouton "Rejeter" dans l'interface — en cas de désaccord ou d'écart suspect, contactez directement le vendeur en dehors de l'application avant d'approuver (ou laissez la session en attente le temps de clarifier).

⚠️ Une fois approuvée, une session ne peut plus être modifiée. Ne cliquez "Approuver" qu'après vérification.

## Consulter l'historique

La carte **Historique** (visible par tous les rôles ayant accès à cette page) montre toutes les sessions passées, scopées selon votre rôle :
- Manager : toutes les sessions de sa boutique.
- Admin : toutes les sessions de l'organisation (toutes boutiques).
- Comptable : consultation seule (mêmes droits de lecture que l'admin, mais ne peut ni clôturer pour un vendeur, ni approuver).

## Exporter

- **Export CSV** : bouton en haut de la carte Historique — exporte la liste actuellement visible (déjà filtrée selon votre rôle) pour analyse dans un tableur.
- **Impression** : disponible sur chaque session individuelle.
- **WhatsApp** : pour partager rapidement un résumé de clôture avec un autre responsable.

## Cas particuliers

**Un vendeur a une caisse bloquée en "ouverte" depuis plusieurs jours (oubli).**
Contactez le vendeur pour qu'il clôture lui-même sa session (avec le montant réel compté ce jour-là si possible, ou en documentant dans les notes que la clôture est tardive). Il n'existe pas de bouton pour fermer une session à la place d'un vendeur — c'est volontaire, pour que ce soit toujours la personne qui a la caisse en main qui certifie le comptage.

**Un manager peut-il clôturer la caisse d'un vendeur à sa place ?**
Non — seul le titulaire de la session (le vendeur qui l'a ouverte) ou un manager/admin agissant explicitement pour lui-même peut la clôturer via l'interface actuelle ; le rôle du manager sur les sessions des autres se limite à **consulter et approuver**, jamais à saisir un montant compté à la place d'un vendeur (le comptage physique doit être fait par la personne responsable de la caisse).

**Le comptable veut clôturer une caisse pour un vendeur absent.**
Non — c'est explicitement interdit par design (rôle "comptable" = consultation/export uniquement). Si un vendeur est absent, c'est au manager ou à l'admin de gérer la situation opérationnellement (pas via une action technique de contournement).

**Le super_admin (support technique MakitiPlus) peut-il intervenir ?**
Le super_admin a un accès **audit uniquement** — il peut consulter toutes les organisations pour du support technique, mais n'ouvre/ne clôture/n'approuve jamais de session opérationnelle réelle.
