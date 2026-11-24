# Préflight qualité des données historiques — réceptions fournisseurs

**En lecture seule.** Le script `scripts/admin/audit_purchase_receipt_historical_data.sql.example` relève huit catégories de problèmes potentiels dans les commandes et lignes historiques : produit absent, doublons produit par commande, quantités commandées ou reçues incohérentes, références manquantes, organisation ou boutique incompatible avec la commande.

Exécuter ce script sur une base explicitement identifiée avec un compte de lecture seule pour obtenir les comptes anonymisés `affected_rows` et l'indicateur `passed`. **Aucun nettoyage automatique n'est autorisé.**

## Décision de migration

- Tout compteur supérieur à zéro est un blocage à analyser avec le responsable métier et l'équipe Data.
- Définir un correctif de données contrôlé et réversible avant la migration de réception.
- Tester chaque réparation dans une copie isolée, et comparer les soldes, quantités, mouvements et contrats RLS avant/après.
- Conserver les exports de preuves, le plan de sauvegarde/restauration et l'accord de déploiement.
- Une absence d'anomalie dans ce seul audit n'autorise ni le déploiement ni la révocation des anciennes RPC : la compatibilité des PWA et les tests de parcours réels restent bloquants.

Le test natif dépose temporairement une ligne de commande synthétique liée à un produit d'une autre organisation, vérifie que les compteurs organisation/boutique augmentent, puis annule la ligne avant de relire le bilan. Aucun accès aux environnements réels.
