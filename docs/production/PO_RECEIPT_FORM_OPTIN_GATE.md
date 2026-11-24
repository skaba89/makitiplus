# Formulaire de réception fournisseur — intégration opt-in (NON ACTIVE)

Le formulaire `ReceiveOrderForm.tsx` comprend désormais deux branches :

- **Par défaut**, le flux historique `receive_purchase_order` est conservé
  sans modification.
- **Seulement après deux validations de déploiement explicites**, la nouvelle
  branche appelle `submitPurchaseReceipt` avec l'identité authentifiée
  organisation+utilisateur+commande et la RPC idempotente
  `receive_purchase_order_once`. Les interruptions réseau conservent
  l'UUID et les quantités dans IndexedDB. À la réouverture du formulaire,
  une réception en attente bloque les éditions et expose un bouton de
  nouvelle tentative réutilisant le panier enregistré.

Les deux variables Vite suivantes doivent **toutes les deux** valoir
exactement `true` pour préparer un build opt-in :

- `VITE_PO_RECEIPT_ONCE_ENABLED`
- `VITE_PO_RECEIPT_ONCE_RELEASE_APPROVED`

Aucune n'est fournie par défaut. Ne pas les définir dans le build de
production avant la décision formelle de bascule. Ces variables sont
compilées dans le frontend : elles ne sont **pas** une autorisation
utilisateur ni un secret ; le serveur reste responsable de tous les
contrôles d'accès.

## Critères bloquants

1. Migration PostgreSQL officielle non déployée : **NO-GO**.
2. Anciennes PWA encore capables d'utiliser les RPC historiques sans
   traitement compatible et documenté : **NO-GO**.
3. Audit des permissions et des données historiques non validé : **NO-GO**.
4. Test métier en recette avec connexion interrompue *après* COMMIT
   manquant : **NO-GO**.
5. Sauvegarde, restauration isolée, monitoring et décision humaine
   de PROD manquants : **NO-GO**.

La présence du code opt-in en `main` ne signifie pas que la nouvelle
réception est activée. Ne pas contourner l'outbox, ne pas basculer en
secours vers l'ancienne RPC et ne pas fabriquer de nouvel UUID quand
la lecture IndexedDB échoue.

Limites non résolues : synchronisation automatique en arrière-plan,
plusieurs onglets/appareils simultanés, réconciliation serveur avancée,
preuve de disponibilité du RPC en recette, et remplacement des anciennes
PWA installées.
