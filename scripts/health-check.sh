#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# health-check.sh — Vérifie l'état de santé du déploiement MakitiPlus
#
# Configurable via arguments ou variables d'environnement.
#
# UTILISATION :
#   chmod +x scripts/health-check.sh
#   ./scripts/health-check.sh
#   ./scripts/health-check.sh https://makitiplus.onrender.com <PROJECT_REF> <CRON_SECRET>
#   BASE_URL=https://staging.example.com ./scripts/health-check.sh
#
# ARGUMENTS / ENV VARS :
#   $1 / BASE_URL              — URL de l'app (défaut: https://makitiplus.onrender.com)
#   $2 / SUPABASE_PROJECT_REF  — Référence projet Supabase (aucun défaut, requis pour checks DB)
#   $3 / CRON_SECRET           — Secret cron pour les endpoints authentifiés
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration (arguments > env vars > defaults) ──────────────────────
BASE_URL="${1:-${BASE_URL:-https://makitiplus.onrender.com}}"
SUPABASE_PROJECT_REF="${2:-${SUPABASE_PROJECT_REF:-}}"
CRON_SECRET="${3:-${CRON_SECRET:-}}"
SUPABASE_URL="https://${SUPABASE_PROJECT_REF}.supabase.co"

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[96m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════"
echo "  MakitiPlus — Health Check"
echo "  Frontend: ${BASE_URL}"
if [ -n "$SUPABASE_PROJECT_REF" ]; then
  echo "  Supabase: ${SUPABASE_URL}"
else
  echo "  Supabase: <non configuré>"
fi
echo -e "════════════════════════════════════════════════════════════${NC}"
echo ""

check() {
  local label="$1"
  local url="$2"
  local expected_status="${3:-200}"
  local method="${4:-GET}"
  local extra_headers="${5:-}"
  local body="${6:-}"

  local curl_args=(-s -o /dev/null -w "%{http_code}" -L --max-time 10)

  if [ -n "$body" ]; then
    curl_args+=(-X "$method" -H "Content-Type: application/json")
    if [ -n "$extra_headers" ]; then
      while IFS= read -r hdr; do
        [ -n "$hdr" ] && curl_args+=(-H "$hdr")
      done <<< "$extra_headers"
    fi
    curl_args+=(-d "$body")
  else
    curl_args+=(-X "$method")
    if [ -n "$extra_headers" ]; then
      while IFS= read -r hdr; do
        [ -n "$hdr" ] && curl_args+=(-H "$hdr")
      done <<< "$extra_headers"
    fi
  fi

  response=$(curl "${curl_args[@]}" "$url" 2>/dev/null || echo "000")

  if [ "$response" = "$expected_status" ]; then
    echo -e "  ${GREEN}✅ ${label} → ${response}${NC}"
    ((PASS++))
  elif [ "$response" = "000" ]; then
    echo -e "  ${RED}❌ ${label} → TIMEOUT/UNREACHABLE${NC}"
    ((FAIL++))
  else
    echo -e "  ${RED}❌ ${label} → ${response} (expected ${expected_status})${NC}"
    ((FAIL++))
  fi
}

check_warn() {
  local label="$1"
  local url="$2"
  local expected_status="${3:-200}"

  response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  if [ "$response" = "$expected_status" ]; then
    echo -e "  ${YELLOW}⚠️  ${label} → ${response} (expected, but not blocking)${NC}"
    ((WARN++))
  else
    echo -e "  ${YELLOW}⚠️  ${label} → ${response} (expected ${expected_status}, not blocking)${NC}"
    ((WARN++))
  fi
}

# ── 1. Frontend ──────────────────────────────────────────────────
echo -e "${CYAN}── Frontend (Render) ──${NC}"
check "Page d'accueil (SPA)" "${BASE_URL}" 200

# Vérifier les headers de sécurité
echo -e "${CYAN}── Headers de sécurité ──${NC}"
security_headers=$(curl -sI "${BASE_URL}" 2>/dev/null || echo "")
for header in "X-Content-Type-Options" "X-Frame-Options" "Content-Security-Policy" "Referrer-Policy"; do
  if echo "$security_headers" | grep -qi "$header"; then
    echo -e "  ${GREEN}✅ ${header} présent${NC}"
    ((PASS++))
  else
    echo -e "  ${YELLOW}⚠️  ${header} non visible (peut être appliqué au niveau CDN)${NC}"
    ((WARN++))
  fi
done

# ── 2. Supabase Edge Functions ───────────────────────────────────
if [ -n "$SUPABASE_PROJECT_REF" ]; then
  echo ""
  echo -e "${CYAN}── Edge Functions (Supabase) ──${NC}"

  # rotate-test-accounts — nécessite CRON_SECRET
  if [ -n "$CRON_SECRET" ]; then
    check "rotate-test-accounts (avec CRON_SECRET)" \
      "${SUPABASE_URL}/functions/v1/rotate-test-accounts" \
      200 "POST" "X-Cron-Secret: ${CRON_SECRET}" "{}"
  else
    check_warn "rotate-test-accounts (sans CRON_SECRET — 40x attendu)" \
      "${SUPABASE_URL}/functions/v1/rotate-test-accounts" 401
  fi

  # subscription-lifecycle — nécessite CRON_SECRET
  if [ -n "$CRON_SECRET" ]; then
    check "subscription-lifecycle (avec CRON_SECRET)" \
      "${SUPABASE_URL}/functions/v1/subscription-lifecycle" \
      200 "POST" "Authorization: Bearer ${CRON_SECRET}" "{}"
  else
    check_warn "subscription-lifecycle (sans CRON_SECRET — 40x attendu)" \
      "${SUPABASE_URL}/functions/v1/subscription-lifecycle" 401
  fi

  # stripe-webhook — doit rejeter sans signature
  check "stripe-webhook (sans signature → 401)" \
    "${SUPABASE_URL}/functions/v1/stripe-webhook" \
    401 "POST" "Content-Type: application/json" "{}"

  # stripe-checkout — doit rejeter sans auth
  check "stripe-checkout (sans auth → 401)" \
    "${SUPABASE_URL}/functions/v1/stripe-checkout" \
    401 "POST" "Content-Type: application/json" "{}"

  # stripe-portal — doit rejeter sans auth
  check "stripe-portal (sans auth → 401)" \
    "${SUPABASE_URL}/functions/v1/stripe-portal" \
    401 "POST" "Content-Type: application/json" "{}"
else
  echo ""
  echo -e "  ${YELLOW}⊘ Supabase checks skipped (SUPABASE_PROJECT_REF not set)${NC}"
  ((WARN++))
fi

# ── 3. Performance ───────────────────────────────────────────────
echo ""
echo -e "${CYAN}── Performance ──${NC}"
load_time=$(curl -s -o /dev/null -w '%{time_total}' "${BASE_URL}" 2>/dev/null || echo "99")
load_ms=$(echo "$load_time" | awk '{printf "%.0f", $1 * 1000}' 2>/dev/null || echo "99000")
if [ "${load_ms:-99000}" -lt 3000 ]; then
  echo -e "  ${GREEN}✅ Temps de chargement: ${load_time}s (< 3s)${NC}"
  ((PASS++))
elif [ "${load_ms:-99000}" -lt 5000 ]; then
  echo -e "  ${YELLOW}⚠️  Temps de chargement: ${load_time}s (< 5s, mais > 3s)${NC}"
  ((WARN++))
else
  echo -e "  ${RED}❌ Temps de chargement: ${load_time}s (> 5s — trop lent)${NC}"
  ((FAIL++))
fi

# ── 4. SSL/TLS ──────────────────────────────────────────────────
echo ""
echo -e "${CYAN}── SSL/TLS ──${NC}"
ssl_proto=$(curl -s -o /dev/null -w "%{ssl_protocol}" "${BASE_URL}" 2>/dev/null || echo "none")
if echo "$ssl_proto" | grep -q "TLSv1\.[23]"; then
  echo -e "  ${GREEN}✅ Protocole SSL: ${ssl_proto}${NC}"
  ((PASS++))
else
  echo -e "  ${YELLOW}⚠️  Protocole SSL: ${ssl_proto}${NC}"
  ((WARN++))
fi

hsts=$(curl -s -D - -o /dev/null "${BASE_URL}" 2>/dev/null | grep -i "strict-transport-security" || echo "")
if [ -n "$hsts" ]; then
  echo -e "  ${GREEN}✅ HSTS header présent${NC}"
  ((PASS++))
else
  echo -e "  ${YELLOW}⚠️  HSTS header absent (peut être géré par Cloudflare)${NC}"
  ((WARN++))
fi

# ── Résumé ───────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════"
echo -e "  ${GREEN}✅ Pass: ${PASS}${NC}  ${RED}❌ Fail: ${FAIL}${NC}  ${YELLOW}⚠️  Warn: ${WARN}${NC}"
echo -e "════════════════════════════════════════════════════════════${NC}"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}❌ Health check FAILED — ${FAIL} check(s) en échec${NC}"
  exit 1
else
  echo -e "${GREEN}✅ Health check PASSED — tous les checks critiques sont verts${NC}"
  exit 0
fi
