// One shared Supabase client for data and auth, so table queries carry the
// signed-in user's session and Row Level Security can scope rows per user.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * True for keys that bypass Row Level Security. Those must never ship to a
 * browser: anyone could read them from the bundle and access every account.
 */
export function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return json?.role === 'service_role';
  } catch {
    return false;
  }
}

function init(): SupabaseClient | null {
  const url = (import.meta.env?.VITE_SUPABASE_URL as string | undefined)?.trim();
  const key = (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!url || !key) return null;
  if (isSecretKey(key)) {
    console.error(
      'VITE_SUPABASE_ANON_KEY is a secret (service_role) key. Use the anon / publishable key instead. Staying in local mode.',
    );
    return null;
  }
  try {
    return createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  } catch (err) {
    console.warn('Supabase init failed, using local persistence.', err);
    return null;
  }
}

export const supabase: SupabaseClient | null = init();
