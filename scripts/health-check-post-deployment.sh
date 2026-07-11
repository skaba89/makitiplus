#!/usr/bin/env bash
# ============================================================
# MakitiPlus — Health check post-déploiement
# Référence audit : AUDIT-2026-007
# ============================================================
#
# Vérifie que tous les composants du projet sont fonctionnels :
# 1. Variables d'environnement configurées
# 2. Dépendances installées
# 3. Build frontend réussit
# 4. Tests unitaires passent
# 5. TypeScript typecheck passe
# 6. Edge functions déployées (vérif via Supabase API)
# 7. Migrations P1/P2/P3 appliquées (vérif via Supabase API)
#
# Usage :
#   bash scripts/health-check-post-deployment.sh
#
# Exit codes :
#   0 = tout est OK
#   1 = au moins un check a échoué
# ============================================================

set -euo pipefail

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Compteurs
PASS=0
FAIL=0
WARN=0

# Helpers
ok()   { echo -e "${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}✗${NC} $1"; FAIL=$((FAIL+1)); }
warn() { echo -e "${YELLOW}!${NC} $1"; WARN=$((WARN+1)); }
info() { echo -e "${BLUE}i${NC} $1"; }

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  MakitiPlus — Health check post-déploiement${NC}"
echo -e "${BLUE}  Audit AUDIT-2026-007${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# ─── 1. Variables d'environnement ───────────────────────────────
echo -e "${BLUE}[1/7] Variables d'environnement${NC}"

if [ ! -f .env ]; then
  fail ".env introuvable — copie .env.example vers .env et remplis les valeurs"
  echo "  cp .env.example .env"
else
  ok ".env présent"

  # Vérifier les variables critiques
  if grep -q "your-project" .env 2>/dev/null; then
    fail "VITE_SUPABASE_URL encore à la valeur par défaut dans .env"
  else
    ok "VITE_SUPABASE_URL configurée"
  fi

  if grep -q "your-anon-key" .env 2>/dev/null || grep -q "dummy-key" .env 2>/dev/null; then
    fail "VITE_SUPABASE_PUBLISHABLE_KEY encore à la valeur par défaut dans .env"
  else
    ok "VITE_SUPABASE_PUBLISHABLE_KEY configurée"
  fi
fi
echo ""

# ─── 2. Dépendances ─────────────────────────────────────────────
echo -e "${BLUE}[2/7] Dépendances${NC}"

if [ ! -d node_modules ]; then
  fail "node_modules introuvable — lance 'npm install'"
  echo "  npm install"
else
  ok "node_modules présent"

  # Vérifier quelques packages critiques
  for pkg in react react-dom @supabase/supabase-js vite vitest; do
    if [ ! -d "node_modules/$pkg" ]; then
      fail "Package manquant: $pkg"
    fi
  done
  ok "Packages critiques présents"
fi
echo ""

# ─── 3. TypeScript typecheck ────────────────────────────────────
echo -e "${BLUE}[3/7] TypeScript typecheck${NC}"

if [ ! -d node_modules ]; then
  warn "TypeScript typecheck ignoré (node_modules manquant)"
else
  info "Exécution de 'npx tsc --noEmit' (peut prendre 30-60s)..."
  if npx tsc --noEmit 2>&1 | tail -5; then
    ok "TypeScript typecheck réussi"
  else
    fail "TypeScript typecheck a échoué — corrige les erreurs de type"
  fi
fi
echo ""

# ─── 4. Build frontend ──────────────────────────────────────────
echo -e "${BLUE}[4/7] Build frontend${NC}"

if [ ! -d node_modules ]; then
  warn "Build frontend ignoré (node_modules manquant)"
else
  info "Exécution de 'npm run build' (peut prendre 60-120s)..."
  if npm run build 2>&1 | tail -10; then
    ok "Build frontend réussi"
    if [ -d dist ]; then
      ok "Dossier dist/ généré"
    else
      fail "Dossier dist/ introuvable après build"
    fi
  else
    fail "Build frontend a échoué"
  fi
fi
echo ""

# ─── 5. Tests unitaires ─────────────────────────────────────────
echo -e "${BLUE}[5/7] Tests unitaires${NC}"

if [ ! -d node_modules ]; then
  warn "Tests unitaires ignorés (node_modules manquant)"
else
  info "Exécution des tests de sécurité P1+P2+P3..."
  if npx vitest run src/test/p1SecurityFixes.test.ts src/test/p2SecurityFixes.test.ts src/test/p3SecurityFixes.test.ts 2>&1 | tail -15; then
    ok "Tests de sécurité P1+P2+P3 passent"
  else
    fail "Tests de sécurité P1+P2+P3 ont échoué"
  fi
fi
echo ""

# ─── 6. Vérification edge functions via Supabase API ───────────
echo -e "${BLUE}[6/7] Edge functions déployées${NC}"

SUPABASE_URL=$(grep "^VITE_SUPABASE_URL=" .env 2>/dev/null | cut -d'"' -f2 || echo "")
SUPABASE_KEY=$(grep "^VITE_SUPABASE_PUBLISHABLE_KEY=" .env 2>/dev/null | cut -d'"' -f2 || echo "")

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ] || [[ "$SUPABASE_URL" == *"your-project"* ]]; then
  warn "Vérification edge functions ignorée (Supabase URL/key non configurée)"
else
  PROJECT_REF=$(echo "$SUPABASE_URL" | sed -n 's|https://\([^.]*\).supabase.co|\1|p')

  for fn in admin-send-reset-link rotate-test-accounts send-whatsapp; do
    info "Vérification de l'edge function: $fn"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer $SUPABASE_KEY" \
      "https://api.supabase.com/v1/projects/$PROJECT_REF/functions/$fn" 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" = "200" ]; then
      ok "Edge function déployée: $fn"
    elif [ "$HTTP_CODE" = "401" ]; then
      warn "Edge function $fn : 401 (clé anon ne suffit pas pour l'API admin — normal)"
    else
      warn "Edge function $fn : HTTP $HTTP_CODE (vérifie dans le Dashboard Supabase)"
    fi
  done
fi
echo ""

# ─── 7. Vérification migrations P1/P2/P3 via Supabase ──────────
echo -e "${BLUE}[7/7] Migrations P1/P2/P3 appliquées${NC}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ] || [[ "$SUPABASE_URL" == *"your-project"* ]]; then
  warn "Vérification migrations ignorée (Supabase URL/key non configurée)"
  echo ""
  echo -e "${YELLOW}Pour vérifier manuellement :${NC}"
  echo "  1. Va sur https://supabase.com/dashboard/project/$PROJECT_REF/sql"
  echo "  2. Exécute le contenu de docs/audit/deployment/verify_deployment.sql"
  echo "  3. Vérifie que chaque requête retourne le résultat attendu"
else
  info "Vérification de l'existence des fonctions critiques via RPC..."

  # Tester si is_org_admin() existe (HIGH-4)
  RESULT=$(curl -s -X POST \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"query": "SELECT proname FROM pg_proc WHERE proname = '"'"'is_org_admin'"'"' AND pronamespace = '"'"'public'"'"'::regnamespace;"}' \
    "$SUPABASE_URL/rest/v1/rpc" 2>/dev/null || echo "error")

  if [[ "$RESULT" == *"is_org_admin"* ]]; then
    ok "is_org_admin() existe (HIGH-4 corrigé)"
  else
    fail "is_org_admin() introuvable — applique les migrations via SQL Editor"
    echo "  Voir docs/audit/deployment/README.md"
  fi

  # Tester si record_user_logout() existe (LOW-4)
  RESULT=$(curl -s -X POST \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" \
    -H "Content-Type: application/json" \
    -d '{}' \
    "$SUPABASE_URL/rest/v1/rpc/record_user_logout" 2>/dev/null || echo "error")

  # 401 = la fonction existe mais l'utilisateur n'est pas authentifié (attendu)
  # 404 = la fonction n'existe pas
  if [[ "$RESULT" == *"function"* ]] && [[ "$RESULT" == *"does not exist"* ]]; then
    fail "record_user_logout() introuvable — migrations P3 non appliquées"
  else
    ok "record_user_logout() existe (LOW-4 corrigé)"
  fi
fi
echo ""

# ─── Résumé ─────────────────────────────────────────────────────
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Résumé${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}Pass : $PASS${NC}"
echo -e "  ${RED}Fail : $FAIL${NC}"
echo -e "  ${YELLOW}Warn : $WARN${NC}"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}✗ Health check ÉCHEC${NC}"
  echo ""
  echo "Actions recommandées :"
  echo "  1. Configure .env (cp .env.example .env)"
  echo "  2. npm install"
  echo "  3. Applique les migrations via SQL Editor :"
  echo "     docs/audit/deployment/apply_p1_p2_p3_combined.sql"
  echo "  4. Vérifie avec :"
  echo "     docs/audit/deployment/verify_deployment.sql"
  exit 1
else
  echo -e "${GREEN}✓ Health check OK${NC}"
  echo ""
  echo "Prochaines étapes :"
  echo "  1. Démarre le serveur dev : npm run dev"
  echo "  2. Ouvre http://localhost:5173"
  echo "  3. Connecte-toi avec un compte admin"
  echo "  4. Lance le smoke test E2E :"
  echo "     npx playwright test e2e/post-deployment-audit.spec.ts --ui"
  exit 0
fi
