-- ════════════════════════════════════════════════════════════════
-- OPTIONNEL — Backfill cost_price sur les ventes déjà enregistrées
-- Date: 2026-07-20
--
-- ⚠️  Ce script MODIFIE des données réelles (sale_items.cost_price).
-- Ne l'exécutez qu'après avoir lu et compris ce qui suit.
--
-- Contexte : à cause du bug corrigé par
-- 20260720150000_fix_create_full_sale_orphaned_overload.sql, toutes les
-- ventes créées entre le 19/07 (ajout de la colonne cost_price) et
-- l'application de ce correctif ont sale_items.cost_price = 0.
--
-- Ce script les met à jour avec le cost_price ACTUEL du produit
-- (public.products.cost_price) — PAS le prix d'achat réel au moment
-- de CETTE vente historique, qui n'a jamais été enregistré et ne peut
-- plus être retrouvé. C'est une approximation : correcte si le prix
-- d'achat du produit n'a pas changé depuis, imprécise sinon.
--
-- Alternative : ne rien faire — laisser cost_price = 0 sur ces lignes
-- historiques (la marge affichée sur cette petite fenêtre de temps
-- restera surestimée dans les rapports, mais aucune donnée n'est
-- réécrite). Vu que c'est un pilote de quelques jours, l'impact sur le
-- volume de données concerné est probablement faible — à vous de juger.
-- ════════════════════════════════════════════════════════════════

-- Aperçu AVANT modification — combien de lignes seraient touchées, et
-- avec quel écart de marge. Exécutez ceci d'abord pour décider.
SELECT
  COUNT(*) AS lignes_concernees,
  COALESCE(SUM(si.quantity * p.cost_price), 0) AS cout_qui_serait_ajoute
FROM public.sale_items si
JOIN public.products p ON p.id = si.product_id
WHERE si.cost_price = 0
  AND si.created_at >= '2026-07-19'::date;

-- Décommentez et exécutez le bloc ci-dessous pour appliquer le backfill :

-- UPDATE public.sale_items si
-- SET cost_price = COALESCE(p.cost_price, 0)
-- FROM public.products p
-- WHERE si.product_id = p.id
--   AND si.cost_price = 0
--   AND si.created_at >= '2026-07-19'::date;
