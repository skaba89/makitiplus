#!/usr/bin/env python3
"""
MakitiPlus — Guide de déploiement production
Render + Supabase + configuration complète
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, ListFlowable, ListItem
from reportlab.lib.enums import TA_LEFT, TA_CENTER
import os

OUTPUT = "/home/z/my-project/download/guide_deploiement_makitiplus.pdf"

# Colors
PRIMARY = HexColor("#0F172A")
ACCENT = HexColor("#2563EB")
SUCCESS = HexColor("#16A34A")
WARNING = HexColor("#D97706")
DANGER = HexColor("#DC2626")
GRAY = HexColor("#64748B")
LIGHT_BG = HexColor("#F1F5F9")
WHITE = HexColor("#FFFFFF")

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    topMargin=2*cm,
    bottomMargin=2*cm,
    leftMargin=2.5*cm,
    rightMargin=2.5*cm,
)

styles = getSampleStyleSheet()

# Custom styles
title_style = ParagraphStyle(
    "CustomTitle", parent=styles["Title"],
    fontSize=24, textColor=PRIMARY, spaceAfter=8,
    fontName="Helvetica-Bold",
)
h1_style = ParagraphStyle(
    "H1", parent=styles["Heading1"],
    fontSize=18, textColor=PRIMARY, spaceBefore=20, spaceAfter=10,
    fontName="Helvetica-Bold",
)
h2_style = ParagraphStyle(
    "H2", parent=styles["Heading2"],
    fontSize=14, textColor=ACCENT, spaceBefore=14, spaceAfter=8,
    fontName="Helvetica-Bold",
)
h3_style = ParagraphStyle(
    "H3", parent=styles["Heading3"],
    fontSize=12, textColor=HexColor("#334155"), spaceBefore=10, spaceAfter=6,
    fontName="Helvetica-Bold",
)
body_style = ParagraphStyle(
    "Body", parent=styles["Normal"],
    fontSize=10, leading=14, spaceAfter=6,
    fontName="Helvetica",
)
code_style = ParagraphStyle(
    "Code", parent=styles["Code"],
    fontSize=9, leading=12, backColor=LIGHT_BG,
    fontName="Courier", leftIndent=10, rightIndent=10,
    spaceBefore=4, spaceAfter=4, borderPadding=6,
)
bullet_style = ParagraphStyle(
    "Bullet", parent=body_style,
    leftIndent=20, bulletIndent=10,
)
warning_style = ParagraphStyle(
    "Warning", parent=body_style,
    textColor=DANGER, fontName="Helvetica-Bold",
    spaceBefore=6, spaceAfter=6,
)
success_style = ParagraphStyle(
    "Success", parent=body_style,
    textColor=SUCCESS, fontName="Helvetica-Bold",
    spaceBefore=6, spaceAfter=6,
)

story = []

# ═══ COVER ═══
story.append(Spacer(1, 3*cm))
story.append(Paragraph("MakitiPlus", ParagraphStyle("BigTitle", parent=title_style, fontSize=36)))
story.append(Spacer(1, 0.5*cm))
story.append(Paragraph("Guide de deploiement production", ParagraphStyle("SubTitle", parent=title_style, fontSize=18, textColor=ACCENT)))
story.append(Spacer(1, 1*cm))
story.append(Paragraph("Render + Supabase + Configuration complete", body_style))
story.append(Spacer(1, 0.5*cm))
story.append(Paragraph("Juin 2026 — Version 1.0", ParagraphStyle("Date", parent=body_style, textColor=GRAY)))
story.append(Spacer(1, 2*cm))

# Architecture overview
arch_data = [
    ["Composant", "Service", "Role"],
    ["Frontend (React PWA)", "Render (Static Site)", "Interface utilisateur"],
    ["Base de donnees", "Supabase PostgreSQL", "Stockage + RLS + RPC"],
    ["Authentification", "Supabase Auth", "JWT + R0les + Sessions"],
    ["Edge Functions", "Supabase Functions", "API securisees (Deno)"],
    ["Monitoring", "Sentry", "Erreurs + Performance"],
]
arch_table = Table(arch_data, colWidths=[4*cm, 4*cm, 6*cm])
arch_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("GRID", (0, 0), (-1, -1), 0.5, GRAY),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.append(arch_table)

story.append(PageBreak())

# ═══ STEP 1: SUPABASE ═══
story.append(Paragraph("1. Configuration Supabase", h1_style))

story.append(Paragraph("1.1 Executer les migrations SQL", h2_style))
story.append(Paragraph(
    "Connectez-vous au dashboard Supabase de votre projet (eiquqawymbgfejwucvyt.supabase.co). "
    "Allez dans SQL Editor et executez le script de migration consolide. Ce script cree la fonction "
    "RPC batch_update_stock pour les ventes atomiques, ajoute les 11 cles etrangeres manquantes pour "
    "l'integrite des donnees, renforce les politiques RLS en restreignant les mises a jour aux admins "
    "et managers, et autorise la fonction admin_exists pour les utilisateurs non connectes afin que "
    "l'onglet Premier admin apparaisse.", body_style))
story.append(Spacer(1, 0.3*cm))
story.append(Paragraph(
    "Le fichier se trouve dans le depot : <b>supabase/production_migration.sql</b>",
    body_style))
story.append(Spacer(1, 0.3*cm))
story.append(Paragraph(
    "ATTENTION : Executez ce script en UNE SEULE FOIS dans le SQL Editor de Supabase. "
    "Les erreurs 'duplicate_object' sont normales si certaines contraintes existent deja.",
    warning_style))

story.append(Paragraph("1.2 Configurer les variables d'environnement Edge Functions", h2_style))
story.append(Paragraph(
    "Dans le dashboard Supabase, allez dans Edge Functions puis Settings. Ajoutez les variables "
    "d'environnement suivantes. Ces variables sont critiques pour la securite en production.",
    body_style))

env_data = [
    ["Variable", "Valeur", "Obligatoire"],
    ["ALLOWED_ORIGINS", "https://makitiplus.onrender.com,http://localhost:5173", "OUI"],
    ["CRON_SECRET", "un-secret-aleatoire-32-caracteres-min", "OUI"],
    ["SUPABASE_URL", "https://eiquqawymbgfejwucvyt.supabase.co", "Auto"],
    ["SUPABASE_SERVICE_ROLE_KEY", "(cle service_role de Supabase)", "Auto"],
]
env_table = Table(env_data, colWidths=[4.5*cm, 6*cm, 2.5*cm])
env_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("GRID", (0, 0), (-1, -1), 0.5, GRAY),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.append(env_table)

story.append(Spacer(1, 0.3*cm))
story.append(Paragraph(
    "ALLOWED_ORIGINS definit les domaines autorises pour les requetes CORS. Sans cette variable, "
    "les edge functions bloqueront les appels depuis votre frontend en production. CRON_SECRET "
    "protege la fonction rotate-test-accounts contre les appels non autorises. Generez un secret "
    "aleatoire avec : openssl rand -hex 32",
    body_style))

story.append(Paragraph("1.3 Configurer le cron job pg_cron", h2_style))
story.append(Paragraph(
    "Dans le SQL Editor, verifiez que le cron job de rotation des comptes test est actif. "
    "Si ce n'est pas le cas, executez la migration qui planifie l'execution quotidienne a 03h00 UTC "
    "de la fonction rotate-test-accounts. Vous pouvez aussi l'invoquer manuellement via curl avec "
    "le X-Cron-Secret configure ci-dessus.",
    body_style))

# ═══ STEP 2: RENDER ═══
story.append(Paragraph("2. Deploiement sur Render", h1_style))

story.append(Paragraph("2.1 Creer le compte et connecter le depot", h2_style))
story.append(Paragraph(
    "Rendez-vous sur render.com et creez un compte. Connectez votre compte GitHub et selectionnez "
    "le depot skaba89/makitiplus. Render detectera automatiquement le fichier render.yaml a la "
    "racine du projet qui configure le site statique avec les bonnes commandes de build.",
    body_style))

story.append(Paragraph("2.2 Configuration du service statique", h2_style))
story.append(Paragraph(
    "Render va automatiquement creer un service statique base sur le fichier render.yaml. Voici les "
    "parametres verifies et configures dans ce fichier :",
    body_style))

render_data = [
    ["Parametre", "Valeur"],
    ["Type", "Static Site (Web)"],
    ["Runtime", "Static"],
    ["Build Command", "npm install && npm run build"],
    ["Publish Directory", "dist"],
    ["Node Version", "20"],
]
render_table = Table(render_data, colWidths=[4*cm, 9*cm])
render_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("GRID", (0, 0), (-1, -1), 0.5, GRAY),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.append(render_table)

story.append(Paragraph("2.3 Variables d'environnement Render", h2_style))
story.append(Paragraph(
    "Dans les parametres du service sur Render, ajoutez les variables d'environnement suivantes. "
    "Ces variables sont necessaires au fonctionnement de l'application en production. Elles correspondent "
    "aux variables du fichier .env mais avec les valeurs de production.",
    body_style))

render_env_data = [
    ["Variable", "Valeur"],
    ["VITE_SUPABASE_URL", "https://eiquqawymbgfejwucvyt.supabase.co"],
    ["VITE_SUPABASE_PROJECT_ID", "eiquqawymbgfejwucvyt"],
    ["VITE_SUPABASE_PUBLISHABLE_KEY", "(cle anon de Supabase)"],
    ["VITE_SENTRY_DSN", "(votre DSN Sentry, ou vide pour desactiver)"],
    ["VITE_SENTRY_ENVIRONMENT", "production"],
    ["VITE_SENTRY_TRACES_SAMPLE_RATE", "0.1"],
    ["VITE_SENTRY_REPLAY_SAMPLE_RATE", "0.05"],
]
render_env_table = Table(render_env_data, colWidths=[5.5*cm, 7.5*cm])
render_env_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("GRID", (0, 0), (-1, -1), 0.5, GRAY),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.append(render_env_table)

story.append(Paragraph("2.4 Domaine personnalise (optionnel)", h2_style))
story.append(Paragraph(
    "Render attribue un sous-domaine par defaut (makitiplus.onrender.com). Pour un domaine "
    "personnalise comme makitiplus.com, ajoutez-le dans les parametres du service puis configurez "
    "les enregistrements DNS chez votre registrateur : un enregistrement CNAME pointant vers "
    "makitiplus.onrender.com. Render genere automatiquement un certificat SSL via Let's Encrypt.",
    body_style))

story.append(Paragraph(
    "IMPORTANT : Si vous ajoutez un domaine personnalise, n'oubliez pas de mettre a jour "
    "la variable ALLOWED_ORIGINS dans les Edge Functions Supabase pour inclure votre nouveau domaine.",
    warning_style))

# ═══ STEP 3: VERIFICATION ═══
story.append(Paragraph("3. Verification post-deploiement", h1_style))

story.append(Paragraph("3.1 Checklist de verification", h2_style))

checks = [
    "La page d'accueil s'affiche avec le branding MakitiPlus et les tarifs en GNF",
    "L'onglet 'Inscription' (Premier admin) est visible si aucun admin n'existe",
    "Apres creation du premier admin, l'onglet disparait et seul 'Connexion' reste",
    "La connexion fonctionne et redirige vers le Dashboard",
    "Le POS fonctionne : ajout au panier, paiement, generation de recu PDF",
    "Les produits se creent et s'affichent correctement",
    "Les categories sont gérables (admin/manager uniquement)",
    "La gestion des clients et credits fonctionne",
    "Les depenses s'enregistrent correctement",
    "Les rapports affichent les graphiques de ventes",
    "La page Utilisateurs permet de creer des comptes (vendeur, manager, comptable)",
    "Le mode hors-ligne fonctionne : le service worker est actif",
    "Les edge functions repondent sans erreur CORS",
]
for i, check in enumerate(checks, 1):
    story.append(Paragraph(f"{i}. {check}", bullet_style))

story.append(Paragraph("3.2 Test des edge functions", h2_style))
story.append(Paragraph(
    "Pour verifier que les edge functions sont accessibles et que CORS est correctement configure, "
    "executez les commandes suivantes depuis votre terminal local. Remplacez l'URL par celle de votre "
    "projet Supabase. Un code 200 ou 405 confirme que la fonction est accessible. Un code 403 ou CORS "
    "error indique un probleme de configuration ALLOWED_ORIGINS.",
    body_style))
story.append(Spacer(1, 0.3*cm))
story.append(Paragraph(
    "curl -X POST https://eiquqawymbgfejwucvyt.supabase.co/functions/v1/rotate-test-accounts "
    '-H "X-Cron-Secret: votre-secret" -H "Content-Type: application/json"',
    code_style))

# ═══ STEP 4: MONITORING ═══
story.append(Paragraph("4. Monitoring et maintenance", h1_style))

story.append(Paragraph("4.1 Sentry", h2_style))
story.append(Paragraph(
    "Si vous avez configure un projet Sentry et entre le DSN dans les variables d'environnement, "
    "toutes les erreurs React seront automatiquement capturees. Vous pourrez voir les erreurs en "
    "temps reel, les replays de session, et les performances. Le taux d'echantillonnage est configure "
    "a 10% pour les traces et 5% pour les replays afin de rester dans le plan gratuit Sentry.",
    body_style))

story.append(Paragraph("4.2 Sauvegarde de la base de donnees", h2_style))
story.append(Paragraph(
    "Supabase ne propose pas de sauvegarde automatique sur le plan gratuit. Il est fortement "
    "recommande de configurer des sauvegardes regulieres. Utilisez pg_dump via Supabase CLI :",
    body_style))
story.append(Spacer(1, 0.2*cm))
story.append(Paragraph(
    "supabase db dump --project-id eiquqawymbgfejwucvyt -f backup_$(date +%Y%m%d).sql",
    code_style))
story.append(Spacer(1, 0.2*cm))
story.append(Paragraph(
    "Programmez cette commande via un cron job quotidien. Stockez les sauvegardes dans un "
    "emplacement securise (S3, Google Cloud Storage, ou un serveur distant). Conservez au "
    "minimum 7 jours de sauvegardes.",
    body_style))

story.append(Paragraph("4.3 Limites du plan gratuit Supabase", h2_style))

limits_data = [
    ["Ressource", "Limite", "Impact"],
    ["Base de donnees", "500 MB", "Suffisant pour debuter, monitorer la taille"],
    ["Edge Functions", "500K appels/mois", "~16K/jour, ok pour un commerce"],
    ["Stockage fichiers", "1 GB", "Non utilise actuellement"],
    ["Authentification", "50 000 MAU", "Tres large marge"],
    ["Bandwidth", "5 GB/mois", "Suffisant pour un site statique"],
]
limits_table = Table(limits_data, colWidths=[3.5*cm, 3.5*cm, 6*cm])
limits_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("GRID", (0, 0), (-1, -1), 0.5, GRAY),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.append(limits_table)

# ═══ STEP 5: NEON SQL ═══
story.append(Paragraph("5. Optionnel : Migration vers Neon SQL", h1_style))

story.append(Paragraph(
    "Vous avez mentionne vouloir combiner Render avec Neon SQL. Voici les considerations importantes "
    "pour cette migration. Actuellement, MakitiPlus utilise Supabase comme backend complet incluant "
    "la base de donnees PostgreSQL, l'authentification, les Edge Functions et les politiques RLS.",
    body_style))

story.append(Paragraph("5.1 Pourquoi garder Supabase (recommande)", h2_style))
story.append(Paragraph(
    "Supabase fournit un ecosysteme integre qui est profondement utilise par MakitiPlus. La base de "
    "donnees PostgreSQL de Supabase contient non seulement les donnees mais aussi les fonctions RPC "
    "(batch_update_stock, admin_exists, has_role), les politiques RLS qui securisent chaque table, "
    "les triggers et les cron jobs pg_cron. L'authentification Supabase Auth genere les JWT utilises "
    "par les politiques RLS pour le controle d'acces. Les Edge Functions utilisent le service_role "
    "pour les operations admin. Separer la base de donnees vers Neon casserait toutes ces integrations "
    "et necessiterait une refonte majeure de l'architecture.",
    body_style))

story.append(Paragraph("5.2 Architecture si Neon SQL est necessaire", h2_style))
story.append(Paragraph(
    "Si vous souhaitez tout de meme utiliser Neon SQL, voici l'architecture a mettre en place. "
    "Neon fournit uniquement un PostgreSQL serverless sans authentification ni edge functions. "
    "Il faudrait donc garder Supabase pour l'auth et les edge functions, ou migrer vers une "
    "solution alternative comme NextAuth pour l'authentification et un backend Node.js sur Render "
    "pour les API. Cette migration represente environ 2 a 3 semaines de travail.",
    body_style))

neon_arch = [
    ["Composant", "Actuel (Supabase)", "Alternative Neon"],
    ["Base de donnees", "Supabase Postgres", "Neon Serverless Postgres"],
    ["Authentification", "Supabase Auth (JWT)", "Supabase Auth (garde) ou NextAuth"],
    ["Edge Functions", "Supabase Functions (Deno)", "Render Web Service (Node.js)"],
    ["RLS / Securite", "PostgreSQL RLS natif", "Application-level security"],
    ["Cron Jobs", "pg_cron Supabase", "Render Cron Jobs"],
    ["Realtime", "Supabase Realtime", "Neon ne fournit pas ce service"],
]
neon_table = Table(neon_arch, colWidths=[3.5*cm, 4.5*cm, 5*cm])
neon_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("GRID", (0, 0), (-1, -1), 0.5, GRAY),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.append(neon_table)

story.append(Spacer(1, 0.3*cm))
story.append(Paragraph(
    "RECOMMANDATION : Pour un lancement rapide, gardez Supabase comme backend complet. "
    "Le plan gratuit est largement suffisant pour demarrer. Vous pourrez toujours migrer vers Neon "
    "plus tard si le volume de donnees ou les couts le necessitent. L'architecture Supabase + Render "
    "est la plus simple et la plus rapide a mettre en production.",
    success_style))

# ═══ STEP 6: COMMANDES UTILES ═══
story.append(Paragraph("6. Commandes utiles", h1_style))

story.append(Paragraph("6.1 Deploiement local", h2_style))
story.append(Paragraph("git pull origin main", code_style))
story.append(Paragraph("rm -rf node_modules package-lock.json", code_style))
story.append(Paragraph("npm install", code_style))
story.append(Paragraph("npm run dev", code_style))

story.append(Paragraph("6.2 Build et test local", h2_style))
story.append(Paragraph("npx tsc --noEmit", code_style))
story.append(Paragraph("npm run build", code_style))
story.append(Paragraph("npx vite preview", code_style))

story.append(Paragraph("6.3 Sauvegarde Supabase", h2_style))
story.append(Paragraph(
    "supabase db dump --project-id eiquqawymbgfejwucvyt -f backup.sql",
    code_style))

story.append(Paragraph("6.4 Test edge functions", h2_style))
story.append(Paragraph(
    'curl -X POST https://VOTRE_PROJET.supabase.co/functions/v1/rotate-test-accounts \\\n'
    '  -H "X-Cron-Secret: VOTRE_SECRET" \\\n'
    '  -H "Content-Type: application/json"',
    code_style))

# Build PDF
doc.build(story)
print(f"PDF genere : {OUTPUT}")
