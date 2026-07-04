-- ============================================================
-- Support Client Intégré — tables, enums, RLS, SECURITY DEFINER RPCs
-- ============================================================

-- ─── Enums ──────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM (
    'open', 'in_progress', 'waiting', 'resolved', 'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ticket_priority AS ENUM (
    'low', 'medium', 'high', 'urgent'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ticket_category AS ENUM (
    'technical', 'billing', 'feature_request', 'bug', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sender_type AS ENUM (
    'user', 'admin', 'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Table: support_tickets ─────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_number     text NOT NULL,
  subject           text NOT NULL,
  description       text NOT NULL,
  category          ticket_category NOT NULL DEFAULT 'other',
  priority          ticket_priority NOT NULL DEFAULT 'medium',
  status            ticket_status NOT NULL DEFAULT 'open',
  created_by        uuid NOT NULL REFERENCES auth.users(id),
  assigned_to       uuid REFERENCES auth.users(id),
  resolved_at       timestamptz,
  satisfaction_score integer CHECK (satisfaction_score BETWEEN 1 AND 5),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, ticket_number)
);

-- ─── Table: support_ticket_messages ─────────────────────────
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_id         uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type       sender_type NOT NULL DEFAULT 'user',
  sender_id         uuid REFERENCES auth.users(id),
  sender_name       text,
  message           text NOT NULL,
  attachments       text[] DEFAULT '{}',
  is_read           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_support_tickets_org_status ON support_tickets(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_org_created ON support_tickets(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by ON support_tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON support_ticket_messages(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_org ON support_ticket_messages(organization_id);

-- ─── Updated-at trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_support_tickets_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.support_tickets;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.trg_support_tickets_updated_at();

-- ─── RLS: support_tickets ──────────────────────────────────
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view own tickets"
  ON public.support_tickets FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Org members can create tickets"
  ON public.support_tickets FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Org admins can update tickets"
  ON public.support_tickets FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.is_org_admin() OR created_by = auth.uid())
  );

CREATE POLICY "Org admins can delete tickets"
  ON public.support_tickets FOR DELETE
  USING (
    organization_id = public.get_user_organization_id()
    AND public.is_org_admin()
  );

-- ─── RLS: support_ticket_messages ──────────────────────────
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view ticket messages"
  ON public.support_ticket_messages FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Org members can add messages"
  ON public.support_ticket_messages FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Org admins can update messages"
  ON public.support_ticket_messages FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND public.is_org_admin()
  );

CREATE POLICY "Org admins can delete messages"
  ON public.support_ticket_messages FOR DELETE
  USING (
    organization_id = public.get_user_organization_id()
    AND public.is_org_admin()
  );

-- ─── RPC: generate_ticket_number ────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
  v_next_seq integer;
BEGIN
  v_org_id := public.get_user_organization_id();

  SELECT coalesce(max(
    cast(substring(ticket_number from '[0-9]+$') as integer)
  ), 0) + 1 INTO v_next_seq
  FROM public.support_tickets
  WHERE organization_id = v_org_id;

  RETURN 'TKT-' || lpad(v_next_seq::text, 5, '0');
END;
$$;

-- ─── RPC: create_support_ticket ─────────────────────────────
CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_subject text,
  p_description text,
  p_category ticket_category DEFAULT 'other',
  p_priority ticket_priority DEFAULT 'medium'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_ticket_id uuid;
  v_ticket_num text;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();

  v_ticket_num := public.generate_ticket_number();

  INSERT INTO public.support_tickets (
    organization_id, ticket_number, subject, description,
    category, priority, status, created_by
  ) VALUES (
    v_org_id, v_ticket_num, p_subject, p_description,
    p_category, p_priority, 'open', v_user_id
  ) RETURNING id INTO v_ticket_id;

  -- Auto-create the first message from the description
  INSERT INTO public.support_ticket_messages (
    organization_id, ticket_id, sender_type, sender_id, sender_name, message
  ) VALUES (
    v_org_id, v_ticket_id, 'user', v_user_id,
    (SELECT owner_name FROM public.profiles WHERE user_id = v_user_id),
    p_description
  );

  RETURN jsonb_build_object(
    'id', v_ticket_id,
    'ticket_number', v_ticket_num,
    'status', 'open'
  );
END;
$$;

-- ─── RPC: add_ticket_message ────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_ticket_message(
  p_ticket_id uuid,
  p_message text,
  p_sender_type sender_type DEFAULT 'user'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_msg_id uuid;
  v_sender_name text;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();

  -- Verify ticket belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets
    WHERE id = p_ticket_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found or access denied';
  END IF;

  SELECT owner_name INTO v_sender_name FROM public.profiles WHERE user_id = v_user_id;

  INSERT INTO public.support_ticket_messages (
    organization_id, ticket_id, sender_type, sender_id, sender_name, message
  ) VALUES (
    v_org_id, p_ticket_id, p_sender_type, v_user_id, v_sender_name, p_message
  ) RETURNING id INTO v_msg_id;

  -- If user replies to a resolved/closed ticket, reopen it
  IF p_sender_type = 'user' THEN
    UPDATE public.support_tickets
    SET status = 'open'
    WHERE id = p_ticket_id AND status IN ('resolved', 'closed');
  END IF;

  -- Mark all previous messages as read for this sender type
  IF p_sender_type = 'user' THEN
    UPDATE public.support_ticket_messages
    SET is_read = true
    WHERE ticket_id = p_ticket_id AND sender_type = 'admin' AND is_read = false;
  ELSE
    UPDATE public.support_ticket_messages
    SET is_read = true
    WHERE ticket_id = p_ticket_id AND sender_type = 'user' AND is_read = false;
  END IF;

  RETURN jsonb_build_object('id', v_msg_id);
END;
$$;

-- ─── RPC: update_ticket_status ──────────────────────────────
CREATE OR REPLACE FUNCTION public.update_ticket_status(
  p_ticket_id uuid,
  p_status ticket_status
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  UPDATE public.support_tickets
  SET status = p_status,
      resolved_at = CASE WHEN p_status IN ('resolved', 'closed') THEN now() ELSE NULL END
  WHERE id = p_ticket_id AND organization_id = v_org_id;

  RETURN FOUND;
END;
$$;

-- ─── RPC: get_support_tickets ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_support_tickets(
  p_status ticket_status DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  ticket_number text,
  subject text,
  description text,
  category ticket_category,
  priority ticket_priority,
  status ticket_status,
  organization_id uuid,
  created_by uuid,
  created_by_name text,
  assigned_to uuid,
  assigned_to_name text,
  resolved_at timestamptz,
  message_count bigint,
  has_unread_admin boolean,
  created_at timestamptz,
  updated_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
    SELECT
      t.id,
      t.ticket_number,
      t.subject,
      t.description,
      t.category,
      t.priority,
      t.status,
      t.organization_id,
      t.created_by,
      p1.owner_name AS created_by_name,
      t.assigned_to,
      p2.owner_name AS assigned_to_name,
      t.resolved_at,
      (SELECT count(*) FROM public.support_ticket_messages m WHERE m.ticket_id = t.id),
      EXISTS (
        SELECT 1 FROM public.support_ticket_messages m
        WHERE m.ticket_id = t.id AND m.sender_type = 'admin' AND m.is_read = false
      ),
      t.created_at,
      t.updated_at
    FROM public.support_tickets t
    LEFT JOIN public.profiles p1 ON p1.user_id = t.created_by
    LEFT JOIN public.profiles p2 ON p2.user_id = t.assigned_to
    WHERE t.organization_id = v_org_id
      AND (p_status IS NULL OR t.status = p_status)
    ORDER BY
      CASE t.priority
        WHEN 'urgent' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
      END ASC,
      t.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ─── RPC: get_ticket_messages ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ticket_messages(
  p_ticket_id uuid
)
RETURNS TABLE (
  id uuid,
  ticket_id uuid,
  sender_type sender_type,
  sender_name text,
  message text,
  attachments text[],
  is_read boolean,
  created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  -- Verify ticket belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets
    WHERE id = p_ticket_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found or access denied';
  END IF;

  -- Mark admin messages as read when user views
  UPDATE public.support_ticket_messages
  SET is_read = true
  WHERE ticket_id = p_ticket_id AND sender_type = 'admin' AND is_read = false;

  RETURN QUERY
    SELECT
      m.id,
      m.ticket_id,
      m.sender_type,
      m.sender_name,
      m.message,
      m.attachments,
      m.is_read,
      m.created_at
    FROM public.support_ticket_messages m
    WHERE m.ticket_id = p_ticket_id
    ORDER BY m.created_at ASC;
END;
$$;

-- ─── RPC: get_support_stats ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_support_stats()
RETURNS TABLE (
  total_tickets integer,
  open_tickets integer,
  in_progress_tickets integer,
  resolved_tickets integer,
  avg_resolution_hours numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
    SELECT
      coalesce(sum(1), 0)::integer,
      coalesce(sum(CASE WHEN status = 'open' THEN 1 ELSE 0 END), 0)::integer,
      coalesce(sum(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0)::integer,
      coalesce(sum(CASE WHEN status IN ('resolved', 'closed') THEN 1 ELSE 0 END), 0)::integer,
      coalesce(
        avg(
          CASE WHEN resolved_at IS NOT NULL
            THEN extract(epoch FROM (resolved_at - created_at)) / 3600.0
          END
        ), 0
      )::numeric(10,1)
    FROM public.support_tickets
    WHERE organization_id = v_org_id;
END;
$$;

-- ─── RPC: delete_support_ticket ─────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_support_ticket(
  p_ticket_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := public.get_user_organization_id();

  DELETE FROM public.support_tickets
  WHERE id = p_ticket_id AND organization_id = v_org_id;

  RETURN FOUND;
END;
$$;

-- ─── Enable Realtime for live chat ─────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
