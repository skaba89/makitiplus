import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";

/**
 * Politique de confidentialité — audit produit du 2026-08-10.
 *
 * BROUILLON : contenu factuel basé sur les données réellement collectées
 * par l'application (voir le schéma Supabase et les intégrations
 * existantes), mais PAS relu par un juriste. Les informations d'identité
 * légale de l'entreprise (dénomination sociale, adresse, numéro
 * d'immatriculation) sont des espaces réservés à compléter -- ne jamais
 * publier tel quel sans validation juridique et sans avoir rempli ces
 * champs avec les vraies informations de l'entreprise.
 *
 * Non i18n-wired, à l'identique des autres composants de src/components/landing/
 * (le site vitrine public n'est pas encore internationalisé).
 */
export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 sm:pt-28 pb-16">
        <div className="container-app max-w-3xl mx-auto prose prose-sm sm:prose-base dark:prose-invert">
          <div className="mb-8 p-4 rounded-lg border border-warning/40 bg-warning/10 text-sm not-prose">
            <p className="font-semibold mb-1">⚠️ Brouillon en attente de relecture juridique</p>
            <p className="text-muted-foreground">
              Ce document décrit factuellement les données traitées par
              MakitiPlus, mais n'a pas encore été validé par un juriste ni
              complété avec les informations légales définitives de
              l'entreprise (dénomination, adresse, immatriculation). Ne pas
              considérer comme juridiquement opposable avant complétion et
              relecture.
            </p>
          </div>

          <h1>Politique de confidentialité</h1>
          <p className="text-muted-foreground">Dernière mise à jour : à compléter</p>

          <h2>1. Responsable du traitement</h2>
          <p>
            [Dénomination sociale à compléter], [forme juridique à
            compléter], immatriculée sous le numéro [RCCM/registre du
            commerce à compléter], dont le siège social est situé
            [adresse à compléter]. Contact :{" "}
            <a href="mailto:contact@makitiplus.com">contact@makitiplus.com</a>.
          </p>

          <h2>2. Données que nous collectons</h2>
          <ul>
            <li>
              <strong>Compte utilisateur</strong> : nom, adresse email,
              numéro de téléphone (optionnel), rôle (administrateur, manager,
              vendeur, comptable...).
            </li>
            <li>
              <strong>Données de votre organisation</strong> : nom du
              commerce, pays, devise, boutiques (le cas échéant).
            </li>
            <li>
              <strong>Données commerciales que vous saisissez</strong> :
              produits et stock, ventes, clients (nom, téléphone, historique
              de crédit), fournisseurs, dépenses, sessions de caisse.
            </li>
            <li>
              <strong>Données de paiement</strong> : mode de paiement choisi
              et, pour les paiements Mobile Money (Wave, Orange Money, MTN
              Money, Moov Money, M-Pesa), une référence de transaction
              saisie manuellement par vous à titre de justificatif. Nous ne
              collectons ni ne stockons jamais de numéro de carte bancaire :
              les paiements par carte, lorsque cette option est activée,
              sont traités directement par notre prestataire de paiement
              (Stripe), qui ne nous transmet aucune donnée de carte brute.
            </li>
            <li>
              <strong>Données techniques</strong> : journaux d'erreurs et de
              performance (via Sentry), pouvant inclure un échantillon de
              sessions de navigation à des fins de diagnostic, adresse IP,
              type d'appareil et navigateur.
            </li>
          </ul>

          <h2>3. Pourquoi nous collectons ces données</h2>
          <ul>
            <li>Fournir le service (gestion de caisse, stock, ventes, rapports).</li>
            <li>Assurer le support technique et résoudre les incidents.</li>
            <li>Sécuriser la plateforme et prévenir la fraude.</li>
            <li>Améliorer le produit à partir de constats d'usage réels.</li>
            <li>Respecter nos obligations légales et comptables.</li>
          </ul>

          <h2>4. Qui héberge et traite ces données</h2>
          <p>Nous faisons appel aux prestataires suivants pour opérer le service :</p>
          <ul>
            <li><strong>Supabase</strong> — base de données et authentification.</li>
            <li><strong>Render</strong> — hébergement de l'application.</li>
            <li><strong>Sentry</strong> — surveillance des erreurs et de la performance.</li>
            <li><strong>Stripe</strong> (si le paiement par carte est activé sur votre plan) — traitement des paiements par carte bancaire.</li>
          </ul>
          <p>
            [Région(s) d'hébergement des données à préciser.] Ces
            prestataires peuvent impliquer un transfert de données hors de
            votre pays de résidence ; nous nous assurons qu'ils offrent des
            garanties de sécurité appropriées.
          </p>

          <h2>5. Combien de temps conservons-nous vos données</h2>
          <p>
            Vos données sont conservées pendant toute la durée d'utilisation
            de votre compte, puis pendant une durée additionnelle nécessaire
            au respect de nos obligations légales et comptables [durée
            précise à définir]. Vous pouvez demander la suppression de votre
            compte et de vos données à tout moment (voir section 7).
          </p>

          <h2>6. Vos données ne sont jamais vendues</h2>
          <p>
            Nous ne vendons ni ne louons vos données commerciales ou
            personnelles à des tiers à des fins publicitaires. Elles ne sont
            partagées qu'avec les prestataires listés en section 4, dans la
            stricte mesure nécessaire à la fourniture du service.
          </p>

          <h2>7. Vos droits</h2>
          <p>
            Vous pouvez à tout moment demander l'accès, la rectification, la
            portabilité ou la suppression de vos données personnelles en
            nous contactant à{" "}
            <a href="mailto:contact@makitiplus.com">contact@makitiplus.com</a>.
            Un mécanisme d'export/suppression en libre-service n'est pas
            encore disponible directement dans l'interface : ces demandes
            sont traitées manuellement par notre équipe.
          </p>

          <h2>8. Sécurité</h2>
          <p>
            Vos données sont protégées par un contrôle d'accès strict au
            niveau de la base de données (row-level security), un chiffrement
            en transit (HTTPS), et des règles de sécurité applicatives
            (en-têtes de sécurité, protection contre les scripts non
            autorisés). Aucun système n'est infaillible : en cas d'incident
            de sécurité affectant vos données, nous vous en informerons
            conformément à nos obligations légales.
          </p>

          <h2>9. Cookies et stockage local</h2>
          <p>
            Nous utilisons le stockage local de votre navigateur pour
            conserver votre session de connexion et permettre le
            fonctionnement hors-ligne de l'application. Nous n'utilisons pas
            de cookies publicitaires ou de traceurs tiers à des fins de
            profilage marketing.
          </p>

          <h2>10. Contact</h2>
          <p>
            Pour toute question relative à cette politique ou à vos données :{" "}
            <a href="mailto:contact@makitiplus.com">contact@makitiplus.com</a>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
