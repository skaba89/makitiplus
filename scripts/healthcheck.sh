#!/bin/bash
# ════════════════════════════════════════════════════════════════
# healthcheck.sh — Vérification post-déploiement MakitiPlus
# ════════════════════════════════════════════════════════════════
# Usage : ./scripts/healthcheck.sh https://makitiplus.onrender.com
# Sortie : 0 = OK, 1 = Échec
# ════════════════════════════════════════════════════════════════

set -euo pipefail

URL="${1:-https://makitiplus.onrender.com}"
PASS=0
FAIL=0
WARN=0

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

check() {
  local name="$1"
  local cmd="$2"
  local expect="$3"
  
  echo -n "  ⏳ $name... "
  if result=$(eval "$cmd" 2>&1); then
    if echo "$result" | grep -q "$expect"; then
      echo -e "${GREEN}✅ OK${NC}"
      ((PASS++))
    else
      echo -e "${RED}❌ FAIL (unexpected response)${NC}"
      echo "      Attendu: $expect"
      echo "      Reçu: $(echo "$result" | head -1)"
      ((FAIL++))
    fi
  else
    echo -e "${RED}❌ FAIL (command error)${NC}"
    echo "      $(echo "$result" | head -1)"
    ((FAIL++))
  fi
}

check_warn() {
  local name="$1"
  local cmd="$2"
  
  echo -n "  ⏳ $name... "
  if eval "$cmd" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ OK${NC}"
    ((PASS++))
  else
    echo -e "${YELLOW}⚠️  WARN${NC}"
    ((WARN++))
  fi
}

echo "═══════════════════════════════════════════════════════"
echo "  Healthcheck MakitiPlus"
echo "  URL: $URL"
echo "═══════════════════════════════════════════════════════"
echo ""

# ════════════════════════════════════════════════════════════════
# 1. Vérifications HTTP de base
# ════════════════════════════════════════════════════════════════
echo "📡 Vérifications HTTP :"
check "Page d'accueil (200)" \
  "curl -s -o /dev/null -w '%{http_code}' $URL/" \
  "200"

check "Page auth (200)" \
  "curl -s -o /dev/null -w '%{http_code}' $URL/auth" \
  "200"

check "Route dashboard (200, SPA rewrite)" \
  "curl -s -o /dev/null -w '%{http_code}' $URL/dashboard" \
  "200"

check "Route POS (200, SPA rewrite)" \
  "curl -s -o /dev/null -w '%{http_code}' $URL/dashboard/pos" \
  "200"

check "Route stores (200, SPA rewrite)" \
  "curl -s -o /dev/null -w '%{http_code}' $URL/dashboard/stores" \
  "200"

echo ""

# ════════════════════════════════════════════════════════════════
# 2. Assets critiques
# ════════════════════════════════════════════════════════════════
echo "📦 Assets critiques :"

# Récupérer le HTML pour trouver les assets
HTML=$(curl -s "$URL/")

# Vérifier qu'un fichier JS principal est présent
JS_FILE=$(echo "$HTML" | grep -oE '/assets/index-[^"]+\.js' | head -1)
if [ -n "$JS_FILE" ]; then
  check "JS principal (200)" \
    "curl -s -o /dev/null -w '%{http_code}' $URL$JS_FILE" \
    "200"
else
  echo -e "  ${RED}❌ JS principal introuvable dans le HTML${NC}"
  ((FAIL++))
fi

# Vérifier le CSS
CSS_FILE=$(echo "$HTML" | grep -oE '/assets/index-[^"]+\.css' | head -1)
if [ -n "$CSS_FILE" ]; then
  check "CSS principal (200)" \
    "curl -s -o /dev/null -w '%{http_code}' $URL$CSS_FILE" \
    "200"
else
  echo -e "  ${YELLOW}⚠️  CSS principal introuvable (peut être inline)${NC}"
  ((WARN++))
fi

echo ""

# ════════════════════════════════════════════════════════════════
# 3. PWA
# ════════════════════════════════════════════════════════════════
echo "📱 PWA :"

check "Service Worker (200)" \
  "curl -s -o /dev/null -w '%{http_code}' $URL/sw.js" \
  "200"

check "Offline page (200)" \
  "curl -s -o /dev/null -w '%{http_code}' $URL/offline.html" \
  "200"

# Vérifier le manifest (peut ne pas exister si manifest: false)
check_warn "Manifest" \
  "curl -s -o /dev/null -w '%{http_code}' $URL/manifest.webmanifest"

echo ""

# ════════════════════════════════════════════════════════════════
# 4. Content checks
# ════════════════════════════════════════════════════════════════
echo "🔍 Contenu :"

check "Titre MakitiPlus" \
  "curl -s $URL/ | grep -o '<title>[^<]*</title>'" \
  "MakitiPlus"

check "Meta viewport (responsive)" \
  "curl -s $URL/ | grep 'viewport'" \
  "width=device-width"

check "Root div (React mount)" \
  "curl -s $URL/ | grep 'id=\"root\"'" \
  "root"

echo ""

# ════════════════════════════════════════════════════════════════
# 5. Performance (warnings only)
# ════════════════════════════════════════════════════════════════
echo "⚡ Performance :"

# Temps de réponse < 3s
RESPONSE_TIME=$(curl -s -o /dev/null -w '%{time_total}' "$URL/" 2>/dev/null || echo "999")
if (( $(echo "$RESPONSE_TIME < 3.0" | bc -l 2>/dev/null || echo 0) )); then
  echo -e "  ${GREEN}✅ Temps de réponse : ${RESPONSE_TIME}s${NC}"
  ((PASS++))
else
  echo -e "  ${YELLOW}⚠️  Temps de réponse lent : ${RESPONSE_TIME}s (> 3s)${NC}"
  ((WARN++))
fi

# Compression gzip
check_warn "Compression gzip" \
  "curl -s -H 'Accept-Encoding: gzip' -o /dev/null -w '%{size_download}' $URL/ | grep -v '0'"

echo ""

# ════════════════════════════════════════════════════════════════
# 6. Sécurité
# ════════════════════════════════════════════════════════════════
echo "🔒 Sécurité :"

# HTTPS
if echo "$URL" | grep -q "^https://"; then
  echo -e "  ${GREEN}✅ HTTPS activé${NC}"
  ((PASS++))
else
  echo -e "  ${RED}❌ HTTPS non activé${NC}"
  ((FAIL++))
fi

# Headers de sécurité (warnings)
check_warn "Header X-Content-Type-Options" \
  "curl -sI $URL/ | grep -i 'x-content-type-options'"

check_warn "Header X-Frame-Options" \
  "curl -sI $URL/ | grep -i 'x-frame-options'"

echo ""

# ════════════════════════════════════════════════════════════════
# Résumé
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════════"
echo "  RÉSUMÉ"
echo "═══════════════════════════════════════════════════════"
echo -e "  ${GREEN}✅ Succès : $PASS${NC}"
echo -e "  ${YELLOW}⚠️  Warnings : $WARN${NC}"
echo -e "  ${RED}❌ Échecs : $FAIL${NC}"
echo "═══════════════════════════════════════════════════════"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo -e "${RED}❌ Healthcheck ÉCHOUÉ — $FAIL vérification(s) en échec${NC}"
  exit 1
else
  echo ""
  echo -e "${GREEN}✅ Healthcheck RÉUSSI${NC}"
  exit 0
fi
