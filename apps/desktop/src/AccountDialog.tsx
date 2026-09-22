import { useEffect, useState } from 'react';
import { Clock3, FolderOpen, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { sidecarRequest } from './sidecar';
import type { Session } from './MapAcquisition';

type Props = {
  session: Session | null;
  onClose: () => void;
  onOpenFiles: () => void;
  onSessionChange: (session: Session) => void;
};

export function AccountDialog({ session: initialSession, onClose, onOpenFiles, onSessionChange }: Props) {
  const [session, setSession] = useState<Session | null>(initialSession);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void sidecarRequest<Session>('/api/auth/status')
      .then(setSession)
      .catch((error) => setMessage((error as Error).message));
  }, []);

  function applySession(value: Session) {
    setSession(value);
    onSessionChange(value);
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const value = await sidecarRequest<Session>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      applySession(value);
      if (value.authenticated) setMessage(`Signed in as ${value.user?.username || 'osu! user'}.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setPassword('');
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setMessage('');
    try {
      const value = await sidecarRequest<Session>('/api/auth/logout', { method: 'POST' });
      applySession(value);
      setMessage('Signed out.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelVerification() {
    setBusy(true);
    try {
      const value = await sidecarRequest<Session>('/api/auth/logout', { method: 'POST' });
      applySession(value);
      setVerificationCode('');
      setMessage('Session verification cancelled.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function useEmailVerification() {
    setBusy(true);
    setMessage('');
    try {
      const value = await sidecarRequest<Session>('/api/auth/verification/mail', { method: 'POST' });
      applySession(value);
      setVerificationCode('');
      setMessage(value.message || 'Verification code sent to your email.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifySession(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const value = await sidecarRequest<Session>('/api/auth/verification/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verificationCode }),
      });
      applySession(value);
      setVerificationCode('');
      if (value.authenticated) setMessage(`Signed in as ${value.user?.username || 'osu! user'}.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const expires = session?.expiresAt ? new Date(session.expiresAt).toLocaleString() : 'Current app session';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="auth-modal account-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h2>User profile</h2>
          <button aria-label="Close profile" onClick={onClose}>
            ×
          </button>
        </div>
        {session?.authenticated && session.user ? (
          <>
            <div className="profile-hero">
              <img src={session.user.avatarUrl} alt="osu! avatar" referrerPolicy="no-referrer" />
              <div>
                <strong>{session.user.username}</strong>
                <span>osu! user #{session.user.id}</span>
                <small>
                  <ShieldCheck size={13} /> Session verified
                </small>
              </div>
            </div>
            <div className="profile-detail">
              <Clock3 size={15} />
              <span>
                <small>Session expires</small>
                {expires}
              </span>
            </div>
            <div className="profile-actions">
              <button
                onClick={() => {
                  onClose();
                  onOpenFiles();
                }}
              >
                <FolderOpen size={16} /> Open replay or beatmap
              </button>
              <button disabled={busy} onClick={() => void logout()}>
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="signed-out-profile">
              <UserRound size={32} />
              <div>
                <strong>Sign in to osu!</strong>
                <span>Use your account for map information and downloads.</span>
              </div>
            </div>
            <form className="profile-login" onSubmit={(event) => void login(event)}>
              <label>
                Username
                <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button className="primary-button" disabled={busy || !username || !password}>
                Sign in
              </button>
            </form>
          </>
        )}
        {message && <p role="status">{message}</p>}
        {session?.verificationRequired && (
          <div className="verification-backdrop">
            <form className="verification-modal" onSubmit={(event) => void verifySession(event)}>
              <h3>Verify your osu! session</h3>
              {session.user && (
                <div className="acquisition-identity">
                  <img src={session.user.avatarUrl} alt="osu! avatar" referrerPolicy="no-referrer" />
                  <div>
                    <strong>{session.user.username}</strong>
                    <small>Verification required</small>
                  </div>
                </div>
              )}
              <p>
                {session.verificationMethod === 'mail'
                  ? 'Enter the code osu! sent to your email.'
                  : 'Enter the current code from your authenticator app.'}
              </p>
              <label>
                Verification code
                <input
                  autoFocus
                  inputMode={session.verificationMethod === 'totp' ? 'numeric' : 'text'}
                  autoComplete="one-time-code"
                  value={verificationCode}
                  onChange={(event) =>
                    setVerificationCode(
                      session.verificationMethod === 'totp'
                        ? event.target.value.replace(/\D/g, '').slice(0, 12)
                        : event.target.value.replace(/\s/g, '').slice(0, 64),
                    )
                  }
                  placeholder={session.verificationMethod === 'mail' ? 'e.g. 452c8a4d' : 'Authenticator code'}
                />
              </label>
              {session.verificationMethod === 'totp' && (
                <button type="button" disabled={busy} onClick={() => void useEmailVerification()}>
                  Use email instead
                </button>
              )}
              {message && <p role="alert">{message}</p>}
              <div className="verification-actions">
                <button type="button" disabled={busy} onClick={() => void cancelVerification()}>
                  Cancel
                </button>
                <button className="primary-button" disabled={busy || verificationCode.length < 4}>
                  Verify
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
