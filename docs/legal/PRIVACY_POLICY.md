# Politique de Confidentialité

**Dernière mise à jour : 11 juillet 2026**

## 1. Responsable du traitement

MakitiPlus est responsable du traitement des données personnelles collectées via le Service accessible à l'adresse https://makitiplus.onrender.com.

## 2. Données collectées

### 2.1 Données des utilisateurs (commerçants)
- Adresse email
- Nom et prénom
- Numéro de téléphone
- Nom de la boutique
- Données de connexion (horodatage, adresse IP)

### 2.2 Données des clients des commerçants
- Nom et prénom
- Numéro de téléphone
- Adresse email (optionnel)
- Historique d'achats et crédits

### 2.3 Données techniques
- Données d'utilisation anonymisées (Sentry)
- Données de performance (Web Vitals)
- Logs d'erreurs (sans données personnelles)

## 3. Finalités du traitement

| Donnée | Finalité | Base légale |
|--------|----------|-------------|
| Email, nom | Création et gestion du compte | Exécution du contrat |
| Téléphone | Envoi de reçus WhatsApp | Consentement |
| Données commerciales | Gestion de la boutique | Exécution du contrat |
| Données techniques | Amélioration du Service | Intérêt légitime |

## 4. Hébergement

Les données sont hébergées par :
- **Supabase** (PostgreSQL, Auth, Storage) — serveurs en Europe
- **Render** (frontend statique) — serveurs aux États-Unis

Aucune donnée n'est transférée en dehors de l'EEE sans garanties appropriées.

## 5. Durée de conservation

| Type de donnée | Durée |
|----------------|-------|
| Compte actif | Durée de l'abonnement |
| Données commerciales | Durée de l'abonnement + 90 jours |
| Logs de connexion | 12 mois |
| Données Sentry | 90 jours |
| Sauvegardes DB | 7 jours |

## 6. Droits des utilisateurs

Conformément à la loi guinéenne sur la protection des données :
- Droit d'accès aux données personnelles
- Droit de rectification
- Droit à l'effacement
- Droit à la portabilité
- Droit d'opposition

Pour exercer ces droits : contact@makitiplus.com

## 7. Sécurité

- Authentification par JWT (non stocké en localStorage)
- Chiffrement HTTPS (TLS 1.3)
- RLS (Row Level Security) sur toutes les tables
- Mots de passe hashés (bcrypt via Supabase Auth)
- Audit log des actions administratives

## 8. Contact

- Email : contact@makitiplus.com
- WhatsApp : +224 XXX XX XX XX

---

**MakitiPlus © 2026. Tous droits réservés.**
