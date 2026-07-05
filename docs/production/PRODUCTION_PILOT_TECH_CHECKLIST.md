# MakitiPlus — Checklist technique production pilote

## CI/CD

- [ ] CI verte sur `main` (lint + typecheck + build + tests + audit high)
- [ ] Job E2E pilote passant (si secrets configurés)
- [ ] Render build OK avec `npm ci`

## Base de données

- [ ] Toutes les migrations Supabase sont appliquées
- [ ] Script `validate_sql_migrations.py` passe sans erreur
- [ ] RLS vérifiée sur toutes les tables sensibles (sales, products, organizations, subscriptions)
- [ ] Edge Functions déployées (`create_sale_with_limit`, `admin_update_organization_subscription`, `increment_customer_credit`)
- [ ] RPC `admin_update_organization_subscription` contient `IF NOT public.is_super_admin()`
- [ ] RPC met à jour `subscription_expires_at` correctement

## Sécurité

- [ ] `CRON_SECRET` configuré dans Supabase
- [ ] Aucune clé `.env` commitée (vérifié par CI)
- [ ] Aucun `sk_live_` dans le code (vérifié par CI)
- [ ] Aucun `SUPABASE_SERVICE_ROLE_KEY` réel dans le code (vérifié par CI)
- [ ] Stripe en mode test OU live selon l'environnement
- [ ] Webhook Stripe configuré et testé
- [ ] Sentry configuré (DSN, environment, sample rates)

## Comptes

- [ ] Compte `super_admin` vérifié et fonctionnel
- [ ] Compte admin boutique créé pour le magasin pilote
- [ ] Compte vendeur créé pour le magasin pilote
- [ ] L'admin boutique ne voit PAS "Gestion manuelle des abonnements"
- [ ] Le vendeur n'a accès qu'au POS

## Tests fonctionnels

- [ ] Test POS cash — vente complète réussie
- [ ] Test POS offline — vente hors-ligne, sync à la reconnexion
- [ ] Test synchronisation — vérifier que les ventes offline apparaissent dans les rapports
- [ ] Test reçu — génération PDF et/ou impression
- [ ] Test billing admin — page charge, pas de gestion manuelle visible pour admin boutique
- [ ] Test OrganizationManagement super_admin — page charge, gestion manuelle visible
- [ ] Test devise — les montants sont affichés dans la bonne devise
- [ ] Test taxe — les montants TTC/HT sont corrects si taxe activée

## Monitoring & Sauvegarde

- [ ] Health-check exécuté : `./scripts/health-check.sh https://makitiplus.onrender.com`
- [ ] Sauvegarde Supabase activée (Point-in-Time Recovery)
- [ ] Sentry reçoit les erreurs (vérifier le dashboard)
- [ ] Logs Render accessibles

## Rollback

- [ ] Plan de rollback documenté :
  1. Revenir au commit précédent sur Render (`git revert` + push)
  2. Restaurer la base Supabase depuis le backup PITR si nécessaire
  3. Notifier le magasin pilote du rollback
- [ ] Contact d'urgence du magasin pilote noté
- [ ] Procédure de communication d'incident définie

## Post-déploiement immédiat

- [ ] Vérifier que le site charge sur https://makitiplus.onrender.com
- [ ] Vérifier que le Service Worker s'enregistre
- [ ] Vérifier que le manifest.webmanifest est accessible
- [ ] Vérifier les headers de sécurité (CSP, X-Frame-Options, etc.)
- [ ] Faire un test de vente complet en production
