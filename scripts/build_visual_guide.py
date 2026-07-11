#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Guide de formation visuel MakitiPlus — PDF avec captures d'écran
"""

import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable, Image as RLImage,
)
from reportlab.lib.utils import ImageReader

# Fonts
FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold')

# Colors
ACCENT = colors.HexColor('#A45852')
HEADER_FILL = colors.HexColor('#5A533E')
BORDER = colors.HexColor('#CEC9B8')
TEXT_PRIMARY = colors.HexColor('#262523')
TEXT_MUTED = colors.HexColor('#8A8881')
CARD_BG = colors.HexColor('#EAE9E5')
TABLE_STRIPE = colors.HexColor('#F5F4F3')
SEM_INFO = colors.HexColor('#4B77A2')
SEM_WARNING = colors.HexColor('#9C8048')
SEM_ERROR = colors.HexColor('#A45852')
SEM_SUCCESS = colors.HexColor('#479260')

BODY_FONT = 'NotoSerifSC'
BODY_BOLD = 'NotoSerifSC-Bold'

# Styles
style_h1 = ParagraphStyle('H1', fontName=BODY_BOLD, fontSize=20, leading=26,
    textColor=TEXT_PRIMARY, spaceBefore=20, spaceAfter=12, alignment=TA_LEFT)
style_h2 = ParagraphStyle('H2', fontName=BODY_BOLD, fontSize=14, leading=18,
    textColor=HEADER_FILL, spaceBefore=14, spaceAfter=8, alignment=TA_LEFT)
style_h3 = ParagraphStyle('H3', fontName=BODY_BOLD, fontSize=11, leading=15,
    textColor=ACCENT, spaceBefore=10, spaceAfter=6, alignment=TA_LEFT)
style_body = ParagraphStyle('Body', fontName=BODY_FONT, fontSize=10.5, leading=16,
    textColor=TEXT_PRIMARY, spaceAfter=8, alignment=TA_JUSTIFY)
style_step = ParagraphStyle('Step', fontName=BODY_FONT, fontSize=10.5, leading=15,
    textColor=TEXT_PRIMARY, spaceAfter=4, leftIndent=15, alignment=TA_LEFT)
style_th = ParagraphStyle('TH', fontName=BODY_BOLD, fontSize=9, leading=12,
    textColor=colors.white, alignment=TA_LEFT)
style_th_c = ParagraphStyle('THC', fontName=BODY_BOLD, fontSize=9, leading=12,
    textColor=colors.white, alignment=TA_CENTER)
style_td = ParagraphStyle('TD', fontName=BODY_FONT, fontSize=9.5, leading=13,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT)
style_td_c = ParagraphStyle('TDC', fontName=BODY_FONT, fontSize=9.5, leading=13,
    textColor=TEXT_PRIMARY, alignment=TA_CENTER)
style_caption = ParagraphStyle('Caption', fontName=BODY_FONT, fontSize=9, leading=12,
    textColor=TEXT_MUTED, alignment=TA_CENTER, spaceBefore=4, spaceAfter=12, italic=True)
style_callout = ParagraphStyle('Callout', fontName=BODY_BOLD, fontSize=10, leading=14,
    textColor=colors.white, alignment=TA_LEFT)

SCREENSHOT_DIR = '/home/z/my-project/scripts/screenshots'

def page_decorations(canvas, doc):
    canvas.saveState()
    page_w, page_h = A4
    canvas.setFillColor(ACCENT)
    canvas.rect(0, page_h - 8*mm, page_w, 8*mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont('FreeSerif-Bold', 8)
    canvas.drawString(20*mm, page_h - 5.5*mm, 'MAKITIPLUS · GUIDE VISUEL DE FORMATION')
    canvas.setFont('FreeSerif', 8)
    canvas.drawRightString(page_w - 20*mm, page_h - 5.5*mm, 'v2.0')
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.4)
    canvas.line(20*mm, 15*mm, page_w - 20*mm, 15*mm)
    canvas.setFont('FreeSerif', 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(20*mm, 10*mm, 'MakitiPlus — Guide visuel pas à pas')
    canvas.drawRightString(page_w - 20*mm, 10*mm, f'Page {doc.page}')
    canvas.restoreState()

def screenshot(filename, caption_text, width=160*mm):
    """Insère une capture d'écran avec légende."""
    path = os.path.join(SCREENSHOT_DIR, filename)
    if not os.path.exists(path):
        return [Paragraph(f'<i>[Capture: {filename}]</i>', style_caption)]
    img = RLImage(path, width=width, height=width*0.6)
    return [img, Paragraph(caption_text, style_caption)]

def callout_box(text, color=SEM_INFO, title=None):
    elements = []
    if title:
        elements.append(Paragraph(f'<font color="white"><b>{title}</b></font>', style_callout))
        elements.append(Paragraph(text, ParagraphStyle('cb_b', fontName=BODY_FONT, fontSize=9.5, leading=14, textColor=TEXT_PRIMARY, alignment=TA_LEFT)))
    else:
        elements.append(Paragraph(text, ParagraphStyle('cb_s', fontName=BODY_FONT, fontSize=9.5, leading=14, textColor=TEXT_PRIMARY, alignment=TA_LEFT)))
    t = Table([[e] for e in elements], colWidths=[170*mm])
    style_cmds = [
        ('LEFTPADDING', (0,0), (-1,-1), 10), ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('TOPPADDING', (0,0), (-1,-1), 6), ('BOTTOMPADDING', (0,0), (-1,-1), 6),
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
        ('LEFTPADDING', (0,0), (-1,-1), 6), ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
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

# ─── COVER ─────────────────────────────────────────────────────────
story.append(Spacer(1, 50*mm))
story.append(Paragraph('<font color="#A45852"><b>GUIDE VISUEL DE FORMATION</b></font>',
    ParagraphStyle('ck', fontName=BODY_BOLD, fontSize=14, textColor=ACCENT, alignment=TA_CENTER, spaceAfter=20)))
story.append(Paragraph('MakitiPlus',
    ParagraphStyle('ct', fontName=BODY_BOLD, fontSize=48, textColor=TEXT_PRIMARY, alignment=TA_CENTER, spaceAfter=8)))
story.append(Paragraph('Guide pas à pas avec captures d\'écran<br/>pour administrateurs et vendeurs',
    ParagraphStyle('cs', fontName=BODY_FONT, fontSize=16, textColor=TEXT_MUTED, alignment=TA_CENTER, spaceAfter=40, leading=24)))
story.append(HRFlowable(width='40%', thickness=2, color=ACCENT, spaceBefore=20, spaceAfter=30, hAlign='CENTER'))
story.append(Paragraph('Version 2.0 · Juillet 2026',
    ParagraphStyle('cm', fontName=BODY_FONT, fontSize=11, textColor=TEXT_MUTED, alignment=TA_CENTER)))
story.append(PageBreak())

# ─── SOMMAIRE ──────────────────────────────────────────────────────
story.append(Paragraph('Sommaire', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))
toc_data = [
    [Paragraph('<b>Chapitre</b>', style_th), Paragraph('<b>Titre</b>', style_th)],
    [Paragraph('1', style_td_c), Paragraph('Démarrage : connexion et tableau de bord', style_td)],
    [Paragraph('2', style_td_c), Paragraph('Configurer son magasin (Paramètres)', style_td)],
    [Paragraph('3', style_td_c), Paragraph('Créer le catalogue produits (étape par étape)', style_td)],
    [Paragraph('4', style_td_c), Paragraph('Enregistrer une vente au POS (étape par étape)', style_td)],
    [Paragraph('5', style_td_c), Paragraph('Gérer les clients et le crédit', style_td)],
    [Paragraph('6', style_td_c), Paragraph('Consulter les rapports', style_td)],
    [Paragraph('7', style_td_c), Paragraph('Créer des utilisateurs et des magasins', style_td)],
    [Paragraph('8', style_td_c), Paragraph('Travailler hors ligne (offline)', style_td)],
    [Paragraph('9', style_td_c), Paragraph('Dépannage : erreurs courantes et solutions', style_td)],
    [Paragraph('10', style_td_c), Paragraph('Calendrier pilote 1 mois', style_td)],
]
story.append(styled_table(toc_data, [25*mm, 145*mm]))
story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 1. DÉMARRAGE
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('1. Démarrage : connexion et tableau de bord', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph('1.1 Se connecter à MakitiPlus', style_h2))
story.append(Paragraph(
    "Pour accéder à MakitiPlus, ouvrez votre navigateur (Chrome, Firefox ou Edge) et rendez-vous "
    "à l'adresse fournie par votre administrateur. Si c'est votre première connexion, votre "
    "administrateur vous a fourni un email et un mot de passe temporaires.",
    style_body))

story.append(Paragraph('Étapes de connexion :', style_h3))
story.append(Paragraph('<b>Étape 1 :</b> Ouvrez votre navigateur et allez sur https://makitiplus.onrender.com/auth', style_step))
story.append(Paragraph('<b>Étape 2 :</b> Saisissez votre adresse email dans le champ « Email »', style_step))
story.append(Paragraph('<b>Étape 3 :</b> Saisissez votre mot de passe dans le champ « Mot de passe »', style_step))
story.append(Paragraph('<b>Étape 4 :</b> Cliquez sur le bouton orange « Se connecter »', style_step))
story.append(Paragraph('<b>Étape 5 :</b> Vous êtes redirigé vers le tableau de bord', style_step))

story.extend(screenshot('01-auth.png', 'Figure 1 — Page de connexion MakitiPlus'))

story.append(callout_box(
    "Si vous voyez le message « Erreur de connexion », vérifiez votre email et mot de passe. "
    "Si le problème persiste, demandez à votre administrateur de réinitialiser votre mot de passe.",
    color=SEM_WARNING, title="⚠️ En cas d'erreur de connexion"))

story.append(Paragraph('1.2 Le tableau de bord', style_h2))
story.append(Paragraph(
    "Après connexion, vous arrivez sur le tableau de bord. C'est la page principale qui vous donne "
    "un aperçu rapide de l'activité de votre magasin : ventes du jour, stock total, nombre de "
    "clients, crédits en cours. Les chiffres sont mis à jour en temps réel à chaque vente.",
    style_body))

story.append(Paragraph('Ce que vous voyez sur le tableau de bord :', style_h3))
story.append(Paragraph('<b>• En haut à gauche :</b> le nom de votre magasin et le logo', style_step))
story.append(Paragraph('<b>• En haut à droite :</b> le statut « En ligne » (vert) ou « Hors ligne » (orange)', style_step))
story.append(Paragraph('<b>• Cartes statistiques :</b> ventes du jour, stock, clients, crédits', style_step))
story.append(Paragraph('<b>• Menu latéral gauche :</b> navigation vers toutes les sections', style_step))
story.append(Paragraph('<b>• En bas :</b> le menu de navigation mobile (sur téléphone)', style_step))

story.extend(screenshot('05-dashboard.png', 'Figure 2 — Tableau de bord MakitiPlus'))

story.append(Paragraph('1.3 Naviguer dans le menu', style_h2))
story.append(Paragraph(
    "Le menu latéral gauche (ou le menu en bas sur mobile) vous permet d'accéder à toutes les "
    "sections de MakitiPlus. Voici l'ordre recommandé pour configurer votre magasin :",
    style_body))

menu_data = [
    [Paragraph('<b>Ordre</b>', style_th_c), Paragraph('<b>Menu</b>', style_th), Paragraph('<b>Quand l\'utiliser</b>', style_th)],
    [Paragraph('1', style_td_c), Paragraph('Paramètres', style_td), Paragraph('Configurer le magasin (nom, devise, logo)', style_td)],
    [Paragraph('2', style_td_c), Paragraph('Produits', style_td), Paragraph('Créer le catalogue des produits', style_td)],
    [Paragraph('3', style_td_c), Paragraph('Catégories', style_td), Paragraph('Organiser les produits par catégorie', style_td)],
    [Paragraph('4', style_td_c), Paragraph('Clients', style_td), Paragraph('Enregistrer les clients réguliers', style_td)],
    [Paragraph('5', style_td_c), Paragraph('Caisse (POS)', style_td), Paragraph('Enregistrer les ventes quotidiennes', style_td)],
    [Paragraph('6', style_td_c), Paragraph('Rapports', style_td), Paragraph('Consulter les statistiques de vente', style_td)],
    [Paragraph('7', style_td_c), Paragraph('Magasins', style_td), Paragraph('Gérer les boutiques (admin)', style_td)],
    [Paragraph('8', style_td_c), Paragraph('Utilisateurs', style_td), Paragraph('Créer des comptes vendeurs (admin)', style_td)],
]
story.append(styled_table(menu_data, [15*mm, 35*mm, 120*mm]))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 2. CONFIGURER SON MAGASIN
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('2. Configurer son magasin (Paramètres)', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph(
    "Avant d'enregistrer votre première vente, il est essentiel de configurer correctement "
    "votre magasin. Cette étape ne prend que 5 minutes mais détermine le comportement de "
    "votre caisse et l'apparence de vos reçus.",
    style_body))

story.append(Paragraph('2.1 Accéder aux paramètres', style_h2))
story.append(Paragraph('<b>Étape 1 :</b> Cliquez sur « Paramètres » dans le menu latéral gauche', style_step))
story.append(Paragraph('<b>Étape 2 :</b> Vous voyez plusieurs sections : Informations, Devise, TVA, Logo', style_step))

story.append(Paragraph('2.2 Configurer les informations du magasin', style_h2))
config_steps = [
    [Paragraph('<b>Champ</b>', style_th), Paragraph('<b>Valeur recommandée</b>', style_th), Paragraph('<b>Étapes</b>', style_th)],
    [Paragraph('Nom de la boutique', style_td), Paragraph('Le nom officiel', style_td), Paragraph('Saisir le nom → Sauvegarder', style_td)],
    [Paragraph('Devise', style_td), Paragraph('GNF (Franc Guinéen)', style_td), Paragraph('Sélectionner dans le menu déroulant', style_td)],
    [Paragraph('Pays', style_td), Paragraph('Guinée', style_td), Paragraph('Sélectionner dans le menu déroulant', style_td)],
    [Paragraph('Taux de TVA', style_td), Paragraph('Selon votre régime', style_td), Paragraph('Saisir le pourcentage (ex: 0 pour exempt)', style_td)],
    [Paragraph('Logo', style_td), Paragraph('Image carrée PNG', style_td), Paragraph('Cliquer « Choisir » → Sélectionner → Sauvegarder', style_td)],
]
story.append(styled_table(config_steps, [35*mm, 45*mm, 90*mm]))
story.append(Spacer(1, 10))

story.append(callout_box(
    "Le nom de la boutique et le logo apparaissent sur tous les reçus PDF envoyés aux clients. "
    "Prenez le temps de les configurer correctement dès le début.",
    color=SEM_INFO, title="💡 Important"))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 3. CATALOGUE PRODUITS
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('3. Créer le catalogue produits (étape par étape)', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph(
    "Le catalogue produits est le cœur de votre système de caisse. Sans produits enregistrés, "
    "vous ne pourrez pas enregistrer de ventes. Cette étape est la plus longue mais la plus "
    "importante — prévoyez 30 à 60 minutes pour saisir tous vos produits.",
    style_body))

story.append(Paragraph('3.1 Créer une catégorie (recommandé avant les produits)', style_h2))
story.append(Paragraph('<b>Étape 1 :</b> Cliquez sur « Catégories » dans le menu', style_step))
story.append(Paragraph('<b>Étape 2 :</b> Cliquez sur « Ajouter une catégorie »', style_step))
story.append(Paragraph('<b>Étape 3 :</b> Saisissez le nom (ex: « Boissons », « Alimentation »)', style_step))
story.append(Paragraph('<b>Étape 4 :</b> Cliquez sur « Sauvegarder »', style_step))
story.append(Paragraph('<b>Étape 5 :</b> Répétez pour chaque catégorie (5 à 10 maximum)', style_step))

story.append(Paragraph('3.2 Ajouter un produit', style_h2))
story.append(Paragraph('<b>Étape 1 :</b> Cliquez sur « Produits » dans le menu', style_step))
story.append(Paragraph('<b>Étape 2 :</b> Cliquez sur le bouton orange « Ajouter »', style_step))
story.append(Paragraph('<b>Étape 3 :</b> Saisissez le nom du produit (obligatoire)', style_step))
story.append(Paragraph('<b>Étape 4 :</b> Saisissez le prix de vente (obligatoire)', style_step))
story.append(Paragraph('<b>Étape 5 :</b> Saisissez le prix d\'achat (pour calculer la marge)', style_step))
story.append(Paragraph('<b>Étape 6 :</b> Saisissez la quantité en stock (obligatoire)', style_step))
story.append(Paragraph('<b>Étape 7 :</b> Saisissez le seuil d\'alerte (quantité minimum avant rupture)', style_step))
story.append(Paragraph('<b>Étape 8 :</b> Sélectionnez la catégorie (optionnel mais recommandé)', style_step))
story.append(Paragraph('<b>Étape 9 :</b> Saisissez le code-barres si vous en avez un (optionnel)', style_step))
story.append(Paragraph('<b>Étape 10 :</b> Cliquez sur « Sauvegarder »', style_step))

story.append(callout_box(
    "Commencez par saisir vos 20 produits les plus vendus. Vous pourrez ajouter les autres "
    "plus tard. L'important est de pouvoir enregistrer des ventes rapidement.",
    color=SEM_INFO, title="💡 Conseil pratique"))

story.append(Paragraph('3.3 Modifier ou supprimer un produit', style_h2))
story.append(Paragraph('<b>Modifier :</b> Cliquez sur le nom du produit dans la liste → modifiez les champs → Sauvegarder', style_step))
story.append(Paragraph('<b>Supprimer :</b> Cliquez sur l\'icône corbeille à droite → Confirmer', style_step))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 4. VENTE POS
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('4. Enregistrer une vente au POS (étape par étape)', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph(
    "L'écran de caisse (POS) est l'écran que vous utiliserez le plus. Il est divisé en deux : "
    "à gauche, la liste des produits ; à droite, le panier du client avec les options de paiement.",
    style_body))

story.append(Paragraph('4.1 Enregistrer une vente en espèces', style_h2))
story.append(Paragraph('<b>Étape 1 :</b> Cliquez sur « Caisse » dans le menu', style_step))
story.append(Paragraph('<b>Étape 2 :</b> Trouvez le produit (recherche ou clic dans la liste)', style_step))
story.append(Paragraph('<b>Étape 3 :</b> Cliquez sur le produit pour l\'ajouter au panier', style_step))
story.append(Paragraph('<b>Étape 4 :</b> Répétez pour chaque produit (le total s\'affiche à droite)', style_step))
story.append(Paragraph('<b>Étape 5 :</b> Cliquez sur « Encaisser »', style_step))
story.append(Paragraph('<b>Étape 6 :</b> Sélectionnez « Espèces »', style_step))
story.append(Paragraph('<b>Étape 7 :</b> Saisissez le montant reçu (ex: 10000 pour 10000 GNF)', style_step))
story.append(Paragraph('<b>Étape 8 :</b> Vérifiez la monnaie à rendre affichée', style_step))
story.append(Paragraph('<b>Étape 9 :</b> Cliquez sur « Valider »', style_step))
story.append(Paragraph('<b>Étape 10 :</b> Le reçu s\'affiche → cliquez « Reçu PDF » si besoin', style_step))

story.append(Paragraph('4.2 Enregistrer une vente à crédit', style_h2))
story.append(Paragraph('<b>Étape 1 à 5 :</b> Identique à la vente en espèces', style_step))
story.append(Paragraph('<b>Étape 6 :</b> Sélectionnez « Crédit client »', style_step))
story.append(Paragraph('<b>Étape 7 :</b> Sélectionnez le client dans la liste (ou créez-le)', style_step))
story.append(Paragraph('<b>Étape 8 :</b> Cliquez sur « Valider »', style_step))
story.append(Paragraph('<b>Étape 9 :</b> Le crédit du client est mis à jour automatiquement', style_step))

story.append(Paragraph('4.3 Les moyens de paiement disponibles', style_h2))
payment_data = [
    [Paragraph('<b>Moyen</b>', style_th), Paragraph('<b>Quand l\'utiliser</b>', style_th)],
    [Paragraph('Espèces', style_td), Paragraph('Paiement en cash (billets et pièces)', style_td)],
    [Paragraph('Wave', style_td), Paragraph('Transfert Wave', style_td)],
    [Paragraph('Orange Money', style_td), Paragraph('Transfert Orange Money', style_td)],
    [Paragraph('Mobile Money', style_td), Paragraph('Autres opérateurs mobile money', style_td)],
    [Paragraph('Crédit client', style_td), Paragraph('Vente à crédit — le client paiera plus tard', style_td)],
]
story.append(styled_table(payment_data, [40*mm, 130*mm]))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 5. CLIENTS ET CRÉDIT
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('5. Gérer les clients et le crédit', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph('5.1 Ajouter un client', style_h2))
story.append(Paragraph('<b>Étape 1 :</b> Cliquez sur « Clients » dans le menu', style_step))
story.append(Paragraph('<b>Étape 2 :</b> Cliquez sur « Ajouter »', style_step))
story.append(Paragraph('<b>Étape 3 :</b> Saisissez le nom (obligatoire)', style_step))
story.append(Paragraph('<b>Étape 4 :</b> Saisissez le téléphone (recommandé pour WhatsApp)', style_step))
story.append(Paragraph('<b>Étape 5 :</b> Saisissez l\'email (optionnel)', style_step))
story.append(Paragraph('<b>Étape 6 :</b> Définissez la limite de crédit (optionnel)', style_step))
story.append(Paragraph('<b>Étape 7 :</b> Cliquez sur « Sauvegarder »', style_step))

story.append(Paragraph('5.2 Encaisser un paiement de crédit', style_h2))
story.append(Paragraph('<b>Étape 1 :</b> Allez sur « Clients »', style_step))
story.append(Paragraph('<b>Étape 2 :</b> Cliquez sur le client concerné', style_step))
story.append(Paragraph('<b>Étape 3 :</b> Cliquez sur « Paiement de crédit »', style_step))
story.append(Paragraph('<b>Étape 4 :</b> Saisissez le montant encaissé', style_step))
story.append(Paragraph('<b>Étape 5 :</b> Sélectionnez le moyen de paiement', style_step))
story.append(Paragraph('<b>Étape 6 :</b> Cliquez sur « Valider »', style_step))
story.append(Paragraph('<b>Étape 7 :</b> Le crédit restant s\'affiche', style_step))

story.append(callout_box(
    "Vérifiez les crédits en cours au moins une fois par semaine. Relancez les clients dont "
    "le crédit dépasse la limite. Vous pouvez envoyer un récapitulatif par WhatsApp.",
    color=SEM_WARNING, title="⚠️ Bonnes pratiques crédit"))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 6. RAPPORTS
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('6. Consulter les rapports', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph('6.1 Accéder aux rapports', style_h2))
story.append(Paragraph('<b>Étape 1 :</b> Cliquez sur « Rapports » dans le menu', style_step))
story.append(Paragraph('<b>Étape 2 :</b> Sélectionnez la période (Aujourd\'hui, Cette semaine, Ce mois)', style_step))
story.append(Paragraph('<b>Étape 3 :</b> Les statistiques s\'affichent automatiquement', style_step))

story.append(Paragraph('6.2 Ce que vous pouvez voir', style_h2))
reports_data = [
    [Paragraph('<b>Rapport</b>', style_th), Paragraph('<b>Ce qu\'il montre</b>', style_th)],
    [Paragraph('Ventes', style_td), Paragraph('Chiffre d\'affaires, nombre de ventes, panier moyen', style_td)],
    [Paragraph('Top produits', style_td), Paragraph('Produits les plus vendus en quantité et valeur', style_td)],
    [Paragraph('Moyens de paiement', style_td), Paragraph('Répartition espèces / Wave / OM / crédit', style_td)],
    [Paragraph('Dépenses', style_td), Paragraph('Vos achats et charges', style_td)],
    [Paragraph('Bénéfices', style_td), Paragraph('Marge brute = ventes - coût d\'achat', style_td)],
    [Paragraph('Crédits clients', style_td), Paragraph('Total des crédits en cours', style_td)],
]
story.append(styled_table(reports_data, [40*mm, 130*mm]))

story.append(Paragraph('6.3 Exporter un rapport', style_h2))
story.append(Paragraph('<b>Étape 1 :</b> Allez sur « Rapports »', style_step))
story.append(Paragraph('<b>Étape 2 :</b> Sélectionnez la période', style_step))
story.append(Paragraph('<b>Étape 3 :</b> Cliquez sur « Exporter PDF » ou « Exporter Excel »', style_step))
story.append(Paragraph('<b>Étape 4 :</b> Le fichier se télécharge sur votre appareil', style_step))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 7. UTILISATEURS ET MAGASINS
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('7. Créer des utilisateurs et des magasins', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph('7.1 Créer un utilisateur (admin uniquement)', style_h2))
story.append(Paragraph('<b>Étape 1 :</b> Cliquez sur « Utilisateurs » dans le menu', style_step))
story.append(Paragraph('<b>Étape 2 :</b> Cliquez sur « Nouvel utilisateur »', style_step))
story.append(Paragraph('<b>Étape 3 :</b> Saisissez l\'email (doit être nouveau)', style_step))
story.append(Paragraph('<b>Étape 4 :</b> Saisissez le mot de passe (8+ caractères)', style_step))
story.append(Paragraph('<b>Étape 5 :</b> Saisissez le nom de l\'utilisateur', style_step))
story.append(Paragraph('<b>Étape 6 :</b> Sélectionnez le rôle (vendeur, manager, admin)', style_step))
story.append(Paragraph('<b>Étape 7 :</b> Cliquez sur « Créer »', style_step))

role_data = [
    [Paragraph('<b>Rôle</b>', style_th), Paragraph('<b>Accès</b>', style_th)],
    [Paragraph('Admin', style_td), Paragraph('Tout : produits, ventes, clients, rapports, utilisateurs, magasins', style_td)],
    [Paragraph('Manager', style_td), Paragraph('Produits, stock, rapports, activité vendeurs', style_td)],
    [Paragraph('Vendeur', style_td), Paragraph('Caisse (POS) uniquement', style_td)],
    [Paragraph('Comptable', style_td), Paragraph('Rapports et dépenses', style_td)],
]
story.append(styled_table(role_data, [30*mm, 140*mm]))

story.append(Paragraph('7.2 Créer un magasin (admin uniquement)', style_h2))
story.append(Paragraph('<b>Étape 1 :</b> Cliquez sur « Magasins » dans le menu', style_step))
story.append(Paragraph('<b>Étape 2 :</b> Cliquez sur « Ajouter un magasin »', style_step))
story.append(Paragraph('<b>Étape 3 :</b> Saisissez le nom du magasin', style_step))
story.append(Paragraph('<b>Étape 4 :</b> Sélectionnez la catégorie', style_step))
story.append(Paragraph('<b>Étape 5 :</b> Sélectionnez le pays et la devise', style_step))
story.append(Paragraph('<b>Étape 6 :</b> Cliquez sur « Créer »', style_step))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 8. MODE OFFLINE
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('8. Travailler hors ligne (offline)', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph(
    "MakitiPlus fonctionne même sans internet. Quand vous perdez la connexion, un bandeau "
    "orange « Hors ligne » apparaît en haut. Vous pouvez continuer à vendre normalement.",
    style_body))

story.append(Paragraph('8.1 Que faire quand internet coupe ?', style_h2))
story.append(Paragraph('<b>1.</b> Ne paniquez pas — continuez à vendre normalement', style_step))
story.append(Paragraph('<b>2.</b> Le bandeau « Hors ligne » s\'affiche en haut', style_step))
story.append(Paragraph('<b>3.</b> Les ventes sont stockées sur votre appareil', style_step))
story.append(Paragraph('<b>4.</b> Le compteur « tickets en attente » s\'affiche', style_step))

story.append(Paragraph('8.2 Que faire quand internet revient ?', style_h2))
story.append(Paragraph('<b>1.</b> Le système synchronise automatiquement', style_step))
story.append(Paragraph('<b>2.</b> Le message « X tickets synchronisés » s\'affiche', style_step))
story.append(Paragraph('<b>3.</b> Vérifiez l\'onglet « Conflits sync » si des erreurs', style_step))

story.append(callout_box(
    "Le mode offline ne fonctionne que si vous avez déjà ouvert MakitiPlus au moins une fois "
    "avec internet. Si vous fermez complètement le navigateur, vous devrez vous reconnecter "
    "avec internet avant de pouvoir utiliser le mode offline.",
    color=SEM_WARNING, title="⚠️ Limitation importante"))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 9. DÉPANNAGE
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('9. Dépannage : erreurs courantes et solutions', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph('9.1 Erreurs de connexion', style_h2))
troubleshoot_data = [
    [Paragraph('<b>Problème</b>', style_th), Paragraph('<b>Cause</b>', style_th), Paragraph('<b>Solution</b>', style_th)],
    [Paragraph('Page blanche', style_td), Paragraph('Cache navigateur', style_td), Paragraph('F12 → Application → Clear site data → Ctrl+Shift+R', style_td)],
    [Paragraph('« Erreur de connexion »', style_td), Paragraph('Email/mot de passe incorrects', style_td), Paragraph('Vérifier les identifiants ou demander reset', style_td)],
    [Paragraph('Vente ne s\'enregistre pas', style_td), Paragraph('Connexion instable', style_td), Paragraph('Attendre, la vente reste en file d\'attente', style_td)],
    [Paragraph('Stock ne se met pas à jour', style_td), Paragraph('Sync en cours', style_td), Paragraph('Attendre 30s, recharger (Ctrl+R)', style_td)],
    [Paragraph('Reçu PDF ne se télécharge pas', style_td), Paragraph('Pop-up bloqué', style_td), Paragraph('Autoriser les pop-ups pour makitiplus.onrender.com', style_td)],
    [Paragraph('« Session expirée »', style_td), Paragraph('Session JWT expirée', style_td), Paragraph('Se déconnecter puis se reconnecter', style_td)],
]
story.append(styled_table(troubleshoot_data, [40*mm, 45*mm, 85*mm]))

story.append(Paragraph('9.2 Procédure de nettoyage du cache', style_h2))
story.append(Paragraph(
    "Si vous rencontrez des bugs d'affichage ou des pages qui ne chargent pas, la première "
    "étape est toujours de vider le cache du navigateur. Cette procédure résout 80% des problèmes.",
    style_body))
story.append(Paragraph('<b>Étape 1 :</b> Appuyez sur F12 (DevTools)', style_step))
story.append(Paragraph('<b>Étape 2 :</b> Allez dans l\'onglet « Application »', style_step))
story.append(Paragraph('<b>Étape 3 :</b> Cliquez sur « Service Workers » → « Unregister »', style_step))
story.append(Paragraph('<b>Étape 4 :</b> Cliquez sur « Storage » → « Clear site data »', style_step))
story.append(Paragraph('<b>Étape 5 :</b> Fermez l\'onglet', style_step))
story.append(Paragraph('<b>Étape 6 :</b> Ouvrez un nouvel onglet → reconnectez-vous', style_step))
story.append(Paragraph('<b>Étape 7 :</b> Appuyez sur Ctrl+Shift+R (rechargement forcé)', style_step))

story.append(Paragraph('9.3 Erreurs sur son propre compte', style_h2))
story.append(Paragraph(
    "Si vous rencontrez une erreur sur votre propre compte (par exemple, vous ne voyez pas "
    "vos données, ou vous voyez celles d'un autre magasin), voici les étapes à suivre :",
    style_body))

account_errors = [
    [Paragraph('<b>Problème</b>', style_th), Paragraph('<b>Solution</b>', style_th)],
    [Paragraph('Je ne vois pas mes produits', style_td), Paragraph('1. Vider le cache (procédure 9.2) → 2. Se reconnecter → 3. Vérifier le sélecteur de magasin en haut', style_td)],
    [Paragraph('Je ne vois pas mes ventes', style_td), Paragraph('1. Vider le cache → 2. Vérifier l\'onglet « Conflits sync » → 3. Attendre 30s', style_td)],
    [Paragraph('Je vois les données d\'un autre magasin', style_td), Paragraph('1. Se déconnecter immédiatement → 2. Vider le cache → 3. Se reconnecter → 4. Signaler au support', style_td)],
    [Paragraph('Mon crédit client est faux', style_td), Paragraph('1. Vérifier l\'historique des ventes → 2. Vérifier les paiements encaissés → 3. Signaler si écart', style_td)],
    [Paragraph('Je ne peux pas créer de produit', style_td), Paragraph('1. Vérifier votre rôle (vendeur ne peut pas) → 2. Demander à l\'admin les droits', style_td)],
    [Paragraph('Je ne peux pas créer d\'utilisateur', style_td), Paragraph('1. Vérifier votre rôle (admin uniquement) → 2. Contacter le super_admin', style_td)],
]
story.append(styled_table(account_errors, [55*mm, 115*mm]))

story.append(Paragraph('9.4 Quand contacter le support ?', style_h2))
story.append(Paragraph(
    "Si aucune des solutions ci-dessus ne fonctionne, contactez le support MakitiPlus. "
    "Avant de contacter, préparez : la page concernée (URL), le message d\'erreur exact, "
    "une capture d\'écran si possible, et l\'heure du problème.",
    style_body))

support_data = [
    [Paragraph('<b>Canal</b>', style_th), Paragraph('<b>Urgence</b>', style_th), Paragraph('<b>Délai</b>', style_th_c), Paragraph('<b>Quand</b>', style_th)],
    [Paragraph('WhatsApp', style_td), Paragraph('Haute', style_td), Paragraph('< 2h', style_td_c), Paragraph('Caisse ne marche pas', style_td)],
    [Paragraph('Email', style_td), Paragraph('Moyenne', style_td), Paragraph('< 24h', style_td_c), Paragraph('Bug non bloquant', style_td)],
    [Paragraph('Téléphone', style_td), Paragraph('Haute', style_td), Paragraph('Immédiat', style_td_c), Paragraph('Urgence heures ouvrables', style_td)],
]
story.append(styled_table(support_data, [25*mm, 20*mm, 25*mm, 100*mm]))

story.append(PageBreak())

# ════════════════════════════════════════════════════════════════════
# 10. CALENDRIER PILOTE 1 MOIS
# ════════════════════════════════════════════════════════════════════
story.append(Paragraph('10. Calendrier pilote 1 mois', style_h1))
story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceAfter=14))

story.append(Paragraph(
    "Ce calendrier guide l'administrateur pendant le mois de pilote. Chaque semaine a un "
    "objectif précis. À la fin du mois, un rapport de satisfaction est envoyé à MakitiPlus.",
    style_body))

week_data = [
    [Paragraph('<b>Semaine</b>', style_th_c), Paragraph('<b>Objectif</b>', style_th), Paragraph('<b>Activités clés</b>', style_th)],
    [Paragraph('Semaine 1', style_td_c), Paragraph('Démarrage', style_td), Paragraph('Config magasin, catalogue (20+ produits), formation vendeurs, 1ères ventes, test offline', style_td)],
    [Paragraph('Semaine 2', style_td_c), Paragraph('Quotidien', style_td), Paragraph('100% ventes via MakitiPlus, clients à crédit, rapport hebdo, comparaison caisse', style_td)],
    [Paragraph('Semaine 3', style_td_c), Paragraph('Optimisation', style_td), Paragraph('Wave/Orange Money, reçus WhatsApp, ajustement stock, analyse rapports', style_td)],
    [Paragraph('Semaine 4', style_td_c), Paragraph('Bilan', style_td), Paragraph('Rapport mensuel, comparaison caisse, entretiens vendeurs, formulaire satisfaction', style_td)],
]
story.append(styled_table(week_data, [22*mm, 28*mm, 120*mm]))
story.append(Spacer(1, 10))

story.append(Paragraph('10.1 Checklist quotidienne (5 min chaque matin)', style_h2))
daily_data = [
    [Paragraph('<b>#</b>', style_th_c), Paragraph('<b>Vérification</b>', style_th), Paragraph('<b>Action si problème</b>', style_th)],
    [Paragraph('1', style_td_c), Paragraph('Le système démarre sans erreur', style_td), Paragraph('Vider le cache (F12 > Application > Clear site data)', style_td)],
    [Paragraph('2', style_td_c), Paragraph('Toutes les ventes d\'hier sont dans les rapports', style_td), Paragraph('Vérifier les conflits de synchronisation', style_td)],
    [Paragraph('3', style_td_c), Paragraph('Le stock correspond à la réalité', style_td), Paragraph('Faire un ajustement de stock', style_td)],
    [Paragraph('4', style_td_c), Paragraph('Aucun ticket en attente de synchronisation', style_td), Paragraph('Vérifier la connexion internet', style_td)],
    [Paragraph('5', style_td_c), Paragraph('Les crédits clients sont à jour', style_td), Paragraph('Encaisser les paiements reçus', style_td)],
]
story.append(styled_table(daily_data, [10*mm, 75*mm, 85*mm]))

story.append(Spacer(1, 20))
story.append(HRFlowable(width='100%', thickness=1, color=ACCENT, spaceAfter=20))
story.append(Paragraph(
    '<font color="#A45852"><b>Merci de votre confiance.</b></font> Bonne vente avec MakitiPlus !',
    ParagraphStyle('closing', fontName=BODY_FONT, fontSize=11, leading=16, textColor=TEXT_PRIMARY, alignment=TA_CENTER)))

# ════════════════════════════════════════════════════════════════════
# Build PDF
# ════════════════════════════════════════════════════════════════════
OUTPUT = '/home/z/my-project/download/guide-visuel-formation-makitiplus.pdf'

doc = SimpleDocTemplate(
    OUTPUT, pagesize=A4,
    leftMargin=20*mm, rightMargin=20*mm,
    topMargin=20*mm, bottomMargin=20*mm,
    title='Guide visuel de formation MakitiPlus',
    author='MakitiPlus',
    subject='Guide pas à pas avec captures d\'écran',
    creator='Z.ai PDF Skill',
)

doc.build(story, onFirstPage=page_decorations, onLaterPages=page_decorations)
print(f'✓ PDF généré: {OUTPUT}')
print(f'  Taille: {os.path.getsize(OUTPUT)/1024:.1f} KB')
