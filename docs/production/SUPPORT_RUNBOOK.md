# MakitiPlus — Runbook Support (Niveau 1 / Niveau 2 / Incident)

**But** : référence opérationnelle pour toute personne qui répond à une
demande d'un magasin pilote ou traite une alerte technique. Détail complet
(checklists de déploiement, monitoring) dans
[`NATIONAL_DEPLOYMENT_RUNBOOK.md`](./NATIONAL_DEPLOYMENT_RUNBOOK.md) §7-8.

## Vue d'ensemble du flux

```
Magasin contacte le support (WhatsApp / téléphone / Slack)
        │
        ▼
   Niveau 1 (terrain) ── résolu ? ──► Oui : clore, documenter si récurrent
        │ non (après 2 tentatives, ou hors FAQ)
        ▼
   Niveau 2 (technique) ── bug confirmé ? ──► Oui, hors périmètre support : escalade Dev
        │
        ▼
   Dev / Ops ── incident P0/P1 ? ──► Oui : procédure d'incident (§4)
```

## Niveau 1 — Support terrain magasin

**Périmètre** : utilisation de l'app (créer un produit, encaisser une
vente...), erreurs de saisie, problèmes réseau/offline, questions
fonctionnelles.

**Délai de réponse** : < 2h ouvrées (lundi-samedi, 8h-18h GMT).

**Canaux** : Slack `#makitplus-support`, email support N1, WhatsApp
Business (recommandé pour le contact direct avec les magasins pilotes,
cohérent avec l'usage réel constaté sur Diallo & Frères — 3 des 4 ventes
observées réglées via Orange Money, l'équipe terrain communique déjà par
WhatsApp).

**Outils** : guide utilisateur MakitiPlus (`docs/production/ONBOARDING_ADMIN_ORG.md`),
FAQ interne, accès en lecture à `public.support_tickets`.

**Script de premier contact** :
1. Identifier le magasin et l'utilisateur (nom, rôle, organisation).
2. Demander une description précise : quelle page, quelle action, quel
   message d'erreur exact (capture d'écran si possible).
3. Vérifier la FAQ / les cas connus avant d'escalader.
4. Si résolu : confirmer avec l'utilisateur, documenter si le cas est
   susceptible de se reproduire (candidat pour la FAQ).
5. Si non résolu après 2 tentatives raisonnables : escalader en Niveau 2
   avec le format ci-dessous.

## Niveau 2 — Support technique

**Périmètre** : erreurs 500/400 récurrentes, sync offline bloquée, bugs
fonctionnels confirmés, extraction de données, problèmes de
permissions/RLS.

**Délai de réponse** : < 4h ouvrées (lundi-vendredi, 9h-18h GMT).

**Canal** : Slack `#makitplus-support` (escalade depuis N1), tickets Jira/Linear.

**Format d'escalade N2 → Dev** :

```
[Ticket #XXX] <titre court>
- Magasin : <nom + store_id>
- Utilisateur : <email>
- Étapes pour reproduire : 1) ... 2) ... 3) ...
- Comportement attendu : ...
- Comportement observé : ...
- Screenshot : <lien>
- Logs Sentry : <lien>
- Fréquence : <une fois / systématique / intermittente>
```

## Escalade — tableau de référence

| Origine   | Destination | Canal                                      | Critère d'escalade                            |
| --------- | ----------- | ------------------------------------------- | ---------------------------------------------- |
| N1 → N2   | Support N2  | Slack `#makitplus-support`                  | Bug confirmé, hors FAQ, après 2 tentatives N1  |
| N2 → Dev  | Développeur | Slack `#makitplus-dev` + ticket             | Bug technique, reproduction requise            |
| N2 → Ops  | On-call     | Slack `#makitplus-incidents` + SMS on-call  | Incident P0/P1 détecté                         |
| Dev → Ops | On-call     | Slack `#makitplus-incidents`                | Décision de rollback ou hotfix production      |

## Sévérités d'incident

| Sévérité | Définition                                             | Délai       | Canal                    |
| -------- | ------------------------------------------------------- | ----------- | ------------------------- |
| P0       | Site inaccessible, données perdues, fuite de données     | Immédiat, 24/7 | Slack + SMS + téléphone |
| P1       | Feature clé cassée (POS, paiement, authentification)    | < 1h        | Slack + SMS               |
| P2       | Bug non-bloquant (reporting, affichage, sync lente)      | < 24h       | Slack                     |
| P3       | Cosmétique (UI/UX, typo, alignement)                     | < 7 jours   | Ticket                    |

En cas de doute entre deux niveaux, choisir le plus élevé — une
réévaluation est toujours possible après diagnostic.

## Procédure d'incident (P0/P1)

1. **Détection** — alerte Sentry OU rapport support N1/N2.
2. **Ticket** — créer `docs/production/incidents/YYYY-MM-DD-PXX.md`.
3. **Communication** — poster dans `#makitplus-status` : « Nous avons
   détecté un problème, résolution en cours. Mise à jour dans 30 minutes. »
4. **Diagnostic** — consolider Render Logs, Sentry, Supabase Logs
   (Database/Auth/Functions).
5. **Fix** — branche `hotfix/<ticket>` → PR → 1 approbation suffit en
   P0/P1 → déploiement (voir §3.2 du runbook national).
6. **Rollback si nécessaire** — voir [`ROLLBACK_PLAN.md`](./ROLLBACK_PLAN.md).
7. **Post-mortem** — sous 72h : timeline, impact, cause racine, actions
   correctives, leçons apprises (template §8.2 du runbook national).

## Règle absolue — magasin pilote Diallo & Frères

Aucune action support (diagnostic, test, reproduction de bug) ne doit
jamais écrire, modifier ou supprimer de données réelles sur l'organisation
Diallo & Frères. Toute vérification doit être en lecture seule (requêtes
`SELECT`, ou transaction `BEGIN...ROLLBACK`). Pour reproduire un bug qui
nécessite des actions d'écriture, utiliser l'organisation de test dédiée
(`E2E_TEST_ORG`).

## Voir aussi

- [`ROLLBACK_PLAN.md`](./ROLLBACK_PLAN.md) — procédure de rollback détaillée.
- [`DAILY_PILOT_MONITORING_CHECKLIST.md`](./DAILY_PILOT_MONITORING_CHECKLIST.md) — détection proactive.
- [`NATIONAL_DEPLOYMENT_RUNBOOK.md`](./NATIONAL_DEPLOYMENT_RUNBOOK.md) — procédure complète.
