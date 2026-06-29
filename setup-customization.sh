#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# MakitiPlus - Setup Script for Store Customization
# Run this script after deploying the code to complete the setup
# ═══════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "  🏪 MakitiPlus - Configuration de la Personnalisation"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Ce script va effectuer les actions suivantes :"
echo "  1. Exécuter la migration SQL sur Supabase"
echo "  2. Pousser le code sur GitHub"
echo ""

# ═══════════════════════════════════════════════════════════════
# Step 1: Execute Migration SQL on Supabase
# ═══════════════════════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 ÉTAPE 1: Exécuter la migration SQL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Try Supabase CLI first
if command -v supabase &> /dev/null; then
  echo "✅ Supabase CLI détecté"
  
  # Check if logged in
  if supabase projects list &>/dev/null 2>&1; then
    echo "✅ Déjà connecté à Supabase"
    echo "Exécution de la migration..."
    supabase db push --project-ref eiquqawymbgfejwucvyt
    echo -e "${GREEN}✅ Migration exécutée avec succès !${NC}"
  else
    echo "⚠️  Non connecté. Exécutez: supabase login"
    echo "Puis relancez ce script."
    exit 1
  fi
else
  echo -e "${YELLOW}⚠️  Supabase CLI non installé${NC}"
  echo ""
  echo "Options alternatives :"
  echo ""
  echo "  Option A: Installer le CLI Supabase"
  echo "    npm install -g supabase"
  echo "    supabase login"
  echo "    supabase db push --project-ref eiquqawymbgfejwucvyt"
  echo ""
  echo "  Option B: Dashboard SQL Editor (le plus rapide)"
  echo "    1. Ouvrez: https://supabase.com/dashboard/project/eiquqawymbgfejwucvyt/sql"
  echo "    2. Connectez-vous avec votre compte"
  echo "    3. Copiez-collez le contenu du fichier :"
  echo "       supabase/migrations/20260629010000_store_settings_and_default_categories.sql"
  echo "    4. Cliquez sur 'Run'"
  echo ""
  echo "  Option C: Ligne de commande avec psql"
  echo "    psql 'VOTRE_CONNECTION_STRING' -f supabase/migrations/20260629010000_store_settings_and_default_categories.sql"
  echo ""
  
  read -p "Avez-vous exécuté la migration ? (o/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[OoYy]$ ]]; then
    echo "Veuillez exécuter la migration avant de continuer."
    exit 1
  fi
fi

# ═══════════════════════════════════════════════════════════════
# Step 2: Push to GitHub
# ═══════════════════════════════════════════════════════════════

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 ÉTAPE 2: Pousser le code sur GitHub"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$(dirname "$0")/.."

# Check for unpushed commits
UNPUSHED=$(git log origin/main..HEAD --oneline 2>/dev/null | wc -l)

if [ "$UNPUSHED" -gt 0 ]; then
  echo "Il y a $UNPUSHED commit(s) à pousser :"
  git log origin/main..HEAD --oneline
  echo ""
  
  # Try to push
  echo "Tentative de push..."
  if git push 2>&1; then
    echo -e "${GREEN}✅ Code poussé avec succès !${NC}"
  else
    echo -e "${YELLOW}⚠️  Push échoué. Vous avez besoin de configurer vos credentials Git.${NC}"
    echo ""
    echo "Options :"
    echo "  1. Configurer un Personal Access Token GitHub :"
    echo "     https://github.com/settings/tokens"
    echo "     Puis: git remote set-url origin https://VOTRE_TOKEN@github.com/skaba89/makitiplus.git"
    echo "     Et: git push"
    echo ""
    echo "  2. Ou utiliser SSH :"
    echo "     git remote set-url origin git@github.com:skaba89/makitiplus.git"
    echo "     git push"
  fi
else
  echo -e "${GREEN}✅ Le code est déjà à jour sur GitHub${NC}"
fi

# ═══════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🎉 Configuration terminée !"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Ce qui a été ajouté :"
echo "  ✓ Table store_settings (couleurs, logo, nom, template, ticket)"
echo "  ✓ 15 catégories génériques (Alimentaire, Boissons, etc.)"
echo "  ✓ Bucket 'logos' pour l'upload de logos"
echo "  ✓ Triggers auto-création pour les nouvelles organisations"
echo "  ✓ Page Personnalisation dans Paramètres"
echo "  ✓ 5 templates prédéfinis (Classique, Moderne, Minimaliste, Africain, Luxe)"
echo ""
echo "Pour accéder à la personnalisation :"
echo "  1. Connectez-vous à l'app"
echo "  2. Allez dans Paramètres → Personnalisation du magasin"
echo "  3. Configurez vos couleurs, logo et template"
echo ""
