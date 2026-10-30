// THE single data-access layer. Every feature module imports `db` from here and
// nothing else for persistence (FND-003). Per-user scoping happens only in
// this file + the adapters: the local adapter switches to the signed-in user's
// storage key, and Supabase scopes rows with Row Level Security.

import type { StorageAdapter } from './adapter';
import { LocalAdapter } from './localAdapter';
import { SupabaseAdapter } from './supabaseAdapter';
import { supabase } from './supabaseClient';

export const db: StorageAdapter = supabase ? new SupabaseAdapter(supabase) : new LocalAdapter();

/** True when running against the local fallback (no Supabase credentials). */
export const isLocalMode = db.name === 'local';

/** Point the data layer at one user's rows. Called by the auth store on sign-in/out. */
export function setDataScope(userId: string | null): void {
  db.setScope?.(userId);
}
