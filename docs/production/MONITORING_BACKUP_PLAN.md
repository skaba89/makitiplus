# MakitiPlus — Plan de monitoring et sauvegarde production

## 1. Monitoring Sentry

### Configuration actuelle
- DSN : configuré via `VITE_SENTRY_DSN` dans Render
- Environnement : `production`
- Taux d'échantillonnage : `0.1` (10% des transactions)
- Session replay : `0.05` (5% des sessions)

### Recommandations pour le pilote

#### Augmenter le taux pendant le pilote
Dans Render → Environment :
```
VITE_SENTRY_TRACES_SAMPLE_RATE=0.5
VITE_SENTRY_REPLAY_SAMPLE_RATE=0.1
```

#### Alertes email à configurer
Sur https://sentry.io/settings/{org}/projects/makitiplus/alerts/ :
1. **Alerte critique** : toute nouvelle erreur → email immédiat
2. **Alerte performance** : LCP > 4s → email
3. **Alerte volume** : > 50 erreurs/heure → email
4. **Alerte récupération** : erreur résolue → email (optionnel)

#### Dashboard Sentry à créer
- Graphique : erreurs par jour (30 derniers jours)
- Graphique : LCP, INP, CLS (Web Vitals)
- Tableau : top 10 erreurs par fréquence
- Tableau : pages avec le plus d'erreurs

---

## 2. Sauvegarde Supabase

### Plan Pro (recommandé pour production)
- Sauvegardes automatiques quotidiennes (7 jours de rétention)
- Point-in-time recovery (PITR) jusqu'à 7 jours
- Restauration via Dashboard → Database → Backups

### Vérification mensuelle
1. Premier lundi du mois : tester une restauration en staging
2. Vérifier que les données sont complètes
3. Documenter le temps de restauration
4. Si > 30 minutes : envisager un plan Supabase supérieur

### Sauvegarde manuelle (avant chaque mise à jour)
```bash
# Via Supabase CLI
supabase db dump --data-only > backup_$(date +%Y%m%d).sql

# Ou via Dashboard → Database → Backups → Create backup
```

---

## 3. Health check quotidien

### Script à exécuter chaque matin pendant le pilote
```bash
bash scripts/health-check-post-deployment.sh
```

### Vérifications manuelles
1. Ouvrir https://makitiplus.onrender.com/diagnostic
2. Vérifier que le statut est "Opérationnel"
3. Se connecter en super_admin
4. Vérifier les détails techniques
5. Si erreur : appliquer le fix immédiatement

---

## 4. Monitoring des erreurs côté utilisateur

### Ce que Sentry capture automatiquement
- Erreurs JavaScript non catchées
- Erreurs de requêtes réseau (Failed to fetch)
- Web Vitals (LCP, INP, CLS, TTFB)
- Crashes de page (ErrorBoundary)

### Ce que Sentry ne capture PAS
- Erreurs 400/404 sur les RPC (silencieuses)
- Erreurs 403 sur les edge functions (catchées)

### Ajout de logging custom (à faire)
```typescript
// Dans src/lib/sentry.ts
export function logRpcError(rpcName: string, error: unknown) {
  captureMessage(`RPC ${rpcName} failed`, {
    level: 'warning',
    extra: { error: extractErrorMessage(error) },
  });
}
```

---

## 5. Plan de rollback

### Rollback frontend (Render)
1. Render → Manual Deploy → Deploy previous commit
2. Ou via git : `git revert HEAD --no-edit && git push origin main`

### Rollback DB (Supabase)
1. Supabase Dashboard → Database → Backups
2. Sélectionner la sauvegarde précédente
3. Cliquer "Restore"
4. Temps estimé : 5-15 minutes

### Rollback edge functions
```bash
# Redéployer la version précédente
supabase functions deploy <function-name>
```

---

## 6. Métriques à surveiller pendant le pilote

| Métrique | Objectif | Action si dépassement |
|----------|----------|----------------------|
| Erreurs/jour | < 10 | Investiguer + fix |
| LCP (Loading) | < 2.5s | Optimiser bundle |
| INP (Interactivité) | < 200ms | Optimiser re-renders |
| CLS (Layout shift) | < 0.1 | Fix CSS |
| Uptime Render | > 99.5% | Contacter Render support |
| Uptime Supabase | > 99.9% | Contacter Supabase support |
| Temps de vente POS | < 3s | Optimiser RPC |
| Sync offline | < 10s | Optimiser queue |

---

## 7. Procédure d'incident

### Niveau 1 — Bug non bloquant
1. Utilisateur signale le bug
2. Reproduire en local ou staging
3. Créer un fix sur une branche hotfix
4. Tester + déployer dans les 24h

### Niveau 2 — Bug bloquant (POS ne marche pas)
1. Utilisateur signale via WhatsApp
2. Vérifier si le bug est reproductible
3. Si urgent : rollback au commit précédent
4. Créer le fix
5. Déployer dans les 2h

### Niveau 3 — Service indisponible
1. Vérifier https://makitiplus.onrender.com/diagnostic
2. Vérifier Render status : https://status.render.com
3. Vérifier Supabase status : https://status.supabase.com
4. Si Render down : attendre récupération (généralement < 30 min)
5. Si Supabase down : attendre récupération + vérifier données
6. Communiquer avec les utilisateurs via WhatsApp
