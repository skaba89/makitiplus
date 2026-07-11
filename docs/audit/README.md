# Audit de sécurité — 7 juillet 2026

Ce dossier contient les livrables de l'audit de sécurité statique conduit sur le projet MakitiPlus le 7 juillet 2026.

## Livrables

| Fichier | Description |
|---------|-------------|
| `audit-securite-2026-07-07.pdf` | Rapport d'audit complet (26 pages) — synthèse exécutive, méthodologie, findings détaillés par sévérité, plan de remédiation, matrice des risques, annexes |
| `matrice-risques-2026-07-07.xlsx` | Matrice de risques filtrable pour suivi dans Jira/Notion — 22 findings avec colonnes Statut, Assigné à, Date prévue, Date traitée |

## Synthèse

- **22 findings** identifiés : 1 critique, 4 élevés, 7 moyens, 6 faibles, 4 informatifs
- **1 criticité à traiter sous 48h** : CRIT-1 (self-grant super_admin via `register_user` "first admin" exception)
- **Effort total estimé** : ~19 jours-homme à répartir sur 4 semaines
- **3 paliers** : P1 immédiat (cette semaine), P2 court terme (2 semaines), P3 moyen terme (1 mois)

## Méthodologie

Revue statique du code source couvrant 10 dimensions :
1. Authentification et autorisation
2. RLS (Row Level Security) Supabase
3. Fonctions RPC SECURITY DEFINER
4. Edge Functions Deno
5. Sécurité côté client (React, offline queue)
6. Secrets et variables d'environnement
7. En-têtes CSP et de sécurité
8. Validation des entrées
9. Gestion de session
10. Configuration mobile Capacitor

## Utilisation de la matrice Excel

Le fichier `matrice-risques-2026-07-07.xlsx` contient 3 feuilles :

- **Matrice de risques** : 22 findings avec filtres auto sur chaque colonne. Les colonnes `Statut`, `Assigné à`, `Date prévue`, `Date traitée` sont éditables pour le suivi.
- **Synthèse** : répartition par sévérité, plan de remédiation par palier, notes.
- **Légende** : conventions utilisées (sévérités, statuts, effort, responsabilités).

Le statut passe à `Traité` uniquement après déploiement en production **et** validation du test de non-régression associé.

## Référence

- Référence audit : `AUDIT-2026-007`
- Date : 7 juillet 2026
- Périmètre : dépôt GitHub `skaba89/makitiplus` à la date de l'audit
- Audience : équipe dev
