// src/lib/sendInvite.ts
// Single entry point for inviting any user (owner / admin / tutor / student).
//
// Replaces supabaseAdmin.auth.admin.inviteUserByEmail (which BOTH creates the
// auth user AND sends Supabase's generic built-in email). Here we:
//   1. generateLink({ type: 'invite' }) — creates the auth user and returns the
//      action link WITHOUT sending any email.
//   2. Send our own role-specific branded email via Resend.
//
// The invite redirect targets FRONTEND_URL/auth/callback (the route that runs the
// set-password flow) — NOT /login, and never a hardcoded localhost in production.
import { supabaseAdmin } from './supabase';
import { sendMail } from './mailer';
import { buildInviteEmail, InviteRole } from './inviteEmails';

function inviteRedirect(): string {
    const base = process.env.FRONTEND_URL;
    if (!base) {
        // Loud in logs; still functional locally. Production MUST set FRONTEND_URL.
        console.warn('[sendInvite] FRONTEND_URL not set — falling back to http://localhost:8080');
    }
    return `${(base || 'http://localhost:8080').replace(/\/+$/, '')}/auth/callback`;
}

export interface SendInviteResult {
    userId:         string | null; // Supabase auth user id (for pending-* linking)
    alreadyExisted: boolean;       // true if the auth user already existed (recovery link issued)
    emailSent:      boolean;       // false if Resend send failed (auth user still created)
}

export async function sendInvite(opts: {
    email: string;
    name: string;
    role: InviteRole;
    institute?: string;
}): Promise<SendInviteResult> {
    const email      = opts.email.trim().toLowerCase();
    const redirectTo = inviteRedirect();
    const data       = { full_name: opts.name, role: opts.role };

    let actionLink:  string | null = null;
    let userId:      string | null = null;
    let alreadyExisted = false;

    const invite = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite', email, options: { data, redirectTo },
    } as any);

    if (invite.error) {
        const msg = (invite.error.message ?? '').toLowerCase();
        if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
            // Auth user already exists (re-invite, or invited earlier and never accepted).
            // Issue a recovery link so they can still (re)set a password and get in.
            alreadyExisted = true;
            const rec = await supabaseAdmin.auth.admin.generateLink({
                type: 'recovery', email, options: { redirectTo },
            } as any);
            if (rec.error) throw rec.error;
            actionLink = rec.data?.properties?.action_link ?? null;
            userId     = rec.data?.user?.id ?? null;
        } else {
            throw invite.error;
        }
    } else {
        actionLink = invite.data?.properties?.action_link ?? null;
        userId     = invite.data?.user?.id ?? null;
    }

    // Send the branded, role-specific email. A send failure is NON-fatal: the auth
    // user + link already exist, so the caller still creates its DB rows and reports
    // emailSent:false (admin can re-invite). Mirrors the old `inviteEmailSent` flag.
    let emailSent = false;
    if (actionLink) {
        try {
            const { subject, html } = buildInviteEmail(opts.role, opts.name, actionLink, opts.institute);
            await sendMail({ to: email, subject, html });
            emailSent = true;
        } catch (mailErr) {
            console.error('[sendInvite] Resend send failed (auth user was still created):', mailErr);
        }
    }

    return { userId, alreadyExisted, emailSent };
}
