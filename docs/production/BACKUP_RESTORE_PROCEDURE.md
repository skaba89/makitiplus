# Procédure de sauvegarde et restauration — MakitiPlus

**Objectif** : Garantir la récupération des données en cas de perte, corruption ou attaque.

---

## 📊 Architecture de sauvegarde

### Sauvegardes automatiques Supabase (incluses)
- **Fréquence** : quotidienne (automatique)
- **Rétention** : 7 jours (plan gratuit), 30 jours (plan Pro)
- **Type** : snapshot complet de la base PostgreSQL
- **Point-in-time recovery (PITR)** : disponible sur plan Pro (récupération à la seconde près)

### Vérifier les backups existants
1. Supabase Dashboard → **Database → Backups**
2. Vérifiez la liste des backups quotidiens
3. Notez la date du dernier backup successful

---

## 🔄 Restauration depuis un backup Supabase

### Cas 1 : Restauration complète (disaster recovery)

⚠️ **Cette opération remplace TOUTE la base actuelle**

1. Supabase Dashboard → **Database → Backups**
2. Sélectionnez le backup à restaurer
3. Cliquez **"Restore"**
4. Confirmez (irréversible)
5. Attendez ~5-15 minutes selon la taille

### Cas 2 : PITR (Point-in-Time Recovery) — plan Pro uniquement

1. Supabase Dashboard → **Database → Backups → Point in Time**
2. Sélectionnez la date/heure exacte (à la seconde près)
3. Cliquez **"Restore to point in time"**
4. Confirmez

### Cas 3 : Restauration manuelle (export SQL)

#### Export manuel
```bash
# Via Supabase CLI
supabase db dump --project-ref exxntkuursgwhxvehekr --data-only > backup_$(date +%Y%m%d).sql

# Ou via pg_dump (si accès direct)
pg_dump "postgresql://postgres:[PASSWORD]@db.exxntkuursgwhxvehekr.supabase.co:5432/postgres" \
  --data-only --no-owner --no-privileges > backup_$(date +%Y%m%d).sql
```

#### Restauration manuelle
```bash
# Via psql
psql "postgresql://postgres:[PASSWORD]@db.exxntkuursgwhxvehekr.supabase.co:5432/postgres" \
  < backup_20260716.sql
```

---

## 📋 Tables critiques à sauvegarder

| Table | Importance | Fréquence backup |
|-------|------------|------------------|
| `auth.users` | Critique (comptes) | Quotidienne |
| `public.profiles` | Critique (profils) | Quotidienne |
| `public.organizations` | Critique (organisations) | Quotidienne |
| `public.stores` | Critique (magasins) | Quotidienne |
| `public.products` | Élevée (catalogue) | Quotidienne |
| `public.sales` + `sale_items` | Élevée (ventes) | Quotidienne |
| `public.user_roles` | Critique (permissions) | Quotidienne |
| `public.subscriptions` | Élevée (abonnements) | Quotidienne |
| `public.categories` | Moyenne (config) | Hebdomadaire |
| `public.customers` | Moyenne (clients) | Quotidienne |
| `public.suppliers` | Moyenne (fournisseurs) | Hebdomadaire |
| `public.expenses` | Moyenne (dépenses) | Quotidienne |
| `public.purchase_orders` | Moyenne (commandes) | Quotidienne |
| `public.user_audit_log` | Critique (audit) | Quotidienne |

---

## 🚨 Procédure de disaster recovery

### Scénario 1 : Perte de données accidentelle (DROP TABLE, DELETE)

1. **NE PANIQUEZ PAS** — ne faites pas d'autres modifications
2. **Identifiez l'étendue** : quelle table, quelle période
3. **Si PITR disponible** (plan Pro) :
   - Restaurez à la seconde avant l'incident
   - Temps de récupération : ~15-30 min
4. **Si pas de PITR** (plan gratuit) :
   - Restaurez le backup quotidien précédent
   - ⚠️ Les données depuis le dernier backup sont perdues (max 24h)
   - Temps de récupération : ~15 min

### Scénario 2 : Corruption de la base

1. Supabase Dashboard → **Database → Health checks**
2. Si corruption confirmée :
   - Restaurez depuis le backup quotidien
   - Vérifiez l'intégrité après restauration

### Scénario 3 : Attaque (compte compromis)

1. **Désactivez le compte compromis** immédiatement
2. **Changez tous les mots de passe** super_admin
3. **Révoquez tous les tokens** (GitHub, Supabase, Stripe)
4. **Vérifiez l'audit log** pour détecter les modifications malveillantes
5. **Restaurez** depuis un backup antérieur à l'attaque si nécessaire
6. **Régénérez les clés** Supabase (Dashboard → Settings → API → Rotate)

---

## ✅ Plan de sauvegarde recommandé

### Quotidien (automatique Supabase)
- Backup complet PostgreSQL à 02:00 UTC
- Vérification automatique de l'intégrité

### Hebdomadaire (manuel)
```bash
# Lundi matin — export manuel de sécurité
supabase db dump --project-ref exxntkuursgwhxvehekr --data-only > weekly_backup_$(date +%Y%m%d).sql

# Stocker sur un cloud sécurisé (Google Drive, Dropbox, etc.)
# Garder 4 semaines de backups hebdomadaires
```

### Mensuel (manuel)
```bash
# 1er du mois — export complet avec schéma
supabase db dump --project-ref exxntkuursgwhxvehekr > monthly_full_$(date +%Y%m).sql

# Stocker sur un cloud sécurisé
# Garder 12 mois de backups mensuels
```

---

## 🧪 Test de restauration (mensuel)

⚠️ **Ne testez JAMAIS sur la base de production**

1. Créez un projet Supabase de test (staging)
2. Restaurez le backup le plus récent sur le projet de test
3. Vérifiez :
   - Nombre d'utilisateurs correct
   - Nombre d'organisations correct
   - Dernières ventes visibles
   - Login fonctionne
4. Si tout est OK → le backup est valide
5. Supprimez le projet de test

---

## 📊 Monitoring des backups

### Vérification quotidienne (automatisable)
```bash
# Script à exécuter chaque matin
#!/bin/bash
# Vérifier le dernier backup Supabase
LAST_BACKUP=$(supabase db dump --project-ref exxntkuursgwhxvehekr --data-only 2>&1 | tail -1)
if [ $? -eq 0 ]; then
  echo "✅ Backup OK — $(date)"
else
  echo "❌ Backup FAIL — $(date)" 
  echo "$LAST_BACKUP"
  # Envoyer une alerte (email, Slack, etc.)
fi
```

### Alertes à configurer
- Backup échoué → alerte immédiate
- Aucun backup depuis 25h → alerte
- Taille du backup anormalement petite (< 50% de la normale) → alerte

---

## 🔐 Sécurité des backups

- **Chiffrement** : les backups Supabase sont chiffrés au repos
- **Accès** : seul le super_admin doit avoir accès aux backups
- **Stockage externe** : stocker une copie hors-ligne (USB, cloud séparé)
- **Rotation** : ne garder que 30 jours de backups (conformité RGPD)

---

## 📋 Checklist mensuelle sauvegarde

- [ ] Backup quotidien Supabase vérifié (Dashboard → Backups)
- [ ] Export hebdomadaire effectué et stocké sur cloud
- [ ] Test de restauration sur projet de test (mensuel)
- [ ] Vérification de l'intégrité (comptes, ventes, etc.)
- [ ] Nettoyage des anciens backups (> 30 jours)
- [ ] Documentation à jour (date du dernier backup successful)
