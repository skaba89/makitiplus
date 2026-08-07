# MakitiPlus — Checklist de Monitoring Quotidien (Phase Pilote)

**But** : liste courte, à cocher chaque matin pendant la phase pilote, pour
détecter un problème avant qu'il ne devienne un incident. Contexte complet
(seuils d'alerte, configuration Sentry) dans
[`NATIONAL_DEPLOYMENT_RUNBOOK.md`](./NATIONAL_DEPLOYMENT_RUNBOOK.md) §4.

**Fréquence** : chaque matin, 7j/7 pendant la phase pilote.
**Durée estimée** : 10-15 minutes.
**Canal de compte-rendu** : `#makitplus-pilot-daily`.

## Checklist

- [ ] **Uptime Render** — vérifier le statut du service (< 99.5% sur 24h =
      signal à investiguer).
- [ ] **Health check automatisé** :
  ```bash
  bash scripts/health-check-post-deployment.sh
  ```
- [ ] **Sentry — erreurs des dernières 24h** :
  - [ ] Nombre total d'erreurs (comparer à la veille).
  - [ ] Nouvelles erreurs (regressions) — priorité immédiate si présentes.
  - [ ] Erreurs 500 (serveur) — seuil d'alerte : > 1/heure.
  - [ ] Taux d'erreur JavaScript — seuil : > 1% des sessions.
- [ ] **Sentry — Web Vitals** :
  - [ ] LCP p75 (seuil : > 4s = alerte).
  - [ ] INP, CLS, TTFB — variations anormales vs la veille.
- [ ] **Ventes par magasin (Supabase)** :
  - [ ] Nombre de ventes du jour vs J-1 (chute > 50% = à investiguer, peut
        indiquer un blocage fonctionnel plutôt qu'une baisse d'activité).
  - [ ] Erreurs de paiement (seuil : > 5/jour).
- [ ] **Synchronisation offline** :
  - [ ] Taux de sync réussi (seuil : < 95% = alerte).
  - [ ] Conflits de sync non résolus depuis plus de 24h.
- [ ] **Latence RPC Supabase** — p95 (seuil : > 1s = alerte).
- [ ] **Tickets support ouverts** — nombre, ancienneté du plus vieux ticket
      non traité.
- [ ] **Alertes Slack non acquittées** (`#makitplus-alerts`) — aucune ne
      doit rester sans réponse plus de 2h en journée ouvrée.

## Si un seuil est dépassé

1. Ne pas ignorer un seul dépassement isolé, mais ne pas non plus déclencher
   une procédure d'incident pour une variation ponctuelle mineure — comparer
   sur 2-3 jours si le signal est net.
2. Si le signal est confirmé ou immédiatement critique (erreur 500 en
   rafale, chute brutale des ventes, site inaccessible) : suivre la
   [procédure d'incident](./SUPPORT_RUNBOOK.md#procédure-dincident-p0p1).
3. Documenter dans `#makitplus-pilot-daily` même les signaux mineurs, pour
   garder une trace historique utile en cas de dégradation progressive.

## Format de compte-rendu quotidien (à poster dans `#makitplus-pilot-daily`)

```
📊 Monitoring quotidien — YYYY-MM-DD

Uptime : OK / dégradé (préciser)
Erreurs Sentry (24h) : N (vs N J-1)
Nouvelles erreurs (regressions) : N
Ventes du jour (par magasin) : ...
Sync offline : OK (X%) / à surveiller
Tickets support ouverts : N (dont N > 24h)
Signaux à suivre : <RAS ou liste>
```

## Règle absolue — magasin pilote Diallo & Frères

Ce monitoring est en lecture seule par construction (dashboards Sentry/
Supabase/Render). Si une investigation nécessite d'interroger directement
la base sur l'organisation Diallo & Frères, utiliser exclusivement des
requêtes `SELECT` ou des transactions `BEGIN...ROLLBACK` — jamais d'écriture.

## Voir aussi

- [`SUPPORT_RUNBOOK.md`](./SUPPORT_RUNBOOK.md) — procédure d'incident si un seuil est dépassé.
- [`ROLLBACK_PLAN.md`](./ROLLBACK_PLAN.md) — si un rollback devient nécessaire.
