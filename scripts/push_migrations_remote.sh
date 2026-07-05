#!/usr/bin/env bash
# ============================================================
# MakitiPlus — Push all migrations to remote Supabase
#
# Usage:
#   ./scripts/push_migrations_remote.sh
#   SUPABASE_PROJECT_REF=xxx ./scripts/push_migrations_remote.sh
#
# Prerequisites:
#   - supabase CLI installed (npm i -g supabase)
#   - Logged in: supabase login
#   - Project linked: supabase link --project-ref <VOTRE_PROJECT_REF>
#
# This script pushes ALL migration files to the remote Supabase
# project in chronological order. It uses `supabase db push` which
# applies any unapplied migrations (tracks state in supabase_migrations).
#
# If you prefer the SQL Editor approach (dashboard), use the
# _deploy_combined.sql file which contains all migrations in order.
# ============================================================

set -euo pipefail

# Configurable via environment variable
PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
MIGRATIONS_DIR="$(dirname "$0")/../supabase/migrations"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  MakitiPlus — Remote Migration Push                 ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Option 1: Using supabase CLI (recommended)
if command -v supabase &> /dev/null; then
  echo "✓ Supabase CLI found"

  # Check if linked
  if [ ! -f ".supabase/config.toml" ] && [ ! -f "supabase/.temp/project-ref" ]; then
    if [ -z "$PROJECT_REF" ]; then
      echo "ERREUR : SUPABASE_PROJECT_REF non défini pour le lien initial."
      echo "Utilisation : SUPABASE_PROJECT_REF=xxx ./scripts/push_migrations_remote.sh"
      exit 1
    fi
    echo "→ Linking project..."
    supabase link --project-ref "$PROJECT_REF"
  fi

  echo "→ Pushing migrations to remote..."
  supabase db push

  echo ""
  echo "✓ Migrations pushed successfully via CLI"
  echo ""

# Option 2: Using psql directly
elif command -v psql &> /dev/null && [ -n "${SUPABASE_DB_URL:-}" ]; then
  echo "✓ psql found, using direct connection"

  # Apply each migration in order
  for f in $(ls "$MIGRATIONS_DIR"/[0-9]*.sql 2>/dev/null | sort); do
    basename_f=$(basename "$f")
    echo "  → Applying $basename_f..."
    psql "$SUPABASE_DB_URL" -f "$f" 2>&1 | tail -1
  done

  echo ""
  echo "✓ Migrations pushed successfully via psql"

# Option 3: Generate instructions for SQL Editor API
else
  echo "⚠ Neither supabase CLI nor psql found."
  echo ""
  echo "Choose one of these alternatives:"
  echo ""
  echo "1. Install Supabase CLI and run:"
  echo "   npm i -g supabase"
  echo "   supabase login"
  echo "   export SUPABASE_PROJECT_REF=<VOTRE_PROJECT_REF>"
  echo "   supabase link --project-ref \$SUPABASE_PROJECT_REF"
  echo "   supabase db push"
  echo ""
  echo "2. Copy _deploy_combined.sql and paste it in the"
  echo "   Supabase Dashboard → SQL Editor → New Query"
  echo "   https://supabase.com/dashboard/project/<VOTRE_PROJECT_REF>/sql/new"
  echo ""
  echo "3. Set SUPABASE_DB_URL and re-run this script:"
  echo "   export SUPABASE_DB_URL='postgresql://postgres:[PASSWORD]@db.<VOTRE_PROJECT_REF>.supabase.co:5432/postgres'"
  echo "   ./scripts/push_migrations_remote.sh"
  echo ""
fi

echo "══════════════════════════════════════════════════════"
echo "After pushing, verify RPCs exist on remote:"
echo ""
echo "  supabase db execute --sql \"SELECT routine_name FROM information_schema.routines WHERE routine_schema='public' AND routine_type='FUNCTION' ORDER BY routine_name;\""
echo ""
echo "Expected RPCs: check_plan_limit, create_sale_with_limit, get_dashboard_stats,"
echo "  get_top_products, get_payment_history, get_organization_stores, etc."
echo "══════════════════════════════════════════════════════"
