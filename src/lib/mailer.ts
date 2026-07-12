// src/lib/mailer.ts
// Thin wrapper over the Resend API for transactional email.
// Configure via env: RESEND_API_KEY and MAIL_FROM (e.g. "TestCrack <auth@mail.testcrack.com>").
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const MAIL_FROM      = process.env.MAIL_FROM ?? 'TestCrack <auth@mail.testcrack.com>';

if (!RESEND_API_KEY) {
    console.warn('[mailer] RESEND_API_KEY is not set — invite/transactional emails will fail to send.');
}

const resend = new Resend(RESEND_API_KEY);

export interface SendMailArgs {
    to:      string;
    subject: string;
    html:    string;
    /** Optional plain-text fallback (Resend derives one from html if omitted). */
    text?:   string;
}

/**
 * Send one transactional email through Resend.
 * Throws on a hard API error so callers can decide whether to fail the operation
 * or continue (an invite whose email fails should surface, not silently drop).
 */
export async function sendMail({ to, subject, html, text }: SendMailArgs): Promise<void> {
    if (!RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY not configured');
    }
    const { error } = await resend.emails.send({
        from: MAIL_FROM,
        to,
        subject,
        html,
        ...(text ? { text } : {}),
    });
    if (error) {
        // Resend returns { error } rather than throwing on API-level failures.
        throw new Error(`Resend send failed: ${error.name ?? ''} ${error.message ?? JSON.stringify(error)}`.trim());
    }
}
