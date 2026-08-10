import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";

/**
 * Conditions générales d'utilisation — audit produit du 2026-08-10.
 *
 * BROUILLON, voir la même réserve que src/pages/legal/PrivacyPolicy.tsx :
 * contenu factuel (plans/paiement décrits reflètent réellement
 * src/pages/Billing.tsx), mais pas relu par un juriste, avec des
 * espaces réservés pour l'identité légale de l'entreprise.
 */
export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 sm:pt-28 pb-16">
        <div className="container-app max-w-3xl mx-auto prose prose-sm sm:prose-base dark:prose-invert">
          <div className="mb-8 p-4 rounded-lg border border-warning/40 bg-warning/10 text-sm not-prose">
            <p className="font-semibold mb-1">⚠️ Brouillon en attente de relecture juridique</p>
            <p className="text-muted-foreground">
              Ce document décrit factuellement le fonctionnement du service
              MakitiPlus, mais n'a pas encore été validé par un juriste ni
              complété avec les informations légales définitives de
              l'entreprise. Ne pas considérer comme juridiquement opposable
              avant complétion et relecture.
            </p>
          </div>

          <h1>Conditions générales d'utilisation</h1>
          <p className="text-muted-foreground">Dernière mise à jour : à compléter</p>

          <h2>1. Objet</h2>
          <p>
            Les présentes conditions régissent l'utilisation de MakitiPlus,
            un logiciel de gestion commerciale (caisse, stock, ventes,
            clients, fournisseurs, rapports) édité par [dénomination sociale
            à compléter]. En créant un compte ou en utilisant le service,
            vous acceptez ces conditions.
          </p>

          <h2>2. Compte et organisation</h2>
          <p>
            La création d'un compte associe votre utilisateur à une
            organisation (votre commerce). Vous êtes responsable de la
            confidentialité de vos identifiants et de toute activité
            effectuée depuis votre compte. L'administrateur de
            l'organisation est responsable de la gestion des accès des
            utilisateurs qu'il invite (managers, vendeurs, comptables).
          </p>

          <h2>3. Plans et paiement</h2>
          <p>
            MakitiPlus propose plusieurs plans (Starter, Croissance,
            Enterprise, ainsi qu'un plan Pilote National selon éligibilité).
            Le paiement peut s'effectuer par carte bancaire (lorsque cette
            option est activée), ou manuellement via Mobile Money (Orange
            Money, MTN Money...), espèces au bureau, ou virement bancaire,
            selon les modalités communiquées par notre équipe. Un changement
            de plan ou une prolongation d'abonnement traité manuellement est
            systématiquement enregistré dans un journal d'audit.
          </p>
          <p>
            Les tarifs affichés sont indicatifs et peuvent évoluer ; toute
            évolution tarifaire vous sera communiquée à l'avance. [Politique
            de remboursement à préciser.]
          </p>

          <h2>4. Vos données commerciales</h2>
          <p>
            Vous restez propriétaire de toutes les données que vous saisissez
            dans MakitiPlus (produits, ventes, clients, fournisseurs,
            dépenses). Vous êtes seul responsable de l'exactitude de ces
            données et du respect de vos propres obligations légales et
            fiscales vis-à-vis de vos clients et des autorités compétentes.
            MakitiPlus n'est pas un service de conseil comptable ou fiscal.
          </p>

          <h2>5. Utilisation autorisée</h2>
          <p>Vous vous engagez à ne pas :</p>
          <ul>
            <li>Utiliser le service à des fins illégales ou frauduleuses.</li>
            <li>
              Tenter de contourner les mesures de sécurité ou d'accéder à des
              données d'une autre organisation que la vôtre.
            </li>
            <li>Revendre ou sous-licencier l'accès au service sans accord préalable.</li>
            <li>Surcharger intentionnellement l'infrastructure du service.</li>
          </ul>

          <h2>6. Disponibilité du service</h2>
          <p>
            Nous mettons en œuvre des moyens raisonnables pour assurer la
            disponibilité du service, y compris un mode hors-ligne permettant
            de continuer à encaisser des ventes sans connexion internet,
            synchronisées automatiquement au retour de la connexion. À ce
            stade (phase pilote), aucun engagement de niveau de service
            (SLA) formel n'est garanti. [SLA à définir avant une
            commercialisation à plus grande échelle.]
          </p>

          <h2>7. Limitation de responsabilité</h2>
          <p>
            Dans la mesure permise par la loi applicable, MakitiPlus ne
            saurait être tenu responsable des pertes indirectes, pertes de
            profit, ou de données résultant de l'utilisation du service,
            hors faute lourde ou intentionnelle. Cette clause sera précisée
            et bornée conformément au droit applicable lors de la relecture
            juridique.
          </p>

          <h2>8. Résiliation</h2>
          <p>
            Vous pouvez cesser d'utiliser le service à tout moment. Nous
            pouvons suspendre ou résilier un compte en cas de violation
            manifeste des présentes conditions, après notification lorsque
            cela est raisonnablement possible. Vous pouvez demander un export
            de vos données avant la fermeture de votre compte.
          </p>

          <h2>9. Modifications</h2>
          <p>
            Nous pouvons modifier ces conditions ; les modifications
            substantielles vous seront communiquées avant leur entrée en
            vigueur.
          </p>

          <h2>10. Droit applicable</h2>
          <p>[Droit applicable et juridiction compétente à préciser.]</p>

          <h2>11. Contact</h2>
          <p>
            <a href="mailto:contact@makitiplus.com">contact@makitiplus.com</a>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
