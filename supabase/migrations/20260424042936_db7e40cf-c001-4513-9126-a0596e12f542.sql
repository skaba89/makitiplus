-- Table de journal des conflits de synchronisation
CREATE TABLE public.sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL, -- 'product', 'sale', 'profile', 'user_role', 'stock'
  entity_id UUID,
  entity_label TEXT, -- nom lisible (ex: nom du produit)
  device_id TEXT, -- identifiant de l'appareil source
  local_data JSONB,
  remote_data JSONB,
  resolved_data JSONB,
  resolution_strategy TEXT NOT NULL, -- 'last_write_wins', 'merge_delta', 'unique_id', 'manual'
  status TEXT NOT NULL DEFAULT 'resolved', -- 'resolved', 'pending', 'failed'
  error_message TEXT,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;

-- Seul l'admin voit / gère les conflits de toute l'équipe
CREATE POLICY "sync_conflicts_select_admin"
  ON public.sync_conflicts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sync_conflicts_insert_authenticated"
  ON public.sync_conflicts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "sync_conflicts_update_admin"
  ON public.sync_conflicts FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_sync_conflicts_user_acknowledged
  ON public.sync_conflicts (user_id, acknowledged, created_at DESC);

-- Fonction : statut du compte connecté (pour polling client)
CREATE OR REPLACE FUNCTION public.check_account_status()
RETURNS TABLE(is_active boolean, deactivation_reason text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(p.is_active, true) AS is_active,
    p.deactivation_reason
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;

-- Fonction : résolution conflit stock par deltas
-- previous = quantité de référence connue avant édition
-- local_new = quantité après opération locale
-- remote_new = quantité après opération distante
-- résultat = remote_new + (local_new - previous)
CREATE OR REPLACE FUNCTION public.resolve_stock_conflict(
  previous_qty integer,
  local_new_qty integer,
  remote_new_qty integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(0, remote_new_qty + (local_new_qty - previous_qty));
$$;

-- Index pour accélérer les filtres audit
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.user_audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_target_user ON public.user_audit_log (target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.user_audit_log (created_at DESC);