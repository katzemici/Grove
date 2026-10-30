import { describe, expect, it } from 'vitest';
import { LocalAuth, validateEmail, validateName, validatePassword } from '../lib/auth';
import { LocalAdapter, createMemoryStore, userDataKey } from '../lib/localAdapter';
import { validateImageFile } from '../lib/images';
import { surfaceLevel, surfacePath } from '../lib/liquidSurface';
import { isSecretKey } from '../lib/supabaseClient';

describe('Supabase key guard', () => {
  const jwt = (role: string) => `x.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.y`;
  it('rejects service_role and secret keys, accepts public ones', () => {
    expect(isSecretKey(jwt('service_role'))).toBe(true);
    expect(isSecretKey('sb_secret_abc123')).toBe(true);
    expect(isSecretKey(jwt('anon'))).toBe(false);
    expect(isSecretKey('sb_publishable_abc123')).toBe(false);
  });
});

describe('liquid pour geometry', () => {
  const ys = (d: string) => [...d.matchAll(/[ML][\d.]+ (-?[\d.]+)/g)].map((m) => Number(m[1]));
  it('starts below the hero, ends above it, and is flat at rest', () => {
    expect(surfaceLevel(0)).toBeGreaterThan(1);
    expect(surfaceLevel(1)).toBeLessThan(0);
    const rest = ys(surfacePath(0, 3)).slice(0, -2);
    expect(new Set(rest).size).toBe(1);
    const mid = ys(surfacePath(0.5, 3)).slice(0, -2);
    expect(Math.max(...mid) - Math.min(...mid)).toBeGreaterThan(0.05);
  });
});

function memoryKV() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe('auth validation', () => {
  it('checks email, password and name', () => {
    expect(validateEmail('cat@grove.app')).toBeNull();
    expect(validateEmail('not-an-email')).toMatch(/valid email/);
    expect(validatePassword('1234567')).toMatch(/8 characters/);
    expect(validatePassword('12345678')).toBeNull();
    expect(validateName('  ')).toMatch(/Enter your name/);
    expect(validateName('x'.repeat(41))).toMatch(/40/);
  });

  it('accepts common image types up to 10 MB', () => {
    expect(validateImageFile({ type: 'image/png', size: 1000 })).toBeNull();
    expect(validateImageFile({ type: 'application/pdf', size: 1000 })).toMatch(/PNG/);
    expect(validateImageFile({ type: 'image/jpeg', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
  });
});

describe('LocalAuth', () => {
  it('signs up, persists the session, and signs back in', async () => {
    const kv = memoryKV();
    const auth = new LocalAuth(kv);
    const { profile } = await auth.signUp('Mochi', 'Mochi@Grove.app ', 'whiskers1');
    expect(profile).toMatchObject({ email: 'mochi@grove.app', display_name: 'Mochi', avatar_url: null });

    // Password is never stored in plain text.
    expect(kv.map.get('grove:auth:users')).not.toContain('whiskers1');

    // A fresh instance (page reload) restores the session.
    expect((await new LocalAuth(kv).restore())?.id).toBe(profile!.id);

    await auth.signOut();
    expect(await auth.restore()).toBeNull();
    expect((await auth.signIn('mochi@grove.app', 'whiskers1')).id).toBe(profile!.id);
  });

  it('rejects wrong passwords, unknown emails and duplicate accounts', async () => {
    const auth = new LocalAuth(memoryKV());
    await auth.signUp('Mochi', 'mochi@grove.app', 'whiskers1');
    await expect(auth.signIn('mochi@grove.app', 'wrong-pass')).rejects.toThrow('Incorrect email or password.');
    await expect(auth.signIn('nobody@grove.app', 'whiskers1')).rejects.toThrow('Incorrect email or password.');
    await expect(auth.signUp('Again', 'MOCHI@grove.app', 'whiskers1')).rejects.toThrow(/already exists/);
  });

  it('updates the name and pictures, and resets pictures to the default', async () => {
    const auth = new LocalAuth(memoryKV());
    await auth.signUp('Mochi', 'mochi@grove.app', 'whiskers1');
    expect((await auth.updateProfile({ display_name: '  Mochi the Cat ' })).display_name).toBe('Mochi the Cat');

    const img = new Blob(['fake'], { type: 'image/webp' });
    const withAvatar = await auth.setImage('avatar', img);
    expect(withAvatar.avatar_url).toMatch(/^data:image\/webp;base64,/);
    const withInsight = await auth.setImage('insight', img);
    expect(withInsight.insight_image_url).toMatch(/^data:/);
    expect(withInsight.avatar_url).toBe(withAvatar.avatar_url);

    expect((await auth.setImage('avatar', null)).avatar_url).toBeNull();
    expect((await auth.restore())?.insight_image_url).toMatch(/^data:/);
  });

  it('changes the password', async () => {
    const auth = new LocalAuth(memoryKV());
    await auth.signUp('Mochi', 'mochi@grove.app', 'whiskers1');
    await auth.updatePassword('newwhiskers');
    await auth.signOut();
    await expect(auth.signIn('mochi@grove.app', 'whiskers1')).rejects.toThrow();
    await expect(auth.signIn('mochi@grove.app', 'newwhiskers')).resolves.toBeTruthy();
  });
});

describe('LocalAdapter per-user scope', () => {
  it('keeps each user’s data separate and gives pre-account data to the first user', async () => {
    const store = createMemoryStore();
    const db = new LocalAdapter(store);
    await db.createHabit({ name: 'Old habit', frequency: { kind: 'daily' } });

    db.setScope('user-a');
    expect((await db.listHabits()).map((h) => h.name)).toEqual(['Old habit']);
    await db.createHabit({ name: 'A only', frequency: { kind: 'daily' } });

    db.setScope('user-b');
    expect(await db.listHabits()).toEqual([]);
    await db.createHabit({ name: 'B only', frequency: { kind: 'daily' } });

    db.setScope('user-a');
    expect((await db.listHabits()).map((h) => h.name)).toEqual(['Old habit', 'A only']);
    expect(store.getItem(userDataKey('user-b'))).toContain('B only');

    // The original pre-account data is left in place as a backup.
    db.setScope(null);
    expect((await db.listHabits()).map((h) => h.name)).toEqual(['Old habit']);
  });
});
