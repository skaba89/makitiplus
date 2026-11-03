# MakitiPlus — Stratégie d'expansion africaine et architecture multi-pays

> **Date** : 2026-11-02 · **Principe** : on ne sort de Guinée qu'après y avoir prouvé l'adoption, la rétention et une marge positive par magasin (`GUINEA_MARKET_LAUNCH.md` §8, T4).

## 1. Séquence géographique

| Vague | Pays candidats | Critères de choix | Spécificités à couvrir |
|---|---|---|---|
| **1. Guinée** | Conakry puis intérieur | Marché d'origine, pilote existant | GNF, Orange Money GN, MTN MoMo GN, TVA 18 % |
| **2. Afrique de l'Ouest francophone** | Sénégal, Côte d'Ivoire, Mali | Proximité linguistique, diaspora commerçante guinéenne, XOF commun (UEMOA) | **Wave** dominant au Sénégal et en Côte d'Ivoire ; Orange Money ; TVA 18 % UEMOA (à confirmer par pays) |
| **3. Afrique francophone élargie + anglophone** | Cameroun, RDC (CDF/USD), Ghana, Nigeria | Taille de marché | Multi-devises au comptoir (RDC) ; M-Pesa, MTN, Airtel ; anglais ; concurrence Bumpa au Nigeria et au Ghana |
| **4. International** | Diaspora (France, Belgique, États-Unis : commerces africains), puis marchés émergents | Effet réseau fournisseurs ; paiement carte | E-invoicing (France 2026–2027), RGPD, fiscalité complexe |

**Critère de passage d'une vague à l'autre** (tous requis) : ≥ 70 % de rétention M3 sur la vague précédente, NPS ≥ 40, 0 incident P0 sur 90 jours, coût d'acquisition récupéré en moins de 12 mois.

## 2. Architecture cible multi-pays, multi-devises, multi-langues

### 2.1 Principes

1. **Le pays est une donnée de l'organisation, pas du code.** Aucune règle fiscale ou monétaire codée en dur dans l'interface.
2. **Montants stockés en unités mineures entières + code devise ISO 4217** pour toute nouvelle table financière. Les colonnes `numeric` existantes restent ; la migration se fait table par table, jamais en big-bang.
3. **Une transaction = une devise.** Les conversions sont des opérations explicites avec taux daté et source.
4. **Les connecteurs externes (paiement, SMS, WhatsApp, comptabilité) passent par des interfaces**, avec une implémentation par fournisseur et par pays.

### 2.2 Modèle de données (proposition, backlog MKP-022)

```
countries        (code ISO 3166, name, default_currency, default_locale, tax_profile_id, data_residency_region)
currencies       (code ISO 4217, minor_units, symbol, symbol_position)
tax_profiles     (id, country_code, name, valid_from, valid_to)
tax_rates        (id, tax_profile_id, code, rate_bps, applies_to [product_category|service], is_default, valid_from, valid_to)
tax_exemptions   (id, tax_profile_id, product_category, reason)
organizations    + country_code, base_currency, locale, tax_profile_id
stores           + country_code (nullable : hérite de l'organisation), currency (idem)
exchange_rates   (base, quote, rate, source, as_of)  -- existe partiellement côté affichage (useExchangeRates)
payment_providers(id, code, country_code, capabilities jsonb, status)
org_payment_accounts (organization_id, provider_id, credentials_ref -> Vault, status)
```

- **Historisation** : les taux de TVA ont des dates de validité ; une vente enregistre le taux appliqué (snapshot, comme `cost_price`).
- **Résidence des données** : un champ par pays permet plus tard de placer certaines organisations dans un projet Supabase régional si la loi l'exige.

### 2.3 Fiscalité configurable

- Moteur de calcul unique (`src/lib/taxUtils.ts` évoluera vers un module piloté par `tax_profiles`) : TTC ou HT, arrondis par devise, taux multiples par ligne, exonérations.
- Mentions légales du reçu par pays (numéro fiscal, adresse, mention « TVA non applicable »…) gérées comme des modèles.
- **E-invoicing** : interface `FiscalReporter` (no-op par défaut ; implémentations par pays quand une obligation existe). Pour la Guinée, aucune obligation de facture normalisée électronique n'a été confirmée (recherche du 2026-11-02 non concluante, **à vérifier auprès de la DGI**).

### 2.4 Connecteurs de paiement locaux (MKP-016)

```ts
interface PaymentConnector {
  code: string;                       // "paycard_gn", "wave_sn", "mpesa_ke"…
  initiate(req: { orgId; saleNumber; amountMinor; currency; payerPhone }): Promise<{ providerRef; status; redirectUrl? }>;
  verify(providerRef: string): Promise<{ status: "pending" | "succeeded" | "failed"; paidAmountMinor; paidAt? }>;
  parseWebhook(headers, rawBody): Promise<{ providerRef; status }>;   // signature vérifiée
}
```

- Exécution côté serveur uniquement (Edge Functions) ; identifiants dans un coffre (Supabase Vault), jamais dans le client.
- **Idempotence** : clé = `(organization_id, sale_number, provider)`. Une vente n'est marquée payée en mobile money qu'après `verify()` = `succeeded` (ou un webhook signé).
- **Hors-ligne** : on garde la saisie manuelle de la référence (existant) ; la vérification se fait à la synchronisation, et un écart remonte en clôture de caisse.
- **Ordre** : 1 agrégateur couvrant la Guinée (Paycard, CinetPay, Moneroo ou Lengo Pay, à choisir sur contrat, frais, délai de règlement et qualité de documentation), plutôt que des intégrations directes opérateur par opérateur. Les frais cités publiquement (≈ 1,5–4 %) proviennent de blogs commerciaux et divergent : **à négocier et vérifier**.

### 2.5 Langues

- Base i18next en place (`src/i18n/locales/fr`, `en`) avec tests de complétude.
- Ajout d'une langue = fichiers de traduction + test de complétude + relecture par un locuteur natif ; aucun texte en dur toléré dans les nouveaux écrans.
- Langues nationales guinéennes (pular, malinké, soussou) : surtout orales. Piste à tester (MKP-024) : messages vocaux courts et icônes plutôt que traduction écrite intégrale.
- Formats : nombres, dates et devises via `Intl` selon la locale de l'organisation.

## 3. Organisation pour l'expansion

| Fonction | Guinée | Vague 2 | Vague 3 |
|---|---|---|---|
| Produit et technique | Équipe centrale | Équipe centrale | Équipe centrale + 1 ingénieur intégrations |
| Ventes et terrain | 2 agents | 1 responsable pays + agents | Partenaires revendeurs |
| Support | WhatsApp FR | WhatsApp FR | FR + EN, horaires étendus |
| Juridique et fiscal | Conseil local | Conseil par pays | Conseil par pays |

## 4. Risques spécifiques

| Risque | Mitigation |
|---|---|
| Dévaluation monétaire (cas Kippa avec le naira) | Prix en monnaie locale révisables ; coûts d'infrastructure maîtrisés ; pas de matériel importé subventionné |
| Réglementation des données | Résidence des données configurable ; registre des traitements ; DPA par pays |
| Dépendance à un agrégateur de paiement | Interface `PaymentConnector`, au moins 2 fournisseurs par pays à partir de la vague 2 |
| Dilution de l'équipe | Pas plus d'un nouveau pays à la fois ; critères de passage du §1 |
