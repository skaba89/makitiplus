// email-templates.ts — Reusable HTML email templates for MakitiPlus
//
// All templates use inline CSS for maximum email client compatibility.
// Brand colors: Primary #2563eb, Accent #f59e0b, Danger #dc2626

const BRAND = {
  name: 'MakitiPlus',
  primary: '#2563eb',
  accent: '#f59e0b',
  danger: '#dc2626',
  success: '#16a34a',
  muted: '#6b7280',
  bg: '#f9fafb',
};

const BASE_STYLES = `font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1f2937;`;

function header(title: string, color: string = BRAND.primary): string {
  return `
    <div style="border-bottom: 3px solid ${color}; padding-bottom: 12px; margin-bottom: 20px;">
      <h1 style="margin: 0; font-size: 24px; color: ${color};">${BRAND.name}</h1>
    </div>`;
}

function footer(): string {
  return `
    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: ${BRAND.muted}; font-size: 12px;">
      <p>© ${new Date().getFullYear()} ${BRAND.name} — Solution de caisse pour l'Afrique</p>
      <p>Cet email a été envoyé automatiquement. Pour gérer vos préférences, connectez-vous à votre compte.</p>
    </div>`;
}

function ctaButton(text: string, url: string, color: string = BRAND.primary): string {
  return `<a href="${url}" style="display: inline-block; background: ${color}; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">${text}</a>`;
}

// ─── Template: Welcome Email ─────────────────────────────────────────────

export function welcomeEmail(params: {
  name: string;
  planName: string;
  dashboardUrl: string;
}): string {
  return `
    <div style="${BASE_STYLES}">
      ${header('Bienvenue !')}
      <h2>Bienvenue sur ${BRAND.name}, ${params.name} ! 🎉</h2>
      <p>Votre compte a été créé avec succès sur le plan <strong>${params.planName}</strong>.</p>
      <p>Vous pouvez dès maintenant :</p>
      <ul>
        <li>✅ Gérer votre stock et vos ventes</li>
        <li>✅ Suivre vos dépenses et bénéfices</li>
        <li>✅ Imprimer des reçus et factures</li>
        <li>✅ Travailler hors ligne — vos données se synchronisent automatiquement</li>
      </ul>
      ${ctaButton('Accéder à mon tableau de bord', params.dashboardUrl)}
      <p style="color: ${BRAND.muted}; font-size: 14px;">Besoin d'aide ? Consultez notre guide de démarrage rapide ou contactez notre support.</p>
      ${footer()}
    </div>`;
}

// ─── Template: Payment Success ───────────────────────────────────────────

export function paymentSuccessEmail(params: {
  name: string;
  planName: string;
  amount: string;
  period: string;
  nextBillingDate: string;
  billingUrl: string;
}): string {
  return `
    <div style="${BASE_STYLES}">
      ${header('Paiement confirmé', BRAND.success)}
      <h2 style="color: ${BRAND.success};">✅ Paiement réussi !</h2>
      <p>Bonjour ${params.name},</p>
      <p>Votre paiement a été traité avec succès.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr style="background: ${BRAND.bg};"><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">Plan</td><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600;">${params.planName}</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">Montant</td><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600;">${params.amount}</td></tr>
        <tr style="background: ${BRAND.bg};"><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">Période</td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${params.period}</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">Prochaine facturation</td><td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${params.nextBillingDate}</td></tr>
      </table>
      ${ctaButton('Gérer mon abonnement', params.billingUrl)}
      ${footer()}
    </div>`;
}

// ─── Template: Payment Failed ────────────────────────────────────────────

export function paymentFailedEmail(params: {
  name: string;
  planName: string;
  amount: string;
  retryDate: string;
  billingUrl: string;
}): string {
  return `
    <div style="${BASE_STYLES}">
      ${header('Problème de paiement', BRAND.danger)}
      <h2 style="color: ${BRAND.danger};">⚠️ Échec du paiement</h2>
      <p>Bonjour ${params.name},</p>
      <p>Nous n'avons pas pu traiter votre paiement de <strong>${params.amount}</strong> pour le plan <strong>${params.planName}</strong>.</p>
      <p>Cela peut être dû à :</p>
      <ul>
        <li>Carte bancaire expirée ou refusée</li>
        <li>Fonds insuffisants</li>
        <li>Problème temporaire avec votre banque</li>
      </ul>
      <p><strong>Vous disposez de 7 jours</strong> pour mettre à jour votre méthode de paiement. Passé ce délai, votre accès sera restreint.</p>
      ${ctaButton('Mettre à jour mon paiement', params.billingUrl, BRAND.danger)}
      <p style="color: ${BRAND.muted}; font-size: 14px;">Nouvelle tentative automatique le ${params.retryDate}.</p>
      ${footer()}
    </div>`;
}

// ─── Template: Plan Upgrade Confirmation ─────────────────────────────────

export function planUpgradeEmail(params: {
  name: string;
  fromPlan: string;
  toPlan: string;
  newFeatures: string[];
  billingUrl: string;
}): string {
  return `
    <div style="${BASE_STYLES}">
      ${header('Plan mis à jour', BRAND.accent)}
      <h2 style="color: ${BRAND.accent};">🚀 Plan mis à jour !</h2>
      <p>Bonjour ${params.name},</p>
      <p>Votre abonnement a été mis à jour de <strong>${params.fromPlan}</strong> à <strong>${params.toPlan}</strong>.</p>
      <p>Vous avez maintenant accès à :</p>
      <ul>
        ${params.newFeatures.map(f => `<li>✨ ${f}</li>`).join('\n        ')}
      </ul>
      ${ctaButton('Explorer les nouvelles fonctionnalités', params.billingUrl)}
      ${footer()}
    </div>`;
}

// ─── Template: Subscription Cancelled ────────────────────────────────────

export function subscriptionCancelledEmail(params: {
  name: string;
  planName: string;
  endDate: string;
  billingUrl: string;
}): string {
  return `
    <div style="${BASE_STYLES}">
      ${header('Abonnement annulé', BRAND.muted)}
      <h2>Abonnement annulé</h2>
      <p>Bonjour ${params.name},</p>
      <p>Votre abonnement au plan <strong>${params.planName}</strong> a été annulé.</p>
      <p>Vous conservez l'accès à vos fonctionnalités jusqu'au <strong>${params.endDate}</strong>.</p>
      <p>Après cette date, votre compte sera automatiquement réinitialisé au plan Starter (gratuit). Vos données seront conservées.</p>
      <p>Changez d'avis ? Vous pouvez réactiver votre abonnement à tout moment :</p>
      ${ctaButton('Réactiver mon abonnement', params.billingUrl)}
      <p style="color: ${BRAND.muted}; font-size: 14px;">Nous sommes désolés de vous voir partir. N'hésitez pas à nous contacter si vous avez des questions.</p>
      ${footer()}
    </div>`;
}

// ─── Template: Trial Ending Soon ─────────────────────────────────────────

export function trialEndingEmail(params: {
  name: string;
  planName: string;
  trialEndDate: string;
  billingUrl: string;
}): string {
  return `
    <div style="${BASE_STYLES}">
      ${header('Essai bientôt terminé', BRAND.accent)}
      <h2 style="color: ${BRAND.accent};">⏰ Votre période d'essai se termine bientôt</h2>
      <p>Bonjour ${params.name},</p>
      <p>Votre essai gratuit du plan <strong>${params.planName}</strong> se termine le <strong>${params.trialEndDate}</strong>.</p>
      <p>Pour continuer à profiter de toutes les fonctionnalités après cette date, assurez-vous que votre méthode de paiement est à jour :</p>
      ${ctaButton('Vérifier mon paiement', params.billingUrl, BRAND.accent)}
      <p style="color: ${BRAND.muted}; font-size: 14px;">Si aucune méthode de paiement n'est enregistrée, votre compte sera automatiquement repassé au plan Starter à la fin de l'essai.</p>
      ${footer()}
    </div>`;
}

// ─── Generic sender function ─────────────────────────────────────────────

export async function sendEmail(params: {
  resendApiKey: string;
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${BRAND.name} <noreply@makitiplus.com>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error('[email] Send failed:', err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] Send error:', err);
    return false;
  }
}
