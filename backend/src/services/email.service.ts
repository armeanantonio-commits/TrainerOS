import { setTimeout as delay } from 'timers/promises';
import { isProductionEnvironment } from '../lib/environment.js';

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'no-reply@traineros.org';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'TrainerOS';
const LOGO_URL = process.env.TRAINEROS_LOGO_URL || `${FRONTEND_URL}/logo.jpeg`;
const BRAND_COLOR = process.env.TRAINEROS_BRAND_COLOR || '#10B981';
const SUPPORT_EMAIL = process.env.TRAINEROS_SUPPORT_EMAIL || 'support@traineros.org';

interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{
    content: string;
    filename: string;
    type: string;
    disposition?: 'attachment' | 'inline';
  }>;
}

function ensureMailConfig(): void {
  if (SENDGRID_API_KEY) {
    return;
  }

  if (isProductionEnvironment()) {
    throw new Error('SENDGRID_API_KEY is missing');
  }

  console.warn('SENDGRID_API_KEY missing: email send skipped in non-production environment.');
}

function renderBrandedEmail(title: string, subtitle: string, body: string, ctaText: string, ctaUrl: string): string {
  return `
  <div style="margin:0;padding:0;background:#0f1117;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#151a27;border:1px solid #1f2937;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 16px 24px;text-align:center;">
                <img src="${LOGO_URL}" alt="TrainerOS" width="56" height="56" style="border-radius:12px;display:block;margin:0 auto 12px auto;object-fit:cover;" />
                <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.25;">${title}</h1>
                <p style="margin:8px 0 0 0;color:#9ca3af;font-size:14px;">${subtitle}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px;">
                <p style="margin:0 0 20px 0;color:#d1d5db;font-size:15px;line-height:1.6;">${body}</p>
                <a href="${ctaUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#0f1117;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">${ctaText}</a>
                <p style="margin:20px 0 0 0;color:#9ca3af;font-size:12px;line-height:1.5;">
                  If the button does not work, copy this link into your browser:<br />
                  <a href="${ctaUrl}" style="color:${BRAND_COLOR};word-break:break-all;">${ctaUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 24px 24px;">
                <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
                  Need help? Contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND_COLOR};">${SUPPORT_EMAIL}</a><br />
                  TrainerOS
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `;
}

async function sendEmail(payload: EmailPayload): Promise<void> {
  ensureMailConfig();
  if (!SENDGRID_API_KEY) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }] }],
        from: {
          email: FROM_EMAIL,
          name: FROM_NAME,
        },
        subject: payload.subject,
        content: [
          { type: 'text/plain', value: payload.text },
          { type: 'text/html', value: payload.html },
        ],
        attachments: payload.attachments,
      }),
      signal: controller.signal,
    });

    if (response.ok) {
      return;
    }

    const errorBody = await response.text();
    throw new Error(`SendGrid request failed (${response.status}): ${errorBody}`);
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('SendGrid request timed out');
    }

    if (!isProductionEnvironment()) {
      await delay(50);
      console.error('Failed to send email:', error?.message || error);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendActivationEmail(
  to: string,
  recipientName: string | null,
  activationUrl: string
): Promise<void> {
  const namePrefix = recipientName ? `${recipientName}, ` : '';
  const subject = 'Activate your TrainerOS account';
  const text = `${namePrefix}activate your TrainerOS account: ${activationUrl}`;
  const html = renderBrandedEmail(
    'Activate Your Account',
    'One click and you are ready to use TrainerOS',
    `${namePrefix}welcome to TrainerOS. Confirm your email address to activate your account.`,
    'Activate Account',
    activationUrl
  );

  await sendEmail({ to, subject, text, html });
}

export async function sendPasswordResetEmail(
  to: string,
  recipientName: string | null,
  resetUrl: string
): Promise<void> {
  const namePrefix = recipientName ? `${recipientName}, ` : '';
  const subject = 'Reset your TrainerOS password';
  const text = `${namePrefix}reset your TrainerOS password: ${resetUrl}`;
  const html = renderBrandedEmail(
    'Reset Your Password',
    'Secure your account and set a new password',
    `${namePrefix}we received a password reset request for your TrainerOS account.`,
    'Reset Password',
    resetUrl
  );

  await sendEmail({ to, subject, text, html });
}

export async function sendNutritionReportEmail(input: {
  to: string;
  recipientName: string | null;
  clientName: string;
  pdfFilename: string;
  pdfContentBase64: string;
  downloadUrl?: string;
}): Promise<void> {
  const namePrefix = input.recipientName ? `${input.recipientName}, ` : '';
  const downloadText = input.downloadUrl ? ` Îl poți descărca și de aici: ${input.downloadUrl}` : '';
  const subject = `Raport nutrițional TrainerOS pentru ${input.clientName}`;
  const text = `${namePrefix}raportul nutrițional pentru ${input.clientName} este atașat acestui email.${downloadText}`;
  const html = `
  <div style="margin:0;padding:0;background:#0f1117;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#151a27;border:1px solid #1f2937;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 16px 24px;text-align:center;">
                <img src="${LOGO_URL}" alt="TrainerOS" width="56" height="56" style="border-radius:12px;display:block;margin:0 auto 12px auto;object-fit:cover;" />
                <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.25;">Raport nutrițional pregătit</h1>
                <p style="margin:8px 0 0 0;color:#9ca3af;font-size:14px;">TrainerOS.org</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px;">
                <p style="margin:0 0 16px 0;color:#d1d5db;font-size:15px;line-height:1.6;">
                  ${namePrefix}raportul nutrițional pentru <strong>${input.clientName}</strong> este atașat acestui email în format PDF.
                </p>
                ${
                  input.downloadUrl
                    ? `<p style="margin:0 0 20px 0;color:#d1d5db;font-size:15px;line-height:1.6;">
                        Îl poți descărca și online aici:
                        <a href="${input.downloadUrl}" style="color:${BRAND_COLOR};word-break:break-all;">${input.downloadUrl}</a>
                      </p>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 24px 24px;">
                <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
                  Pentru suport: <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND_COLOR};">${SUPPORT_EMAIL}</a><br />
                  TrainerOS.org
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `;

  await sendEmail({
    to: input.to,
    subject,
    text,
    html,
    attachments: [
      {
        content: input.pdfContentBase64,
        filename: input.pdfFilename,
        type: 'application/pdf',
        disposition: 'attachment',
      },
    ],
  });
}
