// src/lib/inviteEmails.ts
// Role-specific invite email content. Each returns { subject, html } given the
// invitee's name, the Supabase action link, and optional institute name.
// HTML uses inline styles only (email clients strip <style> blocks).

export type InviteRole = 'INSTITUTE_OWNER' | 'INSTITUTE_ADMIN' | 'INSTRUCTOR' | 'STUDENT';

interface InviteContent {
    subject: string;
    heading: string;
    intro:   string;      // 1–2 sentences of role-specific context
    cta:     string;      // button label
    footer:  string;      // small role-specific note under the button
}

function contentFor(role: InviteRole, name: string, institute?: string): InviteContent {
    const who = name?.trim() ? name.trim() : 'there';
    const inst = institute?.trim();
    switch (role) {
        case 'INSTITUTE_OWNER':
            return {
                subject: `You're the owner of ${inst ?? 'your institute'} on TestCrack`,
                heading: `Welcome aboard, ${who}`,
                intro:   `Your institute${inst ? ` — ${inst}` : ''} has been created on TestCrack. As the owner, you'll manage admins, batches, and see performance across your whole institute. Set your password to open your dashboard.`,
                cta:     'Set password & open dashboard',
                footer:  'You can invite institute admins from your owner dashboard once you’re in.',
            };
        case 'INSTITUTE_ADMIN':
            return {
                subject: `You've been added as an admin${inst ? ` for ${inst}` : ''} on TestCrack`,
                heading: `Hi ${who}, you're an admin now`,
                intro:   `You've been added as an institute admin${inst ? ` for ${inst}` : ''} on TestCrack. Admins onboard tutors and students, create batches, and track cohort progress. Set your password to get started.`,
                cta:     'Set password & open dashboard',
                footer:  'Need access changed? Contact your institute owner.',
            };
        case 'INSTRUCTOR':
            return {
                subject: `You've been invited to teach on TestCrack`,
                heading: `Welcome, ${who}`,
                intro:   `You've been added as a tutor${inst ? ` at ${inst}` : ''} on TestCrack. You'll see your batches, track each student's band progress, and review their assessments. Set your password to open your instructor dashboard.`,
                cta:     'Set password & start teaching',
                footer:  'Your batches and students will appear on your dashboard once assigned.',
            };
        case 'STUDENT':
        default:
            return {
                subject: `Your TestCrack IELTS prep is ready`,
                heading: `Welcome to TestCrack, ${who}`,
                intro:   `You've been enrolled${inst ? ` at ${inst}` : ''} to prepare for IELTS on TestCrack. First up is a short diagnostic that sets your starting band — then your daily practice unlocks. Set your password to begin.`,
                cta:     'Set password & start',
                footer:  'Your first step is a one-time diagnostic across Listening, Reading, Writing and Speaking.',
            };
    }
}

/** Branded, self-contained HTML shell. */
function renderHtml(c: InviteContent, actionLink: string): string {
    return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px;">
            <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.02em;">TestCrack</div>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a;font-weight:800;">${c.heading}</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">${c.intro}</p>
            <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#4f46e5;">
              <a href="${actionLink}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${c.cta}</a>
            </td></tr></table>
            <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#94a3b8;">${c.footer}</p>
            <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#cbd5e1;">If the button doesn't work, copy and paste this link into your browser:<br/><span style="color:#818cf8;word-break:break-all;">${actionLink}</span></p>
          </td></tr>
          <tr><td style="padding:20px 32px;border-top:1px solid #f1f5f9;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">This invite is single-use and expires soon. If you weren't expecting it, you can ignore this email.</p>
          </td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#cbd5e1;">&copy; TestCrack</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function buildInviteEmail(
    role: InviteRole,
    name: string,
    actionLink: string,
    institute?: string,
): { subject: string; html: string } {
    const c = contentFor(role, name, institute);
    return { subject: c.subject, html: renderHtml(c, actionLink) };
}
