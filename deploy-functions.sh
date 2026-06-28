#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# deploy-functions.sh — Déploie toutes les Edge Functions via Supabase CLI
# 
# PRÉREQUIS :
#   1. Installer la CLI : npm install -g supabase
#   2. Se connecter     : supabase login
#   3. Lier le projet   : supabase link --project-ref eiquqawymbgfejwucvyt
#
# UTILISATION :
#   chmod +x deploy-functions.sh
#   ./deploy-functions.sh              # Déploie TOUTES les fonctions
#   ./deploy-functions.sh admin-create-user  # Déploie une seule fonction
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

PROJECT_REF="exxntkuursgwhxvehekr"

# Toutes les fonctions à déployer
ALL_FUNCTIONS=(
  "admin-create-user"
  "admin-export-users-csv"
  "admin-list-user-emails"
  "admin-manage-user"
  "admin-send-reset-link"
  "redeem-reset-token"
  "rotate-test-accounts"
)

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Supabase Edge Functions — Déploiement CLI"
echo "  Projet : $PROJECT_REF"
echo "════════════════════════════════════════════════════════════"
echo ""

# Vérifier que la CLI est installée
if ! command -v supabase &> /dev/null; then
  echo -e "${RED}❌ Supabase CLI non trouvée.${NC}"
  echo "Installez-la : npm install -g supabase"
  exit 1
fi

# Vérifier que le projet est lié
if ! supabase projects list 2>/dev/null | grep -q "$PROJECT_REF"; then
  echo -e "${YELLOW}⚠️  Le projet n'est pas encore lié. Lien en cours...${NC}"
  supabase link --project-ref "$PROJECT_REF"
fi

# Déterminer les fonctions à déployer
if [ $# -gt 0 ]; then
  FUNCTIONS=("$@")
  echo -e "${YELLOW}📋 Déploiement ciblé : ${FUNCTIONS[*]}${NC}"
else
  FUNCTIONS=("${ALL_FUNCTIONS[@]}")
  echo -e "${YELLOW}📋 Déploiement de TOUTES les fonctions (${#FUNCTIONS[@]})${NC}"
fi
echo ""

SUCCESS=0
FAILED=0

for fn in "${FUNCTIONS[@]}"; do
  echo -e "${YELLOW}🚀 Déploiement de ${fn}...${NC}"
  
  if supabase functions deploy "$fn" --project-ref "$PROJECT_REF"; then
    echo -e "${GREEN}✅ ${fn} déployée avec succès${NC}"
    ((SUCCESS++))
  else
    echo -e "${RED}❌ Échec du déploiement de ${fn}${NC}"
    ((FAILED++))
  fi
  echo ""
done

echo "════════════════════════════════════════════════════════════"
echo -e "  ${GREEN}✅ Réussies : $SUCCESS${NC}  |  ${RED}❌ Échouées : $FAILED${NC}"
echo "════════════════════════════════════════════════════════════"
echo ""

if [ $FAILED -gt 0 ]; then
  echo -e "${RED}⚠️  Certaines fonctions ont échoué. Vérifiez les erreurs ci-dessus.${NC}"
  exit 1
else
  echo -e "${GREEN}🎉 Toutes les fonctions sont déployées !${NC}"
  echo ""
  echo "URLs des fonctions :"
  for fn in "${FUNCTIONS[@]}"; do
    echo "  → https://${PROJECT_REF}.supabase.co/functions/v1/${fn}"
  done
fi
