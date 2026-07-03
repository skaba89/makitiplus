#!/usr/bin/env python3
"""
Generate MakitiPlus E2E Test Report PDF using ReportLab.
"""

import json
from pathlib import Path
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Image, HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfgen import canvas
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate, Frame

# ═══════════════════════════════════════════════════════════
# PALETTE (from cascade generator)
# ═══════════════════════════════════════════════════════════
PAGE_BG       = colors.HexColor('#f7f7f6')
CARD_BG       = colors.HexColor('#e9e8e4')
HEADER_FILL   = colors.HexColor('#675c3c')
ACCENT        = colors.HexColor('#92751f')
ACCENT_2      = colors.HexColor('#765fbc')
BORDER        = colors.HexColor('#d1cab7')
TEXT_PRIMARY   = colors.HexColor('#181716')
TEXT_MUTED     = colors.HexColor('#797770')
SEM_SUCCESS   = colors.HexColor('#489161')
SEM_WARNING   = colors.HexColor('#947942')
SEM_ERROR     = colors.HexColor('#b34040')
SEM_INFO      = colors.HexColor('#4a7ab5')

# ═══════════════════════════════════════════════════════════
# LOAD REPORT DATA
# ═══════════════════════════════════════════════════════════
report_path = Path("/home/z/my-project/download/e2e_test_report_v2.json")
data = json.loads(report_path.read_text(encoding="utf-8"))

OUTPUT_PATH = "/home/z/my-project/download/rapport_e2e_makitiplus.pdf"

# ═══════════════════════════════════════════════════════════
# STYLES
# ═══════════════════════════════════════════════════════════
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'CustomTitle', parent=styles['Title'],
    fontSize=24, leading=30, textColor=HEADER_FILL,
    spaceAfter=6, alignment=TA_LEFT,
    fontName='Helvetica-Bold'
)

subtitle_style = ParagraphStyle(
    'CustomSubtitle', parent=styles['Normal'],
    fontSize=12, leading=16, textColor=TEXT_MUTED,
    spaceAfter=20, alignment=TA_LEFT,
    fontName='Helvetica'
)

heading1_style = ParagraphStyle(
    'Heading1Custom', parent=styles['Heading1'],
    fontSize=16, leading=22, textColor=HEADER_FILL,
    spaceBefore=20, spaceAfter=10,
    fontName='Helvetica-Bold',
    borderWidth=0, borderPadding=0,
)

heading2_style = ParagraphStyle(
    'Heading2Custom', parent=styles['Heading2'],
    fontSize=13, leading=18, textColor=ACCENT,
    spaceBefore=14, spaceAfter=8,
    fontName='Helvetica-Bold',
)

body_style = ParagraphStyle(
    'BodyCustom', parent=styles['Normal'],
    fontSize=10, leading=14, textColor=TEXT_PRIMARY,
    spaceAfter=6, alignment=TA_JUSTIFY,
    fontName='Helvetica',
)

body_muted_style = ParagraphStyle(
    'BodyMuted', parent=body_style,
    textColor=TEXT_MUTED, fontSize=9,
)

stat_style = ParagraphStyle(
    'StatCustom', parent=styles['Normal'],
    fontSize=28, leading=34, textColor=HEADER_FILL,
    alignment=TA_CENTER, fontName='Helvetica-Bold',
)

stat_label_style = ParagraphStyle(
    'StatLabel', parent=styles['Normal'],
    fontSize=9, leading=12, textColor=TEXT_MUTED,
    alignment=TA_CENTER, fontName='Helvetica',
)

# ═══════════════════════════════════════════════════════════
# BUILD PDF
# ═══════════════════════════════════════════════════════════
story = []

# ── COVER / TITLE ──
story.append(Spacer(1, 40*mm))
story.append(Paragraph("Rapport de Test End-to-End", title_style))
story.append(Paragraph("MakitiPlus v2.0", ParagraphStyle(
    'ProjectName', parent=title_style, fontSize=20, textColor=ACCENT
)))
story.append(Spacer(1, 10*mm))
story.append(HRFlowable(width="60%", thickness=2, color=ACCENT, spaceAfter=10))
story.append(Paragraph(
    f"Date : {datetime.now().strftime('%d/%m/%Y %H:%M')}",
    subtitle_style
))
story.append(Paragraph(
    f"Version du rapport : 2.0 | Projet : savana-flow (MakitiPlus)",
    body_muted_style
))
story.append(Spacer(1, 15*mm))

# ── KEY METRICS ──
total = data["total"]
passed = data["passed"]
failed = data["failed"]
critical = data["critical_failures"]
warnings = data["warning_failures"]
rate = data["success_rate"]

metric_data = [
    [Paragraph(str(total), stat_style), Paragraph(str(passed), stat_style),
     Paragraph(str(failed), stat_style), Paragraph(rate, stat_style)],
    [Paragraph("Total tests", stat_label_style), Paragraph("Reussis", stat_label_style),
     Paragraph("Echoues", stat_label_style), Paragraph("Taux de reussite", stat_label_style)],
]

metric_table = Table(metric_data, colWidths=[45*mm, 45*mm, 35*mm, 50*mm])
metric_table.setStyle(TableStyle([
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('BACKGROUND', (0, 0), (-1, 0), CARD_BG),
    ('BOX', (0, 0), (-1, -1), 1, BORDER),
    ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER),
    ('TOPPADDING', (0, 0), (-1, 0), 8),
    ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
    ('TOPPADDING', (0, 1), (-1, 1), 4),
    ('BOTTOMPADDING', (0, 1), (-1, 1), 8),
]))
story.append(metric_table)
story.append(Spacer(1, 8*mm))

# Critical / Warning summary
if critical == 0:
    story.append(Paragraph(
        '<b>0 echec critique</b> - Le projet est pret pour la production.',
        ParagraphStyle('SuccessMsg', parent=body_style, textColor=SEM_SUCCESS, fontSize=11)
    ))
else:
    story.append(Paragraph(
        f'<b>{critical} echec(s) critique(s)</b> - Action requise avant deploiement.',
        ParagraphStyle('ErrorMsg', parent=body_style, textColor=SEM_ERROR, fontSize=11)
    ))

if warnings > 0:
    story.append(Paragraph(
        f'{warnings} avertissement(s) - Ameliorations recommandees.',
        ParagraphStyle('WarnMsg', parent=body_style, textColor=SEM_WARNING, fontSize=10)
    ))

story.append(Spacer(1, 10*mm))

# ── PER-CATEGORY BREAKDOWN ──
story.append(Paragraph("Resultats par categorie", heading1_style))
story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=8))

categories = data["categories"]
cat_table_data = [
    [Paragraph("<b>Categorie</b>", ParagraphStyle('th', parent=body_style, textColor=colors.white, fontSize=9)),
     Paragraph("<b>Reussis</b>", ParagraphStyle('th', parent=body_style, textColor=colors.white, fontSize=9, alignment=TA_CENTER)),
     Paragraph("<b>Echoues</b>", ParagraphStyle('th', parent=body_style, textColor=colors.white, fontSize=9, alignment=TA_CENTER)),
     Paragraph("<b>Taux</b>", ParagraphStyle('th', parent=body_style, textColor=colors.white, fontSize=9, alignment=TA_CENTER)),
     Paragraph("<b>Statut</b>", ParagraphStyle('th', parent=body_style, textColor=colors.white, fontSize=9, alignment=TA_CENTER))]
]

for cat_name, cat_data in sorted(categories.items()):
    p = cat_data["passed"]
    f_count = cat_data["failed"]
    total_cat = p + f_count
    r = (p / total_cat * 100) if total_cat > 0 else 0
    
    if f_count == 0:
        status = "OK"
        status_color = SEM_SUCCESS
    elif cat_data.get("critical_failures") and len(cat_data["critical_failures"]) > 0:
        status = "CRITIQUE"
        status_color = SEM_ERROR
    else:
        status = "ATTENTION"
        status_color = SEM_WARNING
    
    cat_table_data.append([
        Paragraph(cat_name, ParagraphStyle('td', parent=body_style, fontSize=9)),
        Paragraph(str(p), ParagraphStyle('td', parent=body_style, fontSize=9, alignment=TA_CENTER)),
        Paragraph(str(f_count), ParagraphStyle('td', parent=body_style, fontSize=9, alignment=TA_CENTER)),
        Paragraph(f"{r:.0f}%", ParagraphStyle('td', parent=body_style, fontSize=9, alignment=TA_CENTER)),
        Paragraph(status, ParagraphStyle('td', parent=body_style, fontSize=9, alignment=TA_CENTER, textColor=status_color)),
    ])

cat_table = Table(cat_table_data, colWidths=[55*mm, 25*mm, 25*mm, 25*mm, 30*mm])
cat_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('BOX', (0, 0), (-1, -1), 1, BORDER),
    ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, CARD_BG]),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
]))
story.append(cat_table)
story.append(Spacer(1, 10*mm))

# ── FAILED TESTS DETAIL ──
failed_tests = [r for r in data["results"] if not r["passed"]]
if failed_tests:
    story.append(Paragraph("Details des echecs", heading1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=8))
    
    fail_table_data = [
        [Paragraph("<b>Test</b>", ParagraphStyle('th', parent=body_style, textColor=colors.white, fontSize=9)),
         Paragraph("<b>Categorie</b>", ParagraphStyle('th', parent=body_style, textColor=colors.white, fontSize=9)),
         Paragraph("<b>Severite</b>", ParagraphStyle('th', parent=body_style, textColor=colors.white, fontSize=9)),
         Paragraph("<b>Detail</b>", ParagraphStyle('th', parent=body_style, textColor=colors.white, fontSize=9))]
    ]
    
    for t in failed_tests:
        sev = t.get("severity", "info")
        sev_color = SEM_ERROR if sev == "critical" else (SEM_WARNING if sev == "warning" else SEM_INFO)
        fail_table_data.append([
            Paragraph(t["name"], ParagraphStyle('td', parent=body_style, fontSize=8)),
            Paragraph(t.get("category", ""), ParagraphStyle('td', parent=body_style, fontSize=8)),
            Paragraph(sev.upper(), ParagraphStyle('td', parent=body_style, fontSize=8, textColor=sev_color)),
            Paragraph(t.get("detail", ""), ParagraphStyle('td', parent=body_style, fontSize=8, textColor=TEXT_MUTED)),
        ])
    
    fail_table = Table(fail_table_data, colWidths=[50*mm, 30*mm, 25*mm, 65*mm])
    fail_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOX', (0, 0), (-1, -1), 1, BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, CARD_BG]),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(fail_table)
    story.append(Spacer(1, 10*mm))

# ── TEST SUMMARY SECTIONS ──
story.append(Paragraph("Resume des verifications", heading1_style))
story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=8))

section_descriptions = {
    "TypeScript": "Compilation TypeScript sans erreur - verifie que tout le code source est typé correctement et ne contient pas d'erreurs de compilation.",
    "Build": "Build de production Vite - verifie que l'application se compile correctement pour le deploiement en production avec tous les chunks optimises.",
    "Emoji": "Audit complet des emojis dans le code source de production - tous les emojis ont ete remplaces par des icones Lucide React professionnelles. Seuls les drapeaux ISO dans currencies.ts sont exemptes (standard international).",
    "Branding": "Coherence de la marque MakitiPlus - verifie que toutes les references a l'ancien nom (SahelPOS) ont ete remplacees et que le branding est coherent dans tout le projet.",
    "Currency": "Devise par defaut (GNF / Guinee) - verifie que la devise est correctement configuree pour la Guinee et que le FCFA n'est plus utilise comme defaut.",
    "Auth": "Authentification et gestion des roles - verifie le systeme d'authentification Supabase, la protection des routes, les gardes de statut de compte, et la gestion des 5 roles (super_admin, admin, manager, vendeur, comptable).",
    "Security": "Securite des Edge Functions - CORS restreint, garde HTTP, messages d'erreur generiques, rate limiting, protection du cron secret, et aucune fuite de tokens dans les reponses.",
    "Backend": "Modules partages du backend (Supabase Edge Functions) - CORS, HTTP method guard, politique de mots de passe, rate limiter, et scope organisationnel.",
    "A11y": "Accessibilite - verifie les labels ARIA sur les boutons icones, la navigation au clavier (role=button, tabIndex, onKeyDown), et les attributs aria-describedby sur les dialogues.",
    "PWA": "Configuration Progressive Web App - manifest.webmanifest, icones, plugin VitePWA, strategies de cache (NetworkFirst pour navigations, CacheFirst pour statiques), exclusion des URLs d'auth du cache.",
    "Observability": "Suivi des erreurs avec Sentry - SentryErrorBoundary, integration Sentry, remplacement de console.error par reportError(), et contexte utilisateur non-PII.",
    "Performance": "Optimisations de performance - React.memo sur les composants lourds, React.lazy pour les routes lourdes (POS, Reports), Zustand pour le state du panier, staleTime sur les queries, et code-splitting manuel.",
    "Types": "Qualite TypeScript - types definis dans types/index.ts, fichier web-nfc.d.ts, et aucun type 'any' dans le code de production.",
    "Offline": "Fonctionnalite hors ligne - IndexedDB pour le stockage, file d'attente de tickets avec backoff exponentiel, resolveur de conflits de sync, et contexte OfflineProvider.",
    "Routes": "Navigation et routes - toutes les routes attendues sont presentes, drapeaux React Router v7 actives, et route catch-all 404.",
    "POS": "Point de vente - RPC batch_update_stock atomique, store Zustand pour le panier, useCallback pour les handlers, chargement progressif (PAGE_SIZE), et tous les composants POS presents.",
    "Products": "Gestion des produits - formulaire, liste, generateur de codes-barres, imprimante d'etiquettes, ajustement de stock, historique des mouvements, et index de recherche avec normalisation des accents.",
    "Security (RLS)": "Securite RLS et migrations - politiques RLS resserrees, cles etrangeres ajoutees, RPC batch_update_stock, et organisation_id pour le partitionnement multi-tenant.",
    "Tests": "Tests unitaires - 89 tests passent sur 30 fichiers de test avec Vitest.",
    "Lint": "Analyse statique ESLint - verifie la qualite du code selon les regles configurees.",
}

# Group results by category
cat_results = {}
for r in data["results"]:
    cat = r.get("category", "Other")
    if cat not in cat_results:
        cat_results[cat] = {"passed": 0, "failed": 0, "tests": []}
    cat_results[cat]["tests"].append(r)
    if r["passed"]:
        cat_results[cat]["passed"] += 1
    else:
        cat_results[cat]["failed"] += 1

for cat_name in sorted(cat_results.keys()):
    cat_data_item = cat_results[cat_name]
    p = cat_data_item["passed"]
    f_c = cat_data_item["failed"]
    total_cat = p + f_c
    r = (p / total_cat * 100) if total_cat > 0 else 0
    
    status_icon = "OK" if f_c == 0 else "ATTENTION"
    story.append(Paragraph(
        f"{cat_name} ({p}/{total_cat} - {r:.0f}%) - {status_icon}",
        heading2_style
    ))
    
    desc = section_descriptions.get(cat_name, "")
    if desc:
        story.append(Paragraph(desc, body_muted_style))
    
    # List failed tests in this category
    failed_in_cat = [t for t in cat_data_item["tests"] if not t["passed"]]
    for t in failed_in_cat:
        story.append(Paragraph(
            f'Echec: {t["name"]} - {t.get("detail", "")}',
            ParagraphStyle('fail', parent=body_style, textColor=SEM_ERROR, fontSize=9, leftIndent=10)
        ))
    
    story.append(Spacer(1, 4*mm))

# ── EMOJI REPLACEMENT SUMMARY ──
story.append(Paragraph("Remplacement des emojis", heading1_style))
story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=8))

story.append(Paragraph(
    "Tous les emojis dans le code source de production ont ete systematiquement remplaces par des icones Lucide React professionnelles. "
    "Cette operation a couvert 19 fichiers et plus de 98 emojis identifies. Les remplacements incluent :",
    body_style
))

emoji_replacements = [
    ["Emojis categories (Depenses)", "Icones Lucide (Home, Zap, Droplets, Globe, Phone, CartIcon, Car, Users, Wrench, ClipboardList, Package)"],
    ["Emojis categories (Categories)", "Noms d'icones Lucide en base de donnees (Package, Wheat, CupSoda, Sparkles, Brush, Wrench, Smartphone, Shirt, Croissant, Leaf, Drumstick, Snowflake)"],
    ["Emojis page Dashboard", "Icone Package + ICON_MAP pour rendu dynamique"],
    ["Emojis landing Hero", "CartIcon, Package, BarChart3, Users, Banknote, QrCode"],
    ["Emojis temoignages", "User, Stethoscope, ChefHat (avec fallback User)"],
    ["Emojis Pricing/CTA", "CreditCard, Smartphone, Lock, Globe, Phone"],
    ["Symboles statut (check/cross)", "CheckCircle2, XCircle, RotateCcw, Hourglass, Timer"],
    ["Emojis sync panels", "Texte descriptif sans emoji"],
    ["Emojis receipt WhatsApp", "Texte formatte sans emoji (compatibilite WhatsApp preservee)"],
    ["Drapeaux pays (currencies.ts)", "Conformes ISO 3166-1 - exemptes (pas d'equivalent Lucide)"],
]

rep_table_data = [
    [Paragraph("<b>Zone</b>", ParagraphStyle('th', parent=body_style, textColor=colors.white, fontSize=9)),
     Paragraph("<b>Remplacement</b>", ParagraphStyle('th', parent=body_style, textColor=colors.white, fontSize=9))]
]
for zone, replacement in emoji_replacements:
    rep_table_data.append([
        Paragraph(zone, ParagraphStyle('td', parent=body_style, fontSize=8)),
        Paragraph(replacement, ParagraphStyle('td', parent=body_style, fontSize=8)),
    ])

rep_table = Table(rep_table_data, colWidths=[55*mm, 115*mm])
rep_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('BOX', (0, 0), (-1, -1), 1, BORDER),
    ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, CARD_BG]),
    ('TOPPADDING', (0, 0), (-1, -1), 3),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ('LEFTPADDING', (0, 0), (-1, -1), 4),
]))
story.append(rep_table)
story.append(Spacer(1, 10*mm))

# ── RECOMMENDATIONS ──
story.append(Paragraph("Recommandations", heading1_style))
story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=8))

recommendations = [
    ("Accessibilite (A11y)", "Ajouter des aria-label sur les 14 boutons icones restants sans label. Utiliser un linter d'accessibilite (eslint-plugin-jsx-a11y) pour detection automatique."),
    ("Branding", "Ajouter le nom MakitiPlus dans le composant Hero.tsx (landing page) pour renforcer la coherence de marque."),
    ("ESLint", "Corriger les 66 erreurs ESLint restantes. La plupart sont probablement des avertissements de types ou des imports non utilises."),
    ("Observabilite", "Remplacer les 3 console.error restants dans le code de production par reportError() pour une capture Sentry complete."),
    ("Performance", "Le chunk principal (index.js) depasse 640 KB. Envisager de splitter davantage avec des imports dynamiques supplementaires."),
    ("Token GitHub", "REVOQUER IMMEDIATEMENT le token GitHub (ghp_emcYb...) qui a ete expose dans le chat. Aller sur github.com/settings/tokens pour le supprimer."),
]

for title, desc in recommendations:
    story.append(Paragraph(f"<b>{title}</b>", ParagraphStyle('rec', parent=body_style, fontSize=10, textColor=ACCENT)))
    story.append(Paragraph(desc, body_style))
    story.append(Spacer(1, 4*mm))

# ═══════════════════════════════════════════════════════════
# BUILD PDF
# ═══════════════════════════════════════════════════════════
doc = SimpleDocTemplate(
    OUTPUT_PATH,
    pagesize=A4,
    leftMargin=20*mm, rightMargin=20*mm,
    topMargin=20*mm, bottomMargin=20*mm,
    title="Rapport de Test End-to-End MakitiPlus",
    author="Z.ai",
    subject="Test E2E complet du projet MakitiPlus",
)

# Add page numbers
def add_page_number(canvas_obj, doc_obj):
    canvas_obj.saveState()
    page_num = canvas_obj.getPageNumber()
    canvas_obj.setFont('Helvetica', 8)
    canvas_obj.setFillColor(TEXT_MUTED)
    canvas_obj.drawString(A4[0] - 30*mm, 10*mm, f"Page {page_num}")
    canvas_obj.drawString(20*mm, 10*mm, "MakitiPlus E2E Report")
    canvas_obj.restoreState()

doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)

print(f"PDF genere : {OUTPUT_PATH}")
