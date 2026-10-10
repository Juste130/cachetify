const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const { config } = require('../config');
const { AppError } = require('../utils/errors');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }

  async sendEmail(to, subject, html, text) {
    try {
      await this.transporter.sendMail({
        from: config.emailFrom,
        to,
        subject,
        html,
        text: text || this.stripHtml(html),
      });

      logger.info(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      logger.error('Error sending email:', error);
      throw new AppError('Failed to send email', 500);
    }
  }

  /**
   * Every outgoing email shares this one branded shell — the same header (Le Sceau mark +
   * wordmark, matching what the app itself now uses), the same card treatment for a
   * contract title, the same call-to-action button, the same footer.
   *
   * Colors intentionally match the LIVE product's light UI (white cards, #212121 ink,
   * #FFC107 gold accent — see globals.css) rather than the dark navy/indigo gradient this
   * shell used before, which didn't correspond to any surface that actually exists in the
   * app (the product is light by default; only the Privy login modal is dark). An email
   * that looks like a different, darker "crypto SaaS" than the product someone actually
   * uses is a worse first impression than one that looks like more of the same app.
   *
   * The header band stays dark (#212121) on purpose, not to chase the old look: #FFC107
   * gold text needs a dark ground to read at all — on the app's own white card background,
   * that exact combination (gold-on-white, ~1.6:1 contrast) is close to illegible, which is
   * true of the in-app sidebar wordmark today too. Keeping the header dark sidesteps
   * repeating that problem here rather than fixing it, since this file only owns email output.
   */
  _wrapEmail({ heading, bodyHtml, contractTitle, ctaLabel, ctaUrl, ctaColor = '#FFC107', ctaTextColor = '#212121', footerNote }) {
    // Absolute URL: Le Sceau, served as a static asset by the frontend (public/mark-seal.svg)
    // — the same file used for the Privy login modal logo, so the mark is identical wherever
    // it appears. Email clients vary widely in SVG support (solid in Apple Mail, Gmail web/app,
    // and modern Outlook.com; unsupported in classic Outlook desktop, which falls back to
    // showing nothing for this <img>). That's why the wordmark right next to it is real text,
    // not baked into the image — the brand name is legible even where the mark itself isn't.
    const markUrl = `${config.frontendUrl}/mark-seal.svg`;
    return `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; color: #212121; border-radius: 16px; overflow: hidden; border: 1px solid #E5E2D6;">
        <div style="background: #212121; padding: 32px 40px; text-align: center;">
          <table role="presentation" align="center" style="margin: 0 auto; border-collapse: collapse;">
            <tr>
              <td style="padding-right: 12px; vertical-align: middle;">
                <img src="${markUrl}" width="36" height="36" alt="" style="display: block;">
              </td>
              <td style="vertical-align: middle;">
                <span style="color: #FFC107; font-size: 26px; font-weight: 700; letter-spacing: -0.01em;">Cachetify</span>
              </td>
            </tr>
          </table>
          <p style="color: #9B9689; margin: 10px 0 0; font-size: 13px;">Contrats intelligents, signés et ancrés sur la blockchain</p>
        </div>
        <div style="padding: 40px;">
          <h2 style="color: #212121; font-size: 21px; margin: 0 0 16px; font-weight: 700;">${heading}</h2>
          ${bodyHtml}
          ${contractTitle ? `
          <div style="background: #FBF8EF; border: 1px solid #EEE6C8; border-left: 4px solid #FFC107; border-radius: 10px; padding: 18px 20px; margin: 8px 0 28px;">
            <p style="color: #212121; font-weight: 700; font-size: 16px; margin: 0;">${contractTitle}</p>
          </div>` : ''}
          ${ctaUrl ? `
          <div style="text-align: center; margin-bottom: 32px;">
            <a href="${ctaUrl}"
               style="background: ${ctaColor}; color: ${ctaTextColor}; padding: 14px 32px; text-decoration: none; border-radius: 10px; display: inline-block; font-weight: bold; font-size: 15px;">
              ${ctaLabel}
            </a>
          </div>` : ''}
          <p style="color: #8A8776; font-size: 12px; text-align: center; border-top: 1px solid #EDE9DB; padding-top: 20px; margin: 0; line-height: 1.6;">
            ${footerNote || "Cet email a été envoyé automatiquement par Cachetify — si vous n'attendiez pas ce message, vous pouvez l'ignorer."}
          </p>
        </div>
      </div>
    `;
  }

  async sendWelcomeEmail(to, name) {
    const safeName = this.escapeHtml(name || '');
    const subject = 'Bienvenue sur Cachetify';
    const html = this._wrapEmail({
      heading: `Bienvenue ${safeName} !`,
      bodyHtml: `
        <p style="color: #4B4B42; line-height: 1.7; margin-bottom: 16px;">Merci de vous être inscrit(e) sur Cachetify.</p>
        <p style="color: #4B4B42; line-height: 1.7; margin-bottom: 16px;">Vous pouvez maintenant créer et gérer vos contrats de manière sécurisée sur la blockchain.</p>
        <p style="color: #4B4B42; line-height: 1.7; margin-bottom: 28px;">Votre portefeuille numérique a été créé automatiquement et financé avec un peu de MATIC pour vos premières transactions.</p>
      `,
    });

    await this.sendEmail(to, subject, html);
  }

  async sendDraftInvitationEmail(to, name, contractTitle, draftId) {
    const safeName = this.escapeHtml(name || '');
    const safeTitle = this.escapeHtml(contractTitle || '');
    const subject = `Vous êtes invité(e) à signer un contrat : ${contractTitle || ''}`;
    const signupUrl = `${config.frontendUrl}/signup?redirect=/contract-details?id=${draftId}`;
    const html = this._wrapEmail({
      heading: `Bonjour ${safeName},`,
      bodyHtml: `
        <p style="color: #4B4B42; line-height: 1.7; margin-bottom: 8px;">
          Vous avez été invité(e) à signer le contrat suivant sur Cachetify :
        </p>
      `,
      contractTitle: `${safeTitle}<p style="color: #8A8776; font-size: 12px; margin: 8px 0 0; font-family: monospace;">Réf: ${draftId.slice(0, 8)}...</p>`,
      ctaLabel: 'Créer mon compte et signer',
      ctaUrl: signupUrl,
      footerNote: `
        Pour signer ce contrat, vous devez d'abord créer un compte gratuit sur Cachetify — un portefeuille numérique sécurisé vous sera automatiquement attribué.<br>
        Votre signature aura valeur légale, conformément à la loi applicable à ce contrat.<br>
        Si vous n'attendiez pas cet email, vous pouvez l'ignorer.
      `,
    });
    await this.sendEmail(to, subject, html);
  }

  async sendInvitationEmail(to, inviterName) {
    const safeInviter = this.escapeHtml(inviterName || '');
    const subject = `${safeInviter} vous invite à rejoindre Cachetify`;
    const signupUrl = `${config.frontendUrl}/signup`;
    const html = this._wrapEmail({
      heading: 'Vous êtes invité(e) sur Cachetify',
      bodyHtml: `
        <p style="color: #4B4B42; line-height: 1.7; margin-bottom: 16px;">
          <strong style="color: #212121;">${safeInviter}</strong> vous invite à créer un compte sur Cachetify pour échanger et signer des contrats en toute confiance.
        </p>
        <p style="color: #4B4B42; line-height: 1.7; margin-bottom: 16px;">
          La création de compte est gratuite et immédiate — un portefeuille numérique sécurisé vous sera automatiquement attribué pour signer vos contrats sur la blockchain.
        </p>
      `,
      ctaLabel: 'Créer mon compte',
      ctaUrl: signupUrl,
      footerNote: "Cet email vous a été envoyé car quelqu'un vous a invité(e) sur Cachetify. Si vous ne connaissez pas cette personne, vous pouvez ignorer ce message.",
    });
    await this.sendEmail(to, subject, html);
  }

  async sendSignatureRequest(to, contractTitle, contractId, signerName) {
    const safeName = this.escapeHtml(signerName || '');
    const safeTitle = this.escapeHtml(contractTitle || '');
    const subject = `Signature requise : ${contractTitle || ''}`;
    const html = this._wrapEmail({
      heading: `Bonjour ${safeName},`,
      bodyHtml: `
        <p style="color: #4B4B42; line-height: 1.7; margin-bottom: 8px;">
          Le contrat suivant a été déployé sur la blockchain et attend votre signature :
        </p>
      `,
      contractTitle: safeTitle,
      ctaLabel: 'Voir et signer le contrat',
      ctaUrl: `${config.frontendUrl}/contract-details?id=${contractId}`,
    });

    await this.sendEmail(to, subject, html);
  }

  async sendContractFinalizedNotification(to, contractTitle, contractId) {
    const safeTitle = this.escapeHtml(contractTitle || '');
    const subject = `Félicitations ! Le contrat "${contractTitle || ''}" est maintenant actif`;
    const html = this._wrapEmail({
      heading: 'Votre contrat est actif !',
      bodyHtml: `
        <p style="color: #4B4B42; line-height: 1.7; margin-bottom: 8px;">
          Toutes les signatures ont été collectées. Le contrat suivant est maintenant actif sur la blockchain, et un certificat de preuve a été généré avec succès :
        </p>
      `,
      contractTitle: safeTitle,
      ctaLabel: 'Consulter le contrat actif',
      ctaUrl: `${config.frontendUrl}/contract-details?id=${contractId}`,
      ctaColor: '#4CAF50',
      ctaTextColor: '#ffffff',
    });
    await this.sendEmail(to, subject, html);
  }

  async sendContractStatusNotification(to, contractTitle, contractId, newStatus) {
    const safeTitle = this.escapeHtml(contractTitle || '');
    const safeStatus = this.escapeHtml(newStatus || '');
    const subject = `Mise à jour du contrat : "${contractTitle || ''}"`;
    const html = this._wrapEmail({
      heading: 'Statut du contrat mis à jour',
      bodyHtml: `
        <p style="color: #4B4B42; line-height: 1.7; margin-bottom: 8px;">
          Le contrat suivant a changé de statut : <strong style="color: #212121;">${safeStatus}</strong>
        </p>
      `,
      contractTitle: safeTitle,
      ctaLabel: 'Consulter les détails du contrat',
      ctaUrl: `${config.frontendUrl}/contract-details?id=${contractId}`,
    });
    await this.sendEmail(to, subject, html);
  }

  async sendGenericNotification(to, title, message, contractCacheId) {
    const safeTitle = this.escapeHtml(title || '');
    const safeMessage = this.escapeHtml(message || '');
    const html = this._wrapEmail({
      heading: safeTitle,
      bodyHtml: `<p style="color: #4B4B42; line-height: 1.7; margin-bottom: 8px;">${safeMessage}</p>`,
      ctaLabel: contractCacheId ? 'Voir le contrat' : undefined,
      ctaUrl: contractCacheId ? `${config.frontendUrl}/contract-details?id=${contractCacheId}` : undefined,
    });
    // The subject must stay plain text — safeTitle is HTML-escaped for the body and would
    // otherwise leak literal entities (e.g. "n&#039;avez") into the email client's subject line.
    await this.sendEmail(to, title || '', html);
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

module.exports = new EmailService();
