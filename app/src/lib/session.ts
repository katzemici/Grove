// App-wide session store. Picks the auth backend that matches the data layer,
// keeps the data layer scoped to the signed-in user, and exposes a React hook.

import { useSyncExternalStore } from 'react';
import { LocalAuth, SupabaseAuth, type AuthBackend, type OAuthProvider, type Profile } from './auth';
import { setDataScope } from './db';
import { prepareImage, type ImageSlot } from './images';
import { supabase } from './supabaseClient';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  /** Arrived from a password-reset email: must choose a new password. */
  | { status: 'recovery' }
  | { status: 'signedIn'; profile: Profile };

const backend: AuthBackend = supabase ? new SupabaseAuth(supabase) : new LocalAuth();

let state: SessionState = { status: 'loading' };
const listeners = new Set<() => void>();

function set(next: SessionState): void {
  // Scope first so pages that render on this change read the right user's data.
  setDataScope(next.status === 'signedIn' ? next.profile.id : null);
  state = next;
  listeners.forEach((l) => l());
}

function signedIn(profile: Profile): Profile {
  set({ status: 'signedIn', profile });
  return profile;
}

let started = false;

export const session = {
  kind: backend.kind,

  getState: (): SessionState => state,

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Restore an existing session once on app start. */
  async start(): Promise<void> {
    if (started) return;
    started = true;
    backend.onEvent(async (e) => {
      if (e.type === 'passwordRecovery') set({ status: 'recovery' });
      else if (e.type === 'signedOut') set({ status: 'signedOut' });
      else if (e.type === 'signedIn' && state.status === 'signedOut') {
        const profile = await backend.restore().catch(() => null);
        if (profile) signedIn(profile);
      }
    });
    try {
      const profile = await backend.restore();
      // A recovery event may have arrived while restoring; keep it.
      if (state.status === 'recovery') return;
      set(profile ? { status: 'signedIn', profile } : { status: 'signedOut' });
    } catch (err) {
      console.warn('Could not restore your session.', err);
      set({ status: 'signedOut' });
    }
  },

  signIn: async (email: string, password: string) => signedIn(await backend.signIn(email, password)),

  /** Resolves to true when the user must confirm their email first. */
  async signUp(name: string, email: string, password: string): Promise<boolean> {
    const res = await backend.signUp(name, email, password);
    if (res.profile) signedIn(res.profile);
    return res.needsConfirmation;
  },

  signInWithProvider: (provider: OAuthProvider) => backend.signInWithProvider(provider),

  requestPasswordReset: (email: string) => backend.requestPasswordReset(email),

  async finishRecovery(password: string): Promise<void> {
    await backend.updatePassword(password);
    const profile = await backend.restore();
    set(profile ? { status: 'signedIn', profile } : { status: 'signedOut' });
  },

  async signOut(): Promise<void> {
    await backend.signOut();
    set({ status: 'signedOut' });
  },

  updateProfile: async (displayName: string) =>
    signedIn(await backend.updateProfile({ display_name: displayName })),

  /** Resize and save a picture; pass null to go back to the default cat. */
  async setImage(slot: ImageSlot, file: File | null): Promise<Profile> {
    const blob = file ? await prepareImage(file, slot) : null;
    return signedIn(await backend.setImage(slot, blob));
  },
};

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState);
}

/** The signed-in profile, or null while signed out. */
export function useProfile(): Profile | null {
  const s = useSession();
  return s.status === 'signedIn' ? s.profile : null;
}
