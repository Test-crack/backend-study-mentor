/**
 * Student-bot client: real authentication + HTTP helpers.
 *
 * Unlike the seeder (which writes rows directly), the bot talks to the REAL API
 * as a logged-in student. This module gives it a JWT per persona and a fetch wrapper.
 *
 * Auth path (no OTP / no real email needed):
 *   supabaseAdmin.createUser({ email, password, email_confirm: true })  // idempotent
 *   → anonClient.signInWithPassword({ email, password })                // returns a real JWT
 * First API call links this Supabase identity to the already-seeded student row
 * (ensureUser matches by email), so the bot operates on the existing cohort.
 *
 * Env required: SUPABASE_URL, SUPABASE_ANON_KEY (public), SUPABASE_SERVICE_ROLE_KEY,
 *               API_BASE_URL (default http://localhost:4000)
 */
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../src/lib/supabase';
import type { Persona } from '../seeders/personas';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
export const API_BASE = process.env.API_BASE_URL || 'http://localhost:4000';

const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Get a real JWT for a persona. Creates the auth user if missing, then signs in. */
export async function getToken(persona: Persona): Promise<string> {
  // Ensure the Supabase auth user exists. email_confirm: true => password sign-in
  // works with no email ever sent. Ignore "already exists" errors (idempotent).
  const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: persona.email,
    password: persona.password,
    email_confirm: true,
  });
  if (createErr && !/already|registered|exists/i.test(createErr.message)) {
    throw new Error(`createUser failed for ${persona.email}: ${createErr.message}`);
  }

  const { data, error } = await anon.auth.signInWithPassword({
    email: persona.email,
    password: persona.password,
  });
  if (error || !data.session) {
    throw new Error(`signIn failed for ${persona.email}: ${error?.message ?? 'no session'}`);
  }
  return data.session.access_token;
}

/** Authenticated fetch to the real API. Throws on non-2xx with the response body. */
export async function api(method: string, path: string, token: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  }
  return json;
}

/** correct_answer may be a JSON-encoded string (e.g. "\"B\"") — normalise to B. */
export function cleanAnswer(raw: unknown): string {
  let s = typeof raw === 'string' ? raw : JSON.stringify(raw);
  try { const p = JSON.parse(s); if (typeof p === 'string') s = p; } catch { /* already plain */ }
  return s.trim();
}
