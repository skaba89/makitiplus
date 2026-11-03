# MKP-005 — Preuve de restauration sur staging (exécution encadrée)

Date : 2026-11-03. Ce chantier prépare la preuve ; **aucun exercice de restauration effectif n'a été réalisé dans cette PR**.

## Préconditions et périmètre
- Créer **deux projets PostgreSQL/Supabase jetables isolés** contenant uniquement des données **synthétiques**. Ne jamais utiliser les données des commerçants pilotes ni les secrets de production.
- Utiliser une identité de base en lecture seule. Le script exécute uniquement des agrégats SELECT, avec `default_transaction_read_only=on` ; il **ne restaure rien**.
- Créer un jeu de référence synthétique, couvrir ventes cash et crédit, articles, magasins et organisations.
- Vérifier séparément que la sauvegarde contient schéma, fonctions, rôles et policies RLS ; les agrégats ne suffisent pas.

## Procédure

1. Sur la base source jetable, renseigner `RESTORE_TEST_DATABASE_URL` avec l'URL de lecture seule (ne pas la mettre en argument CLI, dans les logs ou en Git).
2. Capturer une référence immuable :
   ```bash
   python3 scripts/verify_staging_restore.py --phase capture \
     --baseline /tmp/makitiplus-staging-baseline.json \
     --confirm-isolated-staging STAGING_ONLY
   ```
3. Sauvegarder cette base synthétique avec l'outil approuvé, relever `backup_started_at` et `backup_completed_at` en UTC ; calculer la fraîcheur effective du dernier enregistrement.
4. Déclencher la restauration **manuellement** vers un second projet staging jetable, consigner l'horodatage UTC précis de début et ne jamais cibler la production.
5. Remplacer la variable de connexion par celle du second projet jetable et vérifier :
   ```bash
   python3 scripts/verify_staging_restore.py --phase verify \
     --baseline /tmp/makitiplus-staging-baseline.json \
     --restore-started-at 2026-11-03T10:00:00Z \
     --confirm-isolated-staging STAGING_ONLY
   ```
6. Joindre au ticket #85 un compte rendu : snapshot, décalage des horloges, version des migrations, statut auth/RLS, droits, sommes / comptes, `rto_observed_seconds`, incidents et date de prochain exercice.
7. **RPO n'est PAS mesuré par ce script** : il faut confronter l'horodatage du dernier commit source à celui du dernier commit restauré, avec événements de contrôle indépendants. Ne jamais annoncer un RPO contractuel sur le seul résultat de ce comparateur.

## Critères de sortie
- Tous les compteurs et agrégats comparés concordent ; au moins un test de connexion et d'authentification fonctionne dans l'environnement isolé.
- Une vente à crédit, le mouvement de stock correspondant et son solde sont vérifiés ligne à ligne avec un identifiant de fixture, dans staging uniquement.
- RTO mesuré du déclenchement réel jusqu'à la restauration **et** validation du service utilisable ; le chronométrage du script est un indicateur partiel.
- Une rétention et un RPO observé sont documentés avec horodatages et preuves.
- Aucun accès en écriture aux bases de production ; aucune commande de restauration automatisée par CI.

## Risques et limites
Le script compare des **totaux** qui peuvent masquer des compensations (deux lignes différentes donnant la même somme). Les contrôles transactionnels, contraintes, fonctions et RLS demandent des tests SQL et E2E dédiés après restauration. Les paramètres `--confirm-isolated-staging` sont une confirmation opérateur et ne permettent pas de prouver l'identité du serveur : vérifier la configuration et utiliser une identité strictement read-only.
