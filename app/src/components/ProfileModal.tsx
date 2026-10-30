import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import Modal from './Modal';
import Icon from './Icon';
import { session, useProfile } from '../lib/session';
import { DEFAULT_AVATAR, DEFAULT_INSIGHT_IMAGE, type ImageSlot } from '../lib/images';
import { validateName } from '../lib/auth';

/** Hidden file input + trigger. Resizes and saves the chosen picture for one slot. */
export function PictureInput({
  slot,
  onError,
  onBusy,
  children,
  className = 'btn btn-secondary btn-sm',
  label,
}: {
  slot: ImageSlot;
  onError: (message: string) => void;
  onBusy?: (busy: boolean) => void;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    onBusy?.(true);
    try {
      await session.setImage(slot, file);
    } catch (err) {
      onError((err as Error).message || 'Could not save that picture.');
    } finally {
      setBusy(false);
      onBusy?.(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <button
        type="button"
        className={className}
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={label}
        title={label}
      >
        {children}
      </button>
    </>
  );
}

export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!profile) return null;

  const showError = (text: string) => setMessage({ tone: 'error', text });

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const problem = validateName(name);
    setNameError(problem);
    if (problem) return;
    setSaving(true);
    try {
      await session.updateProfile(name);
      setMessage({ tone: 'ok', text: 'Saved.' });
    } catch (err) {
      showError((err as Error).message || 'Could not save your name.');
    } finally {
      setSaving(false);
    }
  }

  async function reset(slot: ImageSlot) {
    setMessage(null);
    try {
      await session.setImage(slot, null);
    } catch (err) {
      showError((err as Error).message || 'Could not reset that picture.');
    }
  }

  async function signOut() {
    try {
      await session.signOut();
    } catch (err) {
      showError((err as Error).message || 'Could not sign out.');
    }
  }

  return (
    <Modal title="Your profile" onClose={onClose}>
      <div className="profile-head">
        <img className="profile-avatar" src={profile.avatar_url ?? DEFAULT_AVATAR} alt="Your profile picture" />
        <div style={{ minWidth: 0 }}>
          <div className="profile-email">{profile.email}</div>
          <div className="profile-actions">
            <PictureInput slot="avatar" onError={showError} label="Change profile picture">
              <Icon name="camera" size={14} /> Change photo
            </PictureInput>
            {profile.avatar_url && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => reset('avatar')}>
                Use the cat
              </button>
            )}
          </div>
        </div>
      </div>

      <form className="profile-section" onSubmit={saveName}>
        <div className="field">
          <label htmlFor="profile-name">Display name</label>
          <input
            id="profile-name"
            className={'input' + (nameError ? ' invalid' : '')}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setMessage(null);
            }}
            autoComplete="name"
          />
          {nameError && <span className="field-error">{nameError}</span>}
        </div>
        <div className="profile-actions">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={saving || name.trim() === profile.display_name}
          >
            {saving ? 'Saving…' : 'Save name'}
          </button>
        </div>
      </form>

      <div className="profile-section">
        <h3>Overview insight picture</h3>
        <img
          className="profile-insight"
          src={profile.insight_image_url ?? DEFAULT_INSIGHT_IMAGE}
          alt="Picture shown on the Overview insight card"
        />
        <div className="profile-actions">
          <PictureInput slot="insight" onError={showError} label="Change insight picture">
            <Icon name="camera" size={14} /> Change picture
          </PictureInput>
          {profile.insight_image_url && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => reset('insight')}>
              Use the cat
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={'auth-message ' + message.tone}
          role={message.tone === 'error' ? 'alert' : 'status'}
          style={{ marginTop: 16 }}
        >
          {message.text}
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-danger" onClick={signOut}>
          <Icon name="logout" size={14} /> Sign out
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
