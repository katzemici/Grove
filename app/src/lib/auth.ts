// Accounts and profiles. Two backends with one contract, mirroring the data
// layer: Supabase Auth + a `profiles` table + Storage when credentials exist,
// otherwise accounts kept in this browser (passwords hashed with PBKDF2).

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { blobToDataUrl, type ImageSlot } from './images';

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  /** Null means the default cat avatar. */
  avatar_url: string | null;
  /** Null means the default cat photo on the Overview insight card. */
  insight_image_url: string | null;
  created_at: string;
}

export type OAuthProvider = 'google' | 'apple' | 'facebook';

export interface SignUpResult {
  /** Null when the account must confirm its email before signing in. */
  profile: Profile | null;
  needsConfirmation: boolean;
}

export type AuthEvent = { type: 'signedOut' } | { type: 'signedIn' } | { type: 'passwordRecovery' };

export interface AuthBackend {
  readonly kind: 'local' | 'supabase';
  restore(): Promise<Profile | null>;
  signIn(email: string, password: string): Promise<Profile>;
  signUp(name: string, email: string, password: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
  signInWithProvider(provider: OAuthProvider): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  updateProfile(patch: { display_name: string }): Promise<Profile>;
  /** Pass null to go back to the default cat picture. */
  setImage(slot: ImageSlot, image: Blob | null): Promise<Profile>;
  onEvent(cb: (e: AuthEvent) => void): () => void;
}

// ---------------------------------------------------------------- validation

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  return EMAIL_RE.test(email.trim()) ? null : 'Enter a valid email address.';
}

export function validatePassword(password: string): string | null {
  return password.length >= MIN_PASSWORD ? null : `Use at least ${MIN_PASSWORD} characters.`;
}

export function validateName(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Enter your name.';
  if (n.length > 40) return 'Keep it to 40 characters.';
  return null;
}

function check(fieldError: string | null): void {
  if (fieldError) throw new Error(fieldError);
}

const SLOT_COLUMN: Record<ImageSlot, 'avatar_url' | 'insight_image_url'> = {
  avatar: 'avatar_url',
  insight: 'insight_image_url',
};

// ---------------------------------------------------------------- local

interface KVStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface LocalUser extends Profile {
  salt: string;
  hash: string;
}

const USERS_KEY = 'grove:auth:users';
const SESSION_KEY = 'grove:auth:session';
const PBKDF2_ITERATIONS = 210_000;

function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Sign-in needs a secure page. Open the app on localhost or over HTTPS.');
  }
  const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return toB64(bits);
}

function publicProfile(u: LocalUser): Profile {
  return {
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    insight_image_url: u.insight_image_url,
    created_at: u.created_at,
  };
}

const BAD_LOGIN = 'Incorrect email or password.';

/** Accounts stored in this browser only. Fine for a personal device, not a shared one. */
export class LocalAuth implements AuthBackend {
  readonly kind = 'local' as const;
  private listeners = new Set<(e: AuthEvent) => void>();

  constructor(private store: KVStore = localStorage) {}

  private users(): LocalUser[] {
    try {
      return JSON.parse(this.store.getItem(USERS_KEY) ?? '[]') as LocalUser[];
    } catch {
      return [];
    }
  }

  private saveUsers(users: LocalUser[]): void {
    try {
      this.store.setItem(USERS_KEY, JSON.stringify(users));
    } catch {
      throw new Error('Not enough browser storage for that. Try a smaller image.');
    }
  }

  private current(): LocalUser | null {
    const id = this.store.getItem(SESSION_KEY);
    return (id && this.users().find((u) => u.id === id)) || null;
  }

  private patchCurrent(patch: Partial<Profile>): Profile {
    const me = this.current();
    if (!me) throw new Error('You are signed out. Sign in again.');
    const users = this.users().map((u) => (u.id === me.id ? { ...u, ...patch } : u));
    this.saveUsers(users);
    return publicProfile({ ...me, ...patch });
  }

  async restore(): Promise<Profile | null> {
    const me = this.current();
    return me ? publicProfile(me) : null;
  }

  async signIn(email: string, password: string): Promise<Profile> {
    check(validateEmail(email));
    const user = this.users().find((u) => u.email === normalizeEmail(email));
    if (!user || !password) throw new Error(BAD_LOGIN);
    const hash = await derive(password, fromB64(user.salt));
    if (hash !== user.hash) throw new Error(BAD_LOGIN);
    this.store.setItem(SESSION_KEY, user.id);
    return publicProfile(user);
  }

  async signUp(name: string, email: string, password: string): Promise<SignUpResult> {
    check(validateName(name));
    check(validateEmail(email));
    check(validatePassword(password));
    const users = this.users();
    const normalized = normalizeEmail(email);
    if (users.some((u) => u.email === normalized)) {
      throw new Error('An account with this email already exists. Log in instead.');
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const user: LocalUser = {
      id: crypto.randomUUID(),
      email: normalized,
      display_name: name.trim(),
      avatar_url: null,
      insight_image_url: null,
      created_at: new Date().toISOString(),
      salt: toB64(salt),
      hash: await derive(password, salt),
    };
    this.saveUsers([...users, user]);
    this.store.setItem(SESSION_KEY, user.id);
    return { profile: publicProfile(user), needsConfirmation: false };
  }

  async signOut(): Promise<void> {
    this.store.removeItem(SESSION_KEY);
  }

  async signInWithProvider(): Promise<void> {
    throw new Error('Google, Apple and Facebook sign-in work once the app is connected to Supabase.');
  }

  async requestPasswordReset(): Promise<void> {
    throw new Error(
      'Accounts in local mode live only in this browser, so there is no email to reset from. Create a new account or connect Supabase.',
    );
  }

  async updatePassword(password: string): Promise<void> {
    check(validatePassword(password));
    const me = this.current();
    if (!me) throw new Error('You are signed out. Sign in again.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(password, salt);
    this.saveUsers(this.users().map((u) => (u.id === me.id ? { ...u, salt: toB64(salt), hash } : u)));
  }

  async updateProfile(patch: { display_name: string }): Promise<Profile> {
    check(validateName(patch.display_name));
    return this.patchCurrent({ display_name: patch.display_name.trim() });
  }

  async setImage(slot: ImageSlot, image: Blob | null): Promise<Profile> {
    const url = image ? await blobToDataUrl(image) : null;
    return this.patchCurrent({ [SLOT_COLUMN[slot]]: url });
  }

  onEvent(cb: (e: AuthEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

// ---------------------------------------------------------------- supabase

export const IMAGE_BUCKET = 'profile-images';

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export class SupabaseAuth implements AuthBackend {
  readonly kind = 'supabase' as const;

  constructor(private sb: SupabaseClient) {}

  private redirect(): string {
    return window.location.origin;
  }

  private async loadProfile(user: User): Promise<Profile> {
    const { data, error } = await this.sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    fail(error);
    if (data) return data as Profile;
    // The signup trigger normally creates the row; create it if it is missing.
    const meta = user.user_metadata ?? {};
    const name = String(meta.display_name || meta.full_name || (user.email ?? '').split('@')[0]).slice(0, 40);
    const res = await this.sb
      .from('profiles')
      .insert({ id: user.id, email: user.email ?? '', display_name: name })
      .select()
      .single();
    fail(res.error);
    return res.data as Profile;
  }

  private async me(): Promise<User> {
    const { data, error } = await this.sb.auth.getUser();
    fail(error);
    if (!data.user) throw new Error('You are signed out. Sign in again.');
    return data.user;
  }

  async restore(): Promise<Profile | null> {
    const { data, error } = await this.sb.auth.getSession();
    fail(error);
    return data.session ? this.loadProfile(data.session.user) : null;
  }

  async signIn(email: string, password: string): Promise<Profile> {
    check(validateEmail(email));
    const { data, error } = await this.sb.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    fail(error);
    if (!data.user) throw new Error(BAD_LOGIN);
    return this.loadProfile(data.user);
  }

  async signUp(name: string, email: string, password: string): Promise<SignUpResult> {
    check(validateName(name));
    check(validateEmail(email));
    check(validatePassword(password));
    const { data, error } = await this.sb.auth.signUp({
      email: normalizeEmail(email),
      password,
      options: { data: { display_name: name.trim() }, emailRedirectTo: this.redirect() },
    });
    fail(error);
    if (!data.session || !data.user) return { profile: null, needsConfirmation: true };
    return { profile: await this.loadProfile(data.user), needsConfirmation: false };
  }

  async signOut(): Promise<void> {
    fail((await this.sb.auth.signOut()).error);
  }

  async signInWithProvider(provider: OAuthProvider): Promise<void> {
    const { error } = await this.sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: this.redirect() },
    });
    fail(error);
  }

  async requestPasswordReset(email: string): Promise<void> {
    check(validateEmail(email));
    const { error } = await this.sb.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: this.redirect(),
    });
    fail(error);
  }

  async updatePassword(password: string): Promise<void> {
    check(validatePassword(password));
    fail((await this.sb.auth.updateUser({ password })).error);
  }

  private async patchProfile(patch: Partial<Profile>): Promise<Profile> {
    const user = await this.me();
    const { data, error } = await this.sb
      .from('profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select()
      .single();
    fail(error);
    return data as Profile;
  }

  async updateProfile(patch: { display_name: string }): Promise<Profile> {
    check(validateName(patch.display_name));
    return this.patchProfile({ display_name: patch.display_name.trim() });
  }

  async setImage(slot: ImageSlot, image: Blob | null): Promise<Profile> {
    const user = await this.me();
    const column = SLOT_COLUMN[slot];
    const before = (await this.loadProfile(user))[column];

    let url: string | null = null;
    if (image) {
      const path = `${user.id}/${slot}-${Date.now()}.webp`;
      const up = await this.sb.storage
        .from(IMAGE_BUCKET)
        .upload(path, image, { contentType: 'image/webp', upsert: false });
      fail(up.error);
      url = this.sb.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
    }
    const profile = await this.patchProfile({ [column]: url });

    // Best effort: remove the replaced upload so old pictures do not pile up.
    const marker = `/${IMAGE_BUCKET}/`;
    if (before && before.includes(marker)) {
      const oldPath = before.slice(before.indexOf(marker) + marker.length);
      if (oldPath.startsWith(user.id + '/')) {
        void this.sb.storage.from(IMAGE_BUCKET).remove([oldPath]);
      }
    }
    return profile;
  }

  onEvent(cb: (e: AuthEvent) => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((event) => {
      // Defer: supabase-js warns against awaiting its own calls inside this callback.
      setTimeout(() => {
        if (event === 'PASSWORD_RECOVERY') cb({ type: 'passwordRecovery' });
        else if (event === 'SIGNED_OUT') cb({ type: 'signedOut' });
        else if (event === 'SIGNED_IN') cb({ type: 'signedIn' });
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }
}
