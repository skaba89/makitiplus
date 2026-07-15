#!/bin/bash
# ════════════════════════════════════════════════════════════════
# deploy-edge-functions.sh
# Déploie toutes les Edge Functions modifiées sur Supabase
# ════════════════════════════════════════════════════════════════
# Usage :
#   cd makitiplus
#   chmod +x scripts/deploy-edge-functions.sh
#   ./scripts/deploy-edge-functions.sh
#
# Prérequis :
#   - Supabase CLI installé : https://supabase.com/docs/guides/cli
#   - supabase login
#   - supabase link --project-ref <VOTRE_PROJECT_REF>
# ════════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════"
echo "  Déploiement des Edge Functions MakitiPlus"
echo "═══════════════════════════════════════════════════════"
echo ""

# Vérifier que supabase CLI est installé
if ! command -v supabase &> /dev/null; then
  echo "❌ Supabase CLI n'est pas installé."
  echo "   Installez-le : https://supabase.com/docs/guides/cli"
  exit 1
fi

# Vérifier que le projet est lié
if ! supabase projects list 2>/dev/null | grep -q "."; then
  echo "❌ Aucun projet Supabase lié."
  echo "   Exécutez : supabase link --project-ref <VOTRE_PROJECT_REF>"
  exit 1
fi

# Liste des Edge Functions à déployer
# (toutes celles qui dépendent de _shared/orgScope.ts modifié + nouvelles)
FUNCTIONS=(
  "admin-create-user"
  "admin-manage-user"
  "admin-send-reset-link"
  "admin-list-user-emails"
  "admin-export-users-csv"
  "redeem-reset-token"
  "stripe-checkout"
  "stripe-portal"
  "subscription-lifecycle"
)

echo "📋 ${#FUNCTIONS[@]} Edge Functions à déployer :"
for fn in "${FUNCTIONS[@]}"; do
  echo "   • $fn"
done
echo ""

# Demander confirmation
read -p "Continuer le déploiement ? (y/N) " confirm
if [[ "$confirm" != [yY] ]]; then
  echo "Déploiement annulé."
  exit 0
fi

echo ""
echo "🚀 Déploiement en cours..."
echo ""

SUCCESS=0
FAILED=0
FAILED_LIST=()

for fn in "${FUNCTIONS[@]}"; do
  echo "   ⏳ Déploiement de $fn..."
  if supabase functions deploy "$fn" --no-verify-jwt 2>&1 | grep -q "Deployed\|Function\|finished"; then
    echo "   ✅ $fn déployée avec succès"
    ((SUCCESS++))
  else
    echo "   ❌ Échec du déploiement de $fn"
    ((FAILED++))
    FAILED_LIST+=("$fn")
  fi
  echo ""
done

echo "═══════════════════════════════════════════════════════"
echo "  RÉCAPITULATIF"
echo "═══════════════════════════════════════════════════════"
echo "  ✅ Succès : $SUCCESS / ${#FUNCTIONS[@]}"
echo "  ❌ Échecs  : $FAILED / ${#FUNCTIONS[@]}"
if [ $FAILED -gt 0 ]; then
  echo ""
  echo "  Functions en échec :"
  for fn in "${FAILED_LIST[@]}"; do
    echo "     • $fn"
  done
  echo ""
  echo "  💡 Vérifiez les logs : supabase functions logs <function_name>"
fi
echo "═══════════════════════════════════════════════════════"
