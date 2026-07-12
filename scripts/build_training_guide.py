#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Guide de formation MakitiPlus pour magasin pilote — PDF
Généré via ReportLab.
"""

import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable, ListFlowable, ListItem,
)

# ════════════════════════════════════════════════════════════════════
# Font registration
# ════════════════════════════════════════════════════════════════════
FONT_DIR = '/usr/share/fonts'

pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')

pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold', italic='FreeSerif-Italic')

# ════════════════════════════════════════════════════════════════════
# Colors — cascade palette (minimal, warm)
# ════════════════════════════════════════════════════════════════════
PAGE_BG       = colors.HexColor('#FFFFFF')
SECTION_BG    = colors.HexColor('#EDECEB')
CARD_BG       = colors.HexColor('#EAE9E5')
TABLE_STRIPE  = colors.HexColor('#F5F4F3')
HEADER_FILL   = colors.HexColor('#5A533E')
BORDER        = colors.HexColor('#CEC9B8')
TEXT_PRIMARY  = colors.HexColor('#262523')
TEXT_MUTED    = colors.HexColor('#8A8881')
ACCENT        = colors.HexColor('#A45852')  # MakitiPlus brand orange-red
SEM_SUCCESS   = colors.HexColor('#479260')
SEM_WARNING   = colors.HexColor('#9C8048')
SEM_INFO      = colors.HexColor('#4B77A2')

# ════════════════════════════════════════════════════════════════════
# Styles
# ════════════════════════════════════════════════════════════════════
BODY_FONT = 'NotoSerifSC'
BODY_BOLD = 'NotoSerifSC-Bold'

style_h1 = ParagraphStyle('H1', fontName=BODY_BOLD, fontSize=20, leading=26,
    textColor=TEXT_PRIMARY, spaceBefore=20, spaceAfter=12, alignment=TA_LEFT)
style_h2 = ParagraphStyle('H2', fontName=BODY_BOLD, fontSize=14, leading=18,
    textColor=HEADER_FILL, spaceBefore=14, spaceAfter=8, alignment=TA_LEFT)
style_h3 = ParagraphStyle('H3', fontName=BODY_BOLD, fontSize=11, leading=15,
    textColor=ACCENT, spaceBefore=10, spaceAfter=6, alignment=TA_LEFT)
style_body = ParagraphStyle('Body', fontName=BODY_FONT, fontSize=10.5, leading=16,
    textColor=TEXT_PRIMARY, spaceAfter=8, alignment=TA_JUSTIFY)
style_body_left = ParagraphStyle('BodyL', fontName=BODY_FONT, fontSize=10.5, leading=16,
    textColor=TEXT_PRIMARY, spaceAfter=8, alignment=TA_LEFT)
style_muted = ParagraphStyle('Muted', fontName=BODY_FONT, fontSize=9, leading=12,
    textColor=TEXT_MUTED, spaceAfter=4, alignment=TA_LEFT)
style_callout = ParagraphStyle('Callout', fontName=BODY_BOLD, fontSize=10.5, leading=15,
    textColor=ACCENT, alignment=TA_LEFT, spaceBefore=6, spaceAfter=6,
    leftIndent=12, borderColor=ACCENT, borderWidth=0, borderPadding=4)
style_th = ParagraphStyle('TH', fontName=BODY_BOLD, fontSize=9, leading=12,
    textColor=colors.white, alignment=TA_LEFT)
style_th_c = ParagraphStyle('THC', fontName=BODY_BOLD, fontSize=9, leading=12,
    textColor=colors.white, alignment=TA_CENTER)
style_td = ParagraphStyle('TD', fontName=BODY_FONT, fontSize=9.5, leading=13,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT)
style_td_c = ParagraphStyle('TDC', fontName=BODY_FONT, fontSize=9.5, leading=13,
    textColor=TEXT_PRIMARY, alignment=TA_CENTER)

# ════════════════════════════════════════════════════════════════════
# Page decoration
# ════════════════════════════════════════════════════════════════════
def page_decorations(canvas, doc):
    canvas.saveState()
    page_w, page_h = A4
    # Top brand strip
    canvas.setFillColor(ACCENT)
    canvas.rect(0, page_h - 8*mm, page_w, 8*mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont('FreeSerif-Bold', 8)
    canvas.drawString(20*mm, page_h - 5.5*mm, 'MAKITIPLUS · GUIDE DE FORMATION MAGASIN PILOTE')
    canvas.setFont('FreeSerif', 8)
    canvas.drawRightString(page_w - 20*mm, page_h - 5.5*mm, 'v1.0')
    # Footer
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.4)
    canvas.line(20*mm, 15*mm, page_w - 20*mm, 15*mm)
    canvas.setFont('FreeSerif', 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(20*mm, 10*mm, "MakitiPlus — La caisse intelligente et offline-first pour l'Afrique")
    canvas.drawRightString(page_w - 20*mm, 10*mm, f'Page {doc.page}')
    canvas.restoreState()

def callout_box(text, color=SEM_INFO, title=None):
    """Info callout box."""
    elements = []
    if title:
        elements.append(Paragraph(f'<font color="white"><b>{title}</b></font>',
            ParagraphStyle('cb_t', fontName=BODY_BOLD, fontSize=10, textColor=colors.white, alignment=TA_LEFT)))
        elements.append(Paragraph(text,
            ParagraphStyle('cb_b', fontName=BODY_FONT, fontSize=9.5, leading=14, textColor=TEXT_PRIMARY, alignment=TA_LEFT)))
    else:
        elements.append(Paragraph(text,
            ParagraphStyle('cb_s', fontName=BODY_FONT, fontSize=9.5, leading=14, textColor=TEXT_PRIMARY, alignment=TA_LEFT)))
    t = Table([[e] for e in elements], colWidths=[170*mm])
    style_cmds = [
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('BOX', (0,0), (-1,-1), 0.5, color),
        ('BACKGROUND', (0,0), (0,0), color),
    ]
    if title:
        style_cmds.append(('BACKGROUND', (0,1), (0,-1), CARD_BG))
    else:
        style_cmds.append(('BACKGROUND', (0,0), (0,-1), CARD_BG))
    t.setStyle(TableStyle(style_cmds))
    return t

def styled_table(data, col_widths, header=True):
    t = Table(data, colWidths=col_widths, repeatRows=1 if header else 0)
    style = [
        ('FONT', (0,0), (-1,-1), BODY_FONT, 9.5),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LINEBELOW', (0,0), (-1,-1), 0.3, BORDER),
        ('LINEAFTER', (0,0), (-2,-1), 0.3, BORDER),
    ]
    if header:
        style.extend([
            ('BACKGROUND', (0,0), (-1,0), HEADER_FILL),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONT', (0,0), (-1,0), BODY_BOLD, 9),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, TABLE_STRIPE]),
        ])
    t.setStyle(TableStyle(style))
    return t

# ════════════════════════════════════════════════════════════════════
# Build story
# ════════════════════════════════════════════════════════════════════
story = []

# ─── COVER PAGE ────────────────────────────────────────────────────
story.append(Spacer(1, 60*mm))
story.append(Paragraph('<font color="#A45852"><b>GUIDE DE FORMATION</b></font>',
    ParagraphStyle('cover_kicker', fontName=BODY_BOLD, fontSize=14, textColor=ACCENT, alignment=TA_CENTER, spaceAfter=20)))
story.append(Paragraph('MakitiPlus',
    ParagraphStyle('cover_title', fontName=BODY_BOLD, fontSize=48, textColor=TEXT_PRIMARY, alignment=TA_CENTER, spaceAfter=8)))
story.append(Paragraph('La caisse intelligente et offline-first<br/>pour commerces africains',
    ParagraphStyle('cover_sub', fontName=BODY_FONT, fontSize=18, textColor=TEXT_MUTED, alignment=TA_CENTER, spaceAfter=40, leading=26)))
story.append(HRFlowable(width='40%', thickness=2, color=ACCENT, spaceBefore=20, spaceAfter=30, hAlign='CENTER'))
story.append(Paragraph('Manuel complet pour le démarrage<br/>d\'un magasin pilote',
    ParagraphStyle('cover_desc', fontName=BODY_FONT, fontSize=13, textColor=TEXT_PRIMARY, alignment=TA_CENTER, spaceAfter=60, leading=20)))
story.append(Paragraph('Version 1.0 · Juillet 2026',
    ParagraphStyle('cover_meta', fontName=BODY_FONT, fontSize=11, textColor=TEXT_MUTED, alignment=TA_CENTER)))
story.append(PageBreak())

# ─── TABLE OF CONTENTS ─────────────────────────────────────────────
story.append(Paragraph('Sommaire', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

toc_data = [
    [Paragraph('<b>Chapitre</b>', style_th), Paragraph('<b>Titre</b>', style_th)],
    [Paragraph('1', style_td_c), Paragraph('Bienvenue dans MakitiPlus', style_td)],
    [Paragraph('2', style_td_c), Paragraph('Première connexion et configuration', style_td)],
    [Paragraph('3', style_td_c), Paragraph('Gérer votre catalogue produits', style_td)],
    [Paragraph('4', style_td_c), Paragraph('Enregistrer une vente (POS)', style_td)],
    [Paragraph('5', style_td_c), Paragraph('Gérer les clients et le crédit', style_td)],
    [Paragraph('6', style_td_c), Paragraph('Suivre le stock et les ajustements', style_td)],
    [Paragraph('7', style_td_c), Paragraph('Consulter les rapports', style_td)],
    [Paragraph('8', style_td_c), Paragraph('Travailler hors ligne (offline)', style_td)],
    [Paragraph('9', style_td_c), Paragraph('Imprimer et envoyer des reçus', style_td)],
    [Paragraph('10', style_td_c), Paragraph('Erreurs courantes et dépannage', style_td)],
    [Paragraph('11', style_td_c), Paragraph('Assistance et support', style_td)],
]
story.append(styled_table(toc_data, [25*mm, 145*mm]))
story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 1. BIENVENUE
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('1. Bienvenue dans MakitiPlus', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph(
    "Bienvenue dans MakitiPlus, votre nouvelle solution de gestion commerciale conçue spécifiquement "
    "pour les commerces africains. Que vous teniez une épicerie de quartier, un supermarché, une boutique "
    "de quartier ou un point de vente spécialisé, MakitiPlus vous accompagne au quotidien pour gérer "
    "vos ventes, votre stock, vos clients et vos rapports — même sans connexion internet.",
    style_body))

story.append(Paragraph(
    "Ce guide de formation a été conçu pour vous accompagner pas à pas dans la prise en main de "
    "l'application. Il s'adresse aux gérants de magasins pilotes qui découvrent l'outil pour la "
    "première fois. À la fin de ce guide, vous saurez enregistrer une vente, gérer votre stock, "
    "suivre vos clients à crédit, et consulter vos rapports journaliers sans difficulté.",
    style_body))

story.append(Paragraph('1.1 Pourquoi MakitiPlus ?', style_h2))
story.append(Paragraph(
    "MakitiPlus a été pensé pour répondre aux défis réels du commerce en Afrique de l'Ouest : "
    "connexions internet instables, besoin de mobilité, importance du crédit client, multiplicité "
    "des moyens de paiement (espèces, Wave, Orange Money, Mobile Money). L'application fonctionne "
    "entièrement hors ligne et se synchronise automatiquement dès que la connexion revient, sans "
    "perdre aucune donnée.",
    style_body))

story.append(Paragraph('1.2 Ce que vous allez pouvoir faire', style_h2))
features_data = [
    [Paragraph('<b>Fonctionnalité</b>', style_th), Paragraph('<b>Description</b>', style_th)],
    [Paragraph('Caisse (POS)', style_td), Paragraph('Enregistrer des ventes rapidement, avec scan code-barres et multi-paiements (espèces, Wave, Orange Money, crédit)', style_td)],
    [Paragraph('Gestion stock', style_td), Paragraph('Suivre le stock en temps réel, recevoir des alertes de rupture, ajuster les quantités', style_td)],
    [Paragraph('Clients à crédit', style_td), Paragraph('Suivre les crédits, encaisser les paiements partiels, consulter l\'historique', style_td)],
    [Paragraph('Rapports', style_td), Paragraph('Visualiser les ventes, dépenses, bénéfices, tendances — avec export PDF et Excel', style_td)],
    [Paragraph('Mode offline', style_td), Paragraph('Continuer à vendre sans internet, synchronisation auto à la reconnexion', style_td)],
    [Paragraph('Reçus', style_td), Paragraph('Générer des reçus PDF, envoyer par WhatsApp, imprimer en thermique 58mm ou 80mm', style_td)],
]
story.append(styled_table(features_data, [40*mm, 130*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('1.3 Prérequis techniques', style_h2))
story.append(Paragraph(
    "Pour utiliser MakitiPlus, vous avez besoin d'un appareil connecté à internet (ordinateur, "
    "tablette ou smartphone) avec un navigateur moderne (Chrome, Firefox, Edge, Safari). "
    "L'application est accessible via votre navigateur à l'adresse fournie par votre administrateur. "
    "Aucune installation n'est requise — MakitiPlus est une application web qui fonctionne directement "
    "dans le navigateur. Vous pouvez aussi l'installer comme application mobile (PWA) pour un accès "
    "plus rapide depuis votre écran d'accueil.",
    style_body))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 2. PREMIÈRE CONNEXION
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('2. Première connexion et configuration', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph('2.1 Se connecter à son compte', style_h2))
story.append(Paragraph(
    "Pour accéder à MakitiPlus, ouvrez votre navigateur et rendez-vous à l'adresse fournie par "
    "votre administrateur (par exemple makitiplus.onrender.com). Sur la page d'accueil, cliquez sur "
    "le bouton « Se connecter ». Saisissez votre adresse email et votre mot de passe dans les champs "
    "prévus à cet effet, puis cliquez sur « Connexion ». Si vos identifiants sont corrects, vous "
    "serez redirigé vers le tableau de bord principal de votre magasin.",
    style_body))

story.append(callout_box(
    "Votre administrateur MakitiPlus vous a fourni un email et un mot de passe temporaires. "
    "Pensez à changer votre mot de passe lors de votre première connexion via Paramètres > Sécurité.",
    color=SEM_WARNING, title="Important — Identifiants"))

story.append(Paragraph('2.2 Configurer votre magasin', style_h2))
story.append(Paragraph(
    "Avant d'enregistrer votre première vente, il est essentiel de configurer correctement votre "
    "magasin. Rendez-vous dans le menu « Paramètres » accessible depuis la barre latérale gauche. "
    "Vous y trouverez plusieurs sections de configuration qui détermineront le comportement de "
    "votre caisse et l'apparence de vos reçus.",
    style_body))

config_data = [
    [Paragraph('<b>Paramètre</b>', style_th), Paragraph('<b>Valeur recommandée</b>', style_th), Paragraph('<b>Description</b>', style_th)],
    [Paragraph('Nom de la boutique', style_td), Paragraph('Le nom officiel de votre magasin', style_td), Paragraph('Affiché sur les reçus et rapports', style_td)],
    [Paragraph('Devise', style_td), Paragraph('GNF (Franc Guinéen) ou XOF', style_td), Paragraph('Devise utilisée pour tous les montants', style_td)],
    [Paragraph('Pays', style_td), Paragraph('Guinée, Sénégal, Côte d\'Ivoire...', style_td), Paragraph('Pour les formats de téléphone et taxes', style_td)],
    [Paragraph('Taux de TVA', style_td), Paragraph('Selon votre régime fiscal', style_td), Paragraph('Pourcentage appliqué aux ventes (ex: 0%, 18%)', style_td)],
    [Paragraph('Logo', style_td), Paragraph('Image carrée (PNG/JPG)', style_td), Paragraph('Apparaît sur les reçus PDF', style_td)],
]
story.append(styled_table(config_data, [40*mm, 50*mm, 80*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('2.3 Comprendre le tableau de bord', style_h2))
story.append(Paragraph(
    "Le tableau de bord est la page d'accueil de votre espace de gestion. Il vous donne un aperçu "
    "rapide de l'activité de votre magasin : ventes du jour, stock total, nombre de clients, "
    "crédits en cours. Vous y accédez après connexion et pouvez y revenir à tout moment en cliquant "
    "sur « Tableau de bord » dans le menu latéral. Les chiffres affichés sont mis à jour en temps "
    "réel à chaque vente ou ajustement de stock.",
    style_body))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 3. CATALOGUE PRODUITS
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('3. Gérer votre catalogue produits', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph('3.1 Ajouter un produit', style_h2))
story.append(Paragraph(
    "Le catalogue produits est le cœur de votre système de caisse. Sans produits enregistrés, "
    "vous ne pourrez pas enregistrer de ventes. Pour ajouter un produit, cliquez sur « Produits » "
    "dans le menu latéral, puis sur le bouton « Ajouter un produit ». Remplissez les champs "
    "suivants : nom du produit (obligatoire), prix de vente, prix d'achat (pour calculer vos "
    "marges), quantité en stock, et code-barres si vous en avez un. Vous pouvez aussi associer "
    "le produit à une catégorie pour organiser votre catalogue.",
    style_body))

story.append(Paragraph('3.2 Champs d\'un produit', style_h2))
prod_data = [
    [Paragraph('<b>Champ</b>', style_th), Paragraph('<b>Obligatoire</b>', style_th_c), Paragraph('<b>Description</b>', style_th)],
    [Paragraph('Nom', style_td), Paragraph('Oui', style_td_c), Paragraph('Nom affiché à la caisse et sur les reçus', style_td)],
    [Paragraph('Prix de vente', style_td), Paragraph('Oui', style_td_c), Paragraph('Prix unitaire auquel vous vendez le produit', style_td)],
    [Paragraph('Prix d\'achat', style_td), Paragraph('Non', style_td_c), Paragraph('Pour calculer la marge et le bénéfice', style_td)],
    [Paragraph('Stock', style_td), Paragraph('Oui', style_td_c), Paragraph('Quantité initiale disponible', style_td)],
    [Paragraph('Seuil d\'alerte', style_td), Paragraph('Non', style_td_c), Paragraph('Quantité minimum avant alerte de rupture', style_td)],
    [Paragraph('Code-barres', style_td), Paragraph('Non', style_td_c), Paragraph('Pour scan rapide à la caisse', style_td)],
    [Paragraph('Catégorie', style_td), Paragraph('Non', style_td_c), Paragraph('Pour organiser et filtrer le catalogue', style_td)],
    [Paragraph('Unité', style_td), Paragraph('Non', style_td_c), Paragraph('Unité, kg, litre, boîte...', style_td)],
]
story.append(styled_table(prod_data, [35*mm, 25*mm, 110*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('3.3 Catégories de produits', style_h2))
story.append(Paragraph(
    "Les catégories permettent d'organiser votre catalogue et de retrouver rapidement vos produits "
    "à la caisse. Par défaut, MakitiPlus crée quelques catégories génériques (Boissons, Alimentation, "
    "Hygiène). Vous pouvez en ajouter de nouvelles dans le menu « Catégories ». Donnez un nom "
    "explicite et, si besoin, une description. L'ordre d'affichage est personnalisable pour mettre "
    "vos catégories les plus utilisées en premier à l'écran de la caisse.",
    style_body))

story.append(callout_box(
    "Astuce : créez 5 à 10 catégories maximum pour commencer. Trop de catégories ralentit la "
    "recherche à la caisse. Exemples : Boissons, Alimentation, Hygiène, Épicerie, Frais.",
    color=SEM_INFO, title="Conseil pratique"))

story.append(Paragraph('3.4 Modifier ou supprimer un produit', style_h2))
story.append(Paragraph(
    "Pour modifier un produit, cliquez sur son nom dans la liste des produits. Vous pouvez alors "
    "changer le prix, le stock, ou toute autre information. Pour supprimer un produit, cliquez sur "
    "l'icône de corbeille à droite de la ligne. Attention : la suppression d'un produit est "
    "définitive, mais l'historique des ventes passées contenant ce produit est conservé.",
    style_body))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 4. POS — VENTE
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('4. Enregistrer une vente (POS)', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph('4.1 L\'écran de caisse', style_h2))
story.append(Paragraph(
    "L'écran de caisse (ou POS — Point of Sale) est l'écran que vous utiliserez le plus au quotidien. "
    "Il est divisé en deux parties : à gauche, la liste de vos produits organisés par catégorie avec "
    "une barre de recherche ; à droite, le panier du client avec le total et les options de paiement. "
    "Pour ajouter un produit au panier, cliquez simplement dessus dans la liste, ou scannez son "
    "code-barres si vous disposez d'un scanner.",
    style_body))

story.append(Paragraph('4.2 Enregistrer une vente en 4 étapes', style_h2))

steps_data = [
    [Paragraph('<b>Étape</b>', style_th_c), Paragraph('<b>Action</b>', style_th), Paragraph('<b>Détail</b>', style_th)],
    [Paragraph('1', style_td_c), Paragraph('Ajouter les produits', style_td), Paragraph('Cliquez sur les produits ou scannez les codes-barres. Le panier se met à jour automatiquement.', style_td)],
    [Paragraph('2', style_td_c), Paragraph('Vérifier le total', style_td), Paragraph('Le sous-total, la TVA et le total sont affichés à droite. Vous pouvez ajuster les quantités.', style_td)],
    [Paragraph('3', style_td_c), Paragraph('Choisir le paiement', style_td), Paragraph('Espèces, Wave, Orange Money, Mobile Money, Carte, ou Crédit client.', style_td)],
    [Paragraph('4', style_td_c), Paragraph('Valider et encaisser', style_td), Paragraph('Saisir le montant reçu (pour espèces), calculer la monnaie à rendre, valider.', style_td)],
]
story.append(styled_table(steps_data, [15*mm, 50*mm, 105*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('4.3 Les moyens de paiement', style_h2))
story.append(Paragraph(
    "MakitiPlus supporte plusieurs moyens de paiement adaptés au contexte africain. Vous pouvez "
    "enregistrer une vente avec un seul moyen de paiement ou combiner plusieurs moyens (par exemple, "
    "un client qui paie 5000 GNF en espèces et 15000 GNF par Wave pour un total de 20000 GNF). "
    "Le choix du moyen de paiement se fait au moment de l'encaissement.",
    style_body))

payment_data = [
    [Paragraph('<b>Moyen</b>', style_th), Paragraph('<b>Quand l\'utiliser</b>', style_th)],
    [Paragraph('Espèces', style_td), Paragraph('Paiement en cash (billets et pièces)', style_td)],
    [Paragraph('Wave', style_td), Paragraph('Transfert Wave (Guinée, Sénégal)', style_td)],
    [Paragraph('Orange Money', style_td), Paragraph('Transfert Orange Money', style_td)],
    [Paragraph('Mobile Money', style_td), Paragraph('Autres opérateurs mobile money', style_td)],
    [Paragraph('Carte', style_td), Paragraph('Carte bancaire (TPE)', style_td)],
    [Paragraph('Crédit client', style_td), Paragraph('Vente à crédit — le client paiera plus tard', style_td)],
]
story.append(styled_table(payment_data, [40*mm, 130*mm]))
story.append(Spacer(1, 10))

story.append(callout_box(
    "Le montant de la monnaie à rendre est calculé automatiquement pour les paiements en espèces. "
    "Vérifiez toujours le montant affiché avant de rendre la monnaie au client.",
    color=SEM_INFO, title="Calcul automatique de la monnaie"))

story.append(Paragraph('4.4 Vente à crédit', style_h2))
story.append(Paragraph(
    "La vente à crédit est une fonctionnalité essentielle pour les commerces africains. Lorsque "
    "vous choisissez « Crédit client » comme moyen de paiement, vous devez sélectionner le client "
    "concerné dans votre liste (ou créer un nouveau client à la volée). Le montant de la vente "
    "s'ajoute automatiquement au crédit en cours de ce client. Vous pourrez ensuite suivre les "
    "paiements partiels et le solde restant à recouvrer depuis le menu « Clients ».",
    style_body))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 5. CLIENTS ET CRÉDIT
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('5. Gérer les clients et le crédit', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph('5.1 Ajouter un client', style_h2))
story.append(Paragraph(
    "Le module Clients vous permet de suivre vos clients réguliers et surtout ceux qui achètent "
    "à crédit. Pour ajouter un client, cliquez sur « Clients » dans le menu, puis sur « Ajouter ». "
    "Saisissez au minimum le nom du client. Le téléphone et l'email sont optionnels mais "
    "recommandés pour pouvoir envoyer des reçus par WhatsApp ou email. Vous pouvez aussi définir "
    "une limite de crédit maximale pour éviter les dérives.",
    style_body))

story.append(Paragraph('5.2 Suivre les crédits', style_h2))
story.append(Paragraph(
    "Chaque client a un « crédit en cours » qui représente le montant total qu'il vous doit. "
    "Ce crédit augmente à chaque vente à crédit et diminue à chaque paiement. Depuis la fiche "
    "d'un client, vous pouvez voir l'historique complet de ses achats et de ses paiements. "
    "Le crédit en cours est affiché en rouge s'il dépasse la limite que vous avez fixée.",
    style_body))

story.append(Paragraph('5.3 Encaisser un paiement de crédit', style_h2))
story.append(Paragraph(
    "Quand un client vient rembourser tout ou partie de son crédit, ouvrez sa fiche et cliquez "
    "sur « Paiement de crédit ». Saisissez le montant qu'il vous donne et choisissez le moyen de "
    "paiement (espèces, Wave, etc.). Le crédit en cours est mis à jour immédiatement. Vous pouvez "
    "encaisser des paiements partiels — le solde restant reste visible dans la fiche du client.",
    style_body))

story.append(callout_box(
    "Vérifiez régulièrement les crédits en cours (au moins une fois par semaine) et relancez "
    "les clients dont le crédit dépasse la limite. Vous pouvez leur envoyer un récapitulatif par "
    "WhatsApp directement depuis leur fiche.",
    color=SEM_WARNING, title="Bonnes pratiques crédit"))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 6. STOCK
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('6. Suivre le stock et les ajustements', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph('6.1 Le stock en temps réel', style_h2))
story.append(Paragraph(
    "Le stock de chaque produit est mis à jour automatiquement à chaque vente : quand vous vendez "
    "3 unités d'un produit, son stock diminue de 3. Vous n'avez rien à faire manuellement. Le "
    "stock est visible dans la liste des produits et dans le tableau de bord. Les produits dont "
    "le stock est en dessous du seuil d'alerte sont mis en évidence pour vous prévenir d'une "
    "rupture imminente.",
    style_body))

story.append(Paragraph('6.2 Ajuster le stock manuellement', style_h2))
story.append(Paragraph(
    "Il arrive que le stock réel ne corresponde pas au stock informatique : pertes, casse, vol, "
    "ou erreur de saisie. Pour ajuster le stock d'un produit, ouvrez sa fiche et cliquez sur "
    "« Ajuster le stock ». Choisissez le type d'ajustement (réapprovisionnement, perte/casse, "
    "ou ajustement d'inventaire), saisissez la nouvelle quantité ou la différence, et ajoutez "
    "une raison (obligatoire pour la traçabilité). L'ajustement est horodaté et enregistré dans "
    "l'historique des mouvements de stock.",
    style_body))

adjust_data = [
    [Paragraph('<b>Type</b>', style_th), Paragraph('<b>Quand l\'utiliser</b>', style_th), Paragraph('<b>Effet</b>', style_th)],
    [Paragraph('Réapprovisionnement', style_td), Paragraph('Vous recevez une nouvelle livraison', style_td), Paragraph('+ quantité ajoutée', style_td)],
    [Paragraph('Perte / Casse', style_td), Paragraph('Produit endommagé, périmé, ou volé', style_td), Paragraph('- quantité perdue', style_td)],
    [Paragraph('Ajustement inventaire', style_td), Paragraph('Le stock réel ne correspond pas au stock informatique', style_td), Paragraph('= nouvelle quantité exacte', style_td)],
]
story.append(styled_table(adjust_data, [45*mm, 75*mm, 50*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('6.3 Historique des mouvements', style_h2))
story.append(Paragraph(
    "Chaque mouvement de stock (vente, ajustement, transfert) est enregistré dans l'historique. "
    "Vous pouvez consulter cet historique depuis la fiche d'un produit ou depuis un rapport global. "
    "Cela vous permet de traquer les écarts et d'identifier les anomalies (par exemple, un produit "
    "qui se vend anormalement vite, ou des ajustements de perte trop fréquents).",
    style_body))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 7. RAPPORTS
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('7. Consulter les rapports', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph('7.1 Les rapports disponibles', style_h2))
story.append(Paragraph(
    "Le menu « Rapports » vous donne accès à une vue synthétique de votre activité commerciale. "
    "Vous pouvez filtrer par période (aujourd'hui, cette semaine, ce mois, ou période personnalisée) "
    "pour analyser vos performances. Les rapports sont essentiels pour piloter votre magasin : "
    "identifier les produits qui se vendent le mieux, suivre l'évolution de votre chiffre d'affaires, "
    "et prendre des décisions d'achat et de prix.",
    style_body))

reports_data = [
    [Paragraph('<b>Rapport</b>', style_th), Paragraph('<b>Ce qu\'il montre</b>', style_th)],
    [Paragraph('Ventes', style_td), Paragraph('Chiffre d\'affaires, nombre de ventes, panier moyen, par jour/semaine/mois', style_td)],
    [Paragraph('Top produits', style_td), Paragraph('Produits les plus vendus en quantité et en valeur', style_td)],
    [Paragraph('Moyens de paiement', style_td), Paragraph('Répartition espèces / Wave / Orange Money / crédit', style_td)],
    [Paragraph('Dépenses', style_td), Paragraph('Vos achats et charges (loyer, électricité, transport)', style_td)],
    [Paragraph('Bénéfices', style_td), Paragraph('Marge brute = ventes - coût d\'achat des produits vendus', style_td)],
    [Paragraph('Crédits clients', style_td), Paragraph('Total des crédits en cours, clients en retard de paiement', style_td)],
]
story.append(styled_table(reports_data, [40*mm, 130*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('7.2 Exporter les rapports', style_h2))
story.append(Paragraph(
    "Tous les rapports peuvent être exportés au format PDF (pour impression ou archivage) ou "
    "Excel (pour analyse approfondie dans un tableur). Cliquez sur le bouton « Exporter » en "
    "haut du rapport, choisissez le format, et le fichier sera téléchargé sur votre appareil. "
    "L'export PDF est idéal pour partager le rapport avec votre comptable ou votre banquier.",
    style_body))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 8. OFFLINE
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('8. Travailler hors ligne (offline)', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph('8.1 Comment ça marche ?', style_h2))
story.append(Paragraph(
    "MakitiPlus a été conçu pour fonctionner dans des conditions de connexion internet instables, "
    "fréquentes en Afrique de l'Ouest. Quand vous perdez la connexion, l'application bascule "
    "automatiquement en mode hors ligne. Vous pouvez continuer à enregistrer des ventes, créer "
    "des produits, ajouter des clients — toutes les opérations essentielles restent disponibles. "
    "Les données sont stockées localement sur votre appareil et seront synchronisées avec le "
    "serveur dès que la connexion reviendra.",
    style_body))

story.append(Paragraph('8.2 Reconnaître le mode hors ligne', style_h2))
story.append(Paragraph(
    "Quand vous êtes hors ligne, un bandeau orange « Hors ligne » apparaît en haut de l'écran. "
    "Toutes les ventes que vous enregistrez sont mises en file d'attente. Le compteur de "
    "« tickets en attente de synchronisation » vous indique combien de ventes seront envoyées "
    "au serveur à la reconnexion. Vous n'avez rien à faire manuellement — la synchronisation "
    "est entièrement automatique.",
    style_body))

story.append(Paragraph('8.3 La synchronisation automatique', style_h2))
story.append(Paragraph(
    "Dès que votre appareil retrouve une connexion internet (Wi-Fi ou données mobiles), MakitiPlus "
    "envoie automatiquement toutes les ventes en attente vers le serveur. Un message de confirmation "
    "« X tickets synchronisés » s'affiche pour vous informer que tout est à jour. Si une vente "
    "n'a pas pu être synchronisée (par exemple, un produit a été supprimé entre-temps par un "
    "autre utilisateur), elle apparaît dans le menu « Conflits de synchronisation » pour traitement "
    "manuel. Ces conflits sont rares mais doivent être vérifiés.",
    style_body))

story.append(callout_box(
    "Le mode offline ne fonctionne que si vous avez déjà ouvert MakitiPlus au moins une fois "
    "avec une connexion internet. L'application doit être « chargée » dans le navigateur avant "
    "de pouvoir fonctionner hors ligne. Si vous fermez complètement le navigateur, vous devrez "
    "vous reconnecter avec internet avant de pouvoir utiliser le mode offline.",
    color=SEM_WARNING, title="Limitation importante"))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 9. REÇUS
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('9. Imprimer et envoyer des reçus', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph('9.1 Générer un reçu PDF', style_h2))
story.append(Paragraph(
    "Après chaque vente, vous pouvez générer un reçu au format PDF. Le reçu contient le nom de "
    "votre magasin, la date et l'heure, la liste des produits achetés avec leurs prix, le total, "
    "le moyen de paiement et, pour les ventes en espèces, la monnaie rendue. Le PDF est téléchargé "
    "automatiquement et peut être imprimé sur une imprimante classique ou une imprimante thermique.",
    style_body))

story.append(Paragraph('9.2 Envoyer un reçu par WhatsApp', style_h2))
story.append(Paragraph(
    "Si vous avez enregistré le numéro de téléphone d'un client, vous pouvez lui envoyer le reçu "
    "directement par WhatsApp. Après la vente, cliquez sur « Envoyer par WhatsApp ». MakitiPlus "
    "ouvre WhatsApp avec un message pré-rempli contenant le récapitulatif de la vente et un lien "
    "vers le reçu PDF. Le client n'a plus qu'à confirmer l'envoi. Cette fonctionnalité nécessite "
    "que WhatsApp soit installé sur l'appareil utilisé (smartphone ou tablette avec WhatsApp Web).",
    style_body))

story.append(Paragraph('9.3 Imprimante thermique', style_h2))
story.append(Paragraph(
    "MakitiPlus est compatible avec les imprimantes thermiques 58mm et 80mm couramment utilisées "
    "dans le commerce. Pour imprimer un reçu, générez le PDF puis utilisez la fonction d'impression "
    "de votre navigateur (Ctrl+P ou Cmd+P). Sélectionnez votre imprimante thermique et ajustez les "
    "marges si nécessaire. Le format du reçu s'adapte automatiquement à la largeur du papier.",
    style_body))

receipt_data = [
    [Paragraph('<b>Format</b>', style_th_c), Paragraph('<b>Largeur papier</b>', style_th_c), Paragraph('<b>Usage recommandé</b>', style_th)],
    [Paragraph('58mm', style_td_c), Paragraph('58 mm', style_td_c), Paragraph('Petits commerces, reçus courts', style_td)],
    [Paragraph('80mm', style_td_c), Paragraph('80 mm', style_td_c), Paragraph('Supermarchés, reçus détaillés', style_td)],
    [Paragraph('A4', style_td_c), Paragraph('210 mm', style_td_c), Paragraph('Impression classique, archivage', style_td)],
]
story.append(styled_table(receipt_data, [25*mm, 35*mm, 110*mm]))
story.append(Spacer(1, 10))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 10. DÉPANNAGE
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('10. Erreurs courantes et dépannage', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph('10.1 Problèmes de connexion', style_h2))

troubleshoot_data = [
    [Paragraph('<b>Problème</b>', style_th), Paragraph('<b>Cause probable</b>', style_th), Paragraph('<b>Solution</b>', style_th)],
    [Paragraph('Page blanche au démarrage', style_td), Paragraph('Cache navigateur ou service worker', style_td), Paragraph('Vider le cache (F12 > Application > Clear site data) puis recharger (Ctrl+Shift+R)', style_td)],
    [Paragraph('« Erreur de connexion »', style_td), Paragraph('Variables d\'environnement mal configurées', style_td), Paragraph('Contacter l\'administrateur MakitiPlus', style_td)],
    [Paragraph('Vente ne s\'enregistre pas', style_td), Paragraph('Connexion instable ou RPC indisponible', style_td), Paragraph('Vérifier la connexion, réessayer. La vente reste en file d\'attente.', style_td)],
    [Paragraph('Stock ne se met pas à jour', style_td), Paragraph('Synchronisation en cours ou retard', style_td), Paragraph('Attendre 30s, recharger la page (Ctrl+R)', style_td)],
    [Paragraph('Reçu PDF ne se télécharge pas', style_td), Paragraph('Bloqueur de pop-up ou navigateur', style_td), Paragraph('Autoriser les pop-ups pour makitiplus.onrender.com', style_td)],
    [Paragraph('Page « Session expirée »', style_td), Paragraph('Session JWT expirée (sécurité)', style_td), Paragraph('Se reconnecter avec email et mot de passe', style_td)],
]
story.append(styled_table(troubleshoot_data, [40*mm, 55*mm, 75*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('10.2 Quand contacter le support ?', style_h2))
story.append(Paragraph(
    "Si vous rencontrez un problème qui n'est pas listé ci-dessus, ou si les solutions proposées "
    "ne fonctionnent pas, contactez le support MakitiPlus. Avant de contacter le support, "
    "préparez les informations suivantes pour faciliter le diagnostic : la page concernée (URL), "
    "le message d'erreur exact affiché, une capture d'écran si possible, et l'heure à laquelle "
    "le problème est survenu.",
    style_body))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 11. SUPPORT
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('11. Assistance et support', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph('11.1 Canaux de support', style_h2))
story.append(Paragraph(
    "L'équipe MakitiPlus est à votre disposition pour vous accompagner pendant la phase pilote. "
    "Vous pouvez nous contacter via plusieurs canaux selon l'urgence de votre demande. Nous "
    "nous engageons à répondre dans les délais indiqués ci-dessous.",
    style_body))

support_data = [
    [Paragraph('<b>Canal</b>', style_th), Paragraph('<b>Urgence</b>', style_th), Paragraph('<b>Délai de réponse</b>', style_th_c), Paragraph('<b>Quand l\'utiliser</b>', style_th)],
    [Paragraph('WhatsApp', style_td), Paragraph('Haute', style_td), Paragraph('< 2h', style_td_c), Paragraph('Blocage complet (caisse ne marche pas)', style_td)],
    [Paragraph('Email', style_td), Paragraph('Moyenne', style_td), Paragraph('< 24h', style_td_c), Paragraph('Question d\'utilisation, bug non bloquant', style_td)],
    [Paragraph('Téléphone', style_td), Paragraph('Haute', style_td), Paragraph('Immédiat', style_td_c), Paragraph('Urgence pendant les heures d\'ouverture', style_td)],
    [Paragraph('In-app', style_td), Paragraph('Basse', style_td), Paragraph('< 48h', style_td_c), Paragraph('Suggestion, amélioration, retour', style_td)],
]
story.append(styled_table(support_data, [25*mm, 20*mm, 25*mm, 100*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('11.2 Bonnes pratiques pour le pilote', style_h2))
story.append(Paragraph(
    "Pendant la phase pilote, votre retour est essentiel pour améliorer MakitiPlus. Voici quelques "
    "bonnes pratiques pour tirer le meilleur parti de cette phase de test. Notez chaque problème "
    "rencontré (même mineur) avec la date, l'heure et la description. Testez toutes les "
    "fonctionnalités, même celles que vous n'utilisez pas habituellement. Donnez votre avis sur "
    "l'ergonomie et la facilité d'utilisation. Signalez toute confusion dans l'interface.",
    style_body))

story.append(Paragraph('11.3 Checklist de démarrage pilote', style_h2))
checklist_data = [
    [Paragraph('<b>#</b>', style_th_c), Paragraph('<b>Tâche</b>', style_th), Paragraph('<b>Fait</b>', style_th_c)],
    [Paragraph('1', style_td_c), Paragraph('Connexion réussie avec mes identifiants', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('2', style_td_c), Paragraph('Configuration du magasin (nom, devise, pays)', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('3', style_td_c), Paragraph('Création de 5 à 10 produits de test', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('4', style_td_c), Paragraph('Création de 2 à 3 catégories', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('5', style_td_c), Paragraph('Création de 2 à 3 clients de test', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('6', style_td_c), Paragraph('Enregistrement d\'une vente en espèces', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('7', style_td_c), Paragraph('Enregistrement d\'une vente à crédit', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('8', style_td_c), Paragraph('Génération d\'un reçu PDF', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('9', style_td_c), Paragraph('Test du mode offline (couper internet, vendre, reconnecter)', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('10', style_td_c), Paragraph('Consultation des rapports journaliers', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('11', style_td_c), Paragraph('Encaissement d\'un paiement de crédit partiel', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('12', style_td_c), Paragraph('Ajustement manuel d\'un stock', style_td), Paragraph('☐', style_td_c)],
]
story.append(styled_table(checklist_data, [10*mm, 145*mm, 15*mm]))
story.append(Spacer(1, 20))

story.append(HRFlowable(width='100%', thickness=1, color=ACCENT, spaceAfter=20))

# ════════════════════════════════════════════════════════════════════
# 12. TEST PILOTE 1 MOIS — GUIDE DE L'ADMINISTRATEUR
# ════════════════════════════════════════════════════════════════════
story.append(PageBreak())
story.append(Paragraph('12. Test pilote 1 mois — Guide de l\'administrateur', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph(
    "Ce chapitre est spécialement conçu pour l'administrateur du magasin pilote qui va utiliser "
    "MakitiPlus pendant 1 mois en conditions réelles. Il contient un calendrier de suivi hebdomadaire, "
    "des checklists de validation et des procédures de reporting pour s'assurer que le test se déroule "
    "dans les meilleures conditions.",
    style_body))

story.append(Paragraph('12.1 Objectifs du test pilote', style_h2))
story.append(Paragraph(
    "Le test pilote d'un mois a pour objectif de valider MakitiPlus en conditions réelles "
    "d'utilisation. À la fin du mois, nous devons avoir répondu aux questions suivantes : "
    "Le système est-il suffisamment stable pour un usage quotidien ? Les vendeurs arrivent-ils "
    "à l'utiliser sans formation excessive ? Le mode hors-ligne fonctionne-t-il correctement "
    "avec les coupures internet locales ? Les rapports sont-ils exacts et utiles ? Quelles "
    "améliorations prioritaires doivent être apportées avant la généralisation ?",
    style_body))

objectives_data = [
    [Paragraph('<b>Objectif</b>', style_th), Paragraph('<b>Critère de succès</b>', style_th)],
    [Paragraph('Stabilité système', style_td), Paragraph('0 erreur bloquante par jour après la semaine 1', style_td)],
    [Paragraph('Adoption utilisateurs', style_td), Paragraph('100% des ventes enregistrées via MakitiPlus', style_td)],
    [Paragraph('Mode hors-ligne', style_td), Paragraph('0 perte de données lors des coupures internet', style_td)],
    [Paragraph('Exactitude des rapports', style_td), Paragraph('Écart < 1% entre caisse physique et rapports', style_td)],
    [Paragraph('Satisfaction utilisateur', style_td), Paragraph('Note ≥ 7/10 au sondage de satisfaction', style_td)],
]
story.append(styled_table(objectives_data, [60*mm, 110*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('12.2 Calendrier de suivi hebdomadaire', style_h2))

story.append(Paragraph('Semaine 1 — Démarrage et prise en main', style_h3))
story.append(Paragraph(
    "La première semaine est consacrée à la configuration du système, à la formation de "
    "l'équipe et à la saisie du catalogue produits. L'objectif est d'être opérationnel "
    "à 100% dès la fin de la semaine. L'administrateur doit configurer le magasin, créer "
    "tous les produits avec leurs prix et stocks initiaux, former les vendeurs à l'utilisation "
    "de la caisse, et effectuer les 10 premières ventes de test. Un point de vérification "
    "quotidien avec l'équipe est recommandé pour identifier rapidement les difficultés.",
    style_body))

week1_data = [
    [Paragraph('<b>Jour</b>', style_th_c), Paragraph('<b>Activité</b>', style_th), Paragraph('<b>Validation</b>', style_th)],
    [Paragraph('Jour 1', style_td_c), Paragraph('Configuration magasin (nom, devise, pays, TVA). Création du compte admin.', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 2', style_td_c), Paragraph('Saisie du catalogue produits (minimum 20 produits) + catégories', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 3', style_td_c), Paragraph('Création des comptes vendeurs. Formation théorique (1h par vendeur)', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 4', style_td_c), Paragraph('Premières ventes réelles au POS. Test des paiements (espèces, Wave, OM)', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 5', style_td_c), Paragraph('Test du mode hors-ligne (couper internet, vendre, reconnecter). Vérification rapports.', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Week-end', style_td_c), Paragraph('Bilan semaine 1 : difficultés rencontrées, ajustements nécessaires', style_td), Paragraph('☐', style_td_c)],
]
story.append(styled_table(week1_data, [18*mm, 122*mm, 30*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('Semaine 2 — Utilisation quotidienne et crédit', style_h2))
story.append(Paragraph(
    "La deuxième semaine vise à généraliser l'utilisation de MakitiPlus pour toutes les ventes "
    "du magasin. L'administrateur doit s'assurer qu'aucune vente n'est enregistrée en dehors "
    "du système. C'est aussi le moment de tester la gestion des clients à crédit, qui est une "
    "fonctionnalité essentielle pour le commerce africain. À la fin de la semaine, un premier "
    "rapport de ventes doit être généré et comparé avec la caisse physique.",
    style_body))

week2_data = [
    [Paragraph('<b>Jour</b>', style_th_c), Paragraph('<b>Activité</b>', style_th), Paragraph('<b>Validation</b>', style_th)],
    [Paragraph('Jour 8', style_td_c), Paragraph('100% des ventes via MakitiPlus. Aucune vente manuelle.', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 9', style_td_c), Paragraph('Création des clients réguliers (minimum 10 clients)', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 10', style_td_c), Paragraph('Première vente à crédit + suivi du crédit client', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 11', style_td_c), Paragraph('Encaissement d\'un paiement de crédit partiel', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 12', style_td_c), Paragraph('Génération du rapport hebdomadaire. Comparaison avec caisse physique.', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Week-end', style_td_c), Paragraph('Bilan semaine 2 : écart caisse, bugs rencontrés, satisfaction vendeurs', style_td), Paragraph('☐', style_td_c)],
]
story.append(styled_table(week2_data, [18*mm, 122*mm, 30*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('Semaine 3 — Optimisation et multi-paiements', style_h2))
story.append(Paragraph(
    "La troisième semaine est consacrée à l'optimisation des flux de vente et à la validation "
    "des paiements Mobile Money (Wave, Orange Money). L'administrateur doit tester tous les "
    "scénarios de paiement, vérifier que les reçus PDF et WhatsApp fonctionnent correctement, "
    "et commencer à utiliser les rapports pour prendre des décisions (quels produits réapprovisionner, "
    "quels clients relancer pour le crédit). C'est aussi le moment d'ajuster les stocks si "
    "des écarts sont constatés.",
    style_body))

week3_data = [
    [Paragraph('<b>Jour</b>', style_th_c), Paragraph('<b>Activité</b>', style_th), Paragraph('<b>Validation</b>', style_th)],
    [Paragraph('Jour 15', style_td_c), Paragraph('Test complet des paiements Wave et Orange Money', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 16', style_td_c), Paragraph('Envoi de 3 reçus par WhatsApp à des clients', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 17', style_td_c), Paragraph('Ajustement des stocks (inventaire physique vs système)', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 18', style_td_c), Paragraph('Analyse des rapports : top produits, ventes par jour, crédit en cours', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 19', style_td_c), Paragraph('Test du sélecteur de magasin (si multi-boutiques)', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Week-end', style_td_c), Paragraph('Bilan semaine 3 : optimisations, bugs résiduels, suggestions', style_td), Paragraph('☐', style_td_c)],
]
story.append(styled_table(week3_data, [18*mm, 122*mm, 30*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('Semaine 4 — Bilan et recommandations', style_h2))
story.append(Paragraph(
    "La quatrième et dernière semaine du pilote est consacrée au bilan. L'administrateur doit "
    "générer le rapport mensuel complet, comparer les chiffres MakitiPlus avec la caisse physique "
    "sur tout le mois, lister tous les bugs rencontrés, et remplir le formulaire de satisfaction. "
    "Un entretien de 30 minutes avec chaque vendeur est recommandé pour recueillir leur retour. "
    "À la fin de la semaine, un rapport de pilote est envoyé à l'équipe MakitiPlus pour décider "
    "de la suite (généralisation, corrections, nouvelles fonctionnalités).",
    style_body))

week4_data = [
    [Paragraph('<b>Jour</b>', style_th_c), Paragraph('<b>Activité</b>', style_th), Paragraph('<b>Validation</b>', style_th)],
    [Paragraph('Jour 22', style_td_c), Paragraph('Génération du rapport mensuel complet (PDF + Excel)', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 23', style_td_c), Paragraph('Comparaison caisse physique vs MakitiPlus sur 1 mois', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 24', style_td_c), Paragraph('Entretien individuel avec chaque vendeur (30 min)', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 25', style_td_c), Paragraph('Remplissage du formulaire de satisfaction (voir 12.4)', style_td), Paragraph('☐', style_td_c)],
    [Paragraph('Jour 26', style_td_c), Paragraph('Envoi du rapport de pilote à contact@makitiplus.com', style_td), Paragraph('☐', style_td_c)],
]
story.append(styled_table(week4_data, [18*mm, 122*mm, 30*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('12.3 Checklist quotidienne administrateur', style_h2))
story.append(Paragraph(
    "Chaque jour, l'administrateur doit effectuer les vérifications suivantes. Cette checklist "
    "doit prendre moins de 5 minutes et permet de détecter rapidement les problèmes avant "
    "qu'ils ne deviennent bloquants. Elle est particulièrement importante pendant les deux "
    "premières semaines du pilote, où les bugs sont les plus susceptibles d'apparaître. "
    "Si un problème est détecté, il doit être signalé immédiatement via WhatsApp au support "
    "MakitiPlus.",
    style_body))

daily_data = [
    [Paragraph('<b>#</b>', style_th_c), Paragraph('<b>Vérification</b>', style_th), Paragraph('<b>Action si problème</b>', style_th)],
    [Paragraph('1', style_td_c), Paragraph('Le système démarre sans erreur', style_td), Paragraph('Vider le cache (F12 > Application > Clear site data)', style_td)],
    [Paragraph('2', style_td_c), Paragraph('Toutes les ventes d\'hier sont dans les rapports', style_td), Paragraph('Vérifier les conflits de synchronisation', style_td)],
    [Paragraph('3', style_td_c), Paragraph('Le stock correspond à la réalité', style_td), Paragraph('Faire un ajustement de stock', style_td)],
    [Paragraph('4', style_td_c), Paragraph('Aucun ticket en attente de synchronisation', style_td), Paragraph('Vérifier la connexion internet', style_td)],
    [Paragraph('5', style_td_c), Paragraph('Les crédits clients sont à jour', style_td), Paragraph('Encaisser les paiements reçus', style_td)],
]
story.append(styled_table(daily_data, [10*mm, 75*mm, 85*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('12.4 Formulaire de satisfaction (à remplir en semaine 4)', style_h2))
story.append(Paragraph(
    "À la fin du mois de pilote, l'administrateur doit remplir ce formulaire et l'envoyer "
    "à contact@makitiplus.com. Ce retour est essentiel pour améliorer le produit avant la "
    "généralisation. Soyez honnête et précis dans vos réponses — chaque retour compte.",
    style_body))

satisfaction_data = [
    [Paragraph('<b>Critère</b>', style_th), Paragraph('<b>Note (1-10)</b>', style_th_c), Paragraph('<b>Commentaires</b>', style_th)],
    [Paragraph('Facilité d\'utilisation de la caisse', style_td), Paragraph('___ / 10', style_td_c), Paragraph('', style_td)],
    [Paragraph('Stabilité du système (bugs/crashes)', style_td), Paragraph('___ / 10', style_td_c), Paragraph('', style_td)],
    [Paragraph('Mode hors-ligne (coupures internet)', style_td), Paragraph('___ / 10', style_td_c), Paragraph('', style_td)],
    [Paragraph('Gestion des clients à crédit', style_td), Paragraph('___ / 10', style_td_c), Paragraph('', style_td)],
    [Paragraph('Qualité des rapports', style_td), Paragraph('___ / 10', style_td_c), Paragraph('', style_td)],
    [Paragraph('Reçus PDF et WhatsApp', style_td), Paragraph('___ / 10', style_td_c), Paragraph('', style_td)],
    [Paragraph('Satisfaction globale', style_td), Paragraph('___ / 10', style_td_c), Paragraph('', style_td)],
]
story.append(styled_table(satisfaction_data, [55*mm, 25*mm, 90*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('12.5 Bugs et suggestions', style_h3))
story.append(Paragraph(
    "Listez ci-dessous tous les bugs rencontrés et les suggestions d'amélioration. "
    "Pour chaque bug, précisez : la page concernée, la description du problème, "
    "et s'il était bloquant ou non.",
    style_body))

bugs_data = [
    [Paragraph('<b>#</b>', style_th_c), Paragraph('<b>Description du bug ou suggestion</b>', style_th), Paragraph('<b>Bloquant ?</b>', style_th_c)],
    [Paragraph('1', style_td_c), Paragraph('', style_td), Paragraph('☐ Oui ☐ Non', style_td_c)],
    [Paragraph('2', style_td_c), Paragraph('', style_td), Paragraph('☐ Oui ☐ Non', style_td_c)],
    [Paragraph('3', style_td_c), Paragraph('', style_td), Paragraph('☐ Oui ☐ Non', style_td_c)],
    [Paragraph('4', style_td_c), Paragraph('', style_td), Paragraph('☐ Oui ☐ Non', style_td_c)],
    [Paragraph('5', style_td_c), Paragraph('', style_td), Paragraph('☐ Oui ☐ Non', style_td_c)],
]
story.append(styled_table(bugs_data, [10*mm, 120*mm, 40*mm]))
story.append(Spacer(1, 20))

story.append(HRFlowable(width='100%', thickness=1, color=ACCENT, spaceAfter=20))
story.append(Paragraph(
    '<font color="#A45852"><b>Merci de votre confiance.</b></font> Ce guide sera mis à jour '
    'régulièrement en fonction de vos retours. N\'hésitez pas à nous suggérer des améliorations '
    'ou à signaler des oublis. Bonne vente avec MakitiPlus !',
    ParagraphStyle('closing', fontName=BODY_FONT, fontSize=11, leading=16, textColor=TEXT_PRIMARY, alignment=TA_CENTER)))

# ════════════════════════════════════════════════════════════════════
# Build PDF
# ════════════════════════════════════════════════════════════════════
OUTPUT = '/home/z/my-project/download/guide-formation-magasin-pilote.pdf'

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    leftMargin=20*mm, rightMargin=20*mm,
    topMargin=20*mm, bottomMargin=20*mm,
    title='Guide de formation MakitiPlus — Magasin pilote',
    author='MakitiPlus',
    subject='Manuel de formation pour le démarrage d\'un magasin pilote',
    creator='Z.ai PDF Skill',
)

doc.build(story, onFirstPage=page_decorations, onLaterPages=page_decorations)
print(f'✓ PDF généré: {OUTPUT}')
print(f'  Taille: {os.path.getsize(OUTPUT)/1024:.1f} KB')
