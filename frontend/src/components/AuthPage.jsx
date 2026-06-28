import { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import './AuthPage.css';

// Google SVG icon
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.6 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.1 7.1 29.3 5 24 5 12.9 5 4 13.9 4 25s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.1 7.1 29.3 5 24 5 16.3 5 9.7 9.1 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 45c5.2 0 9.9-1.9 13.4-5.1l-6.2-5.2C29.3 36.6 26.8 37.5 24 37.5c-5.3 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.6 40.6 16.3 45 24 45z"/>
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.2 5.4l6.2 5.2C37.6 39 44 34 44 25c0-1.3-.1-2.6-.4-3.9z"/>
  </svg>
);

export default function AuthPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const reset = () => { setError(''); setInfo(''); };

  const handleGoogle = async () => {
    reset();
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // AuthContext onAuthStateChanged handles the rest
    } catch (e) {
      setError(friendlyError(e.code));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    reset();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setError(friendlyError(e.code));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    reset();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      if (name.trim()) await updateProfile(user, { displayName: name.trim() });
    } catch (e) {
      setError(friendlyError(e.code));
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    reset();
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setInfo('Password reset email sent! Check your inbox.');
    } catch (e) {
      setError(friendlyError(e.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" />
      <div className="auth-card">

        {/* Logo */}
        <div className="auth-logo">
          <span className="auth-logo-icon">🤝</span>
          <div>
            <div className="auth-logo-name">Collaborative AI</div>
            <div className="auth-logo-sub">Council of Minds</div>
          </div>
        </div>

        {/* Mode heading */}
        <h1 className="auth-title">
          {mode === 'login'    ? 'Welcome back'      : ''}
          {mode === 'register' ? 'Create account'    : ''}
          {mode === 'forgot'   ? 'Reset password'    : ''}
        </h1>
        <p className="auth-subtitle">
          {mode === 'login'    ? 'Sign in to your council'                  : ''}
          {mode === 'register' ? 'Join and build your AI council'           : ''}
          {mode === 'forgot'   ? "We'll send a reset link to your email"   : ''}
        </p>

        {/* Google button (not for forgot) */}
        {mode !== 'forgot' && (
          <>
            <button className="auth-google-btn" onClick={handleGoogle} disabled={loading}>
              <GoogleIcon />
              Continue with Google
            </button>
            <div className="auth-divider"><span>or</span></div>
          </>
        )}

        {/* Error / Info */}
        {error && <div className="auth-error">{error}</div>}
        {info  && <div className="auth-info">{info}</div>}

        {/* ── Login form ── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <label className="auth-label">Email</label>
            <input className="auth-input" type="email" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />

            <label className="auth-label">Password</label>
            <div className="auth-pass-wrap">
              <input className="auth-input" type={showPass ? 'text' : 'password'}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required />
              <button type="button" className="auth-eye" onClick={() => setShowPass(p => !p)}>
                {showPass
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>

            <button type="button" className="auth-link-btn"
              onClick={() => { setMode('forgot'); reset(); }}>
              Forgot password?
            </button>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? <span className="auth-spinner" /> : 'Sign In'}
            </button>
          </form>
        )}

        {/* ── Register form ── */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="auth-form">
            <label className="auth-label">Full name</label>
            <input className="auth-input" type="text" value={name}
              onChange={e => setName(e.target.value)} placeholder="Your name" />

            <label className="auth-label">Email</label>
            <input className="auth-input" type="email" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />

            <label className="auth-label">Password</label>
            <div className="auth-pass-wrap">
              <input className="auth-input" type={showPass ? 'text' : 'password'}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters" required />
              <button type="button" className="auth-eye" onClick={() => setShowPass(p => !p)}>
                {showPass
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>

            <label className="auth-label">Confirm password</label>
            <input className="auth-input" type="password" value={confirm}
              onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required />

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? <span className="auth-spinner" /> : 'Create Account'}
            </button>
          </form>
        )}

        {/* ── Forgot Password form ── */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="auth-form">
            <label className="auth-label">Email address</label>
            <input className="auth-input" type="email" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? <span className="auth-spinner" /> : 'Send Reset Email'}
            </button>

            <button type="button" className="auth-link-btn"
              onClick={() => { setMode('login'); reset(); }}>
              ← Back to sign in
            </button>
          </form>
        )}

        {/* Toggle login ↔ register */}
        {mode !== 'forgot' && (
          <p className="auth-toggle">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button className="auth-link-btn inline"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); reset(); }}>
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

function friendlyError(code) {
  const map = {
    'auth/invalid-email':            'Invalid email address.',
    'auth/user-disabled':            'This account has been disabled.',
    'auth/user-not-found':           'No account found with this email.',
    'auth/wrong-password':           'Incorrect password.',
    'auth/invalid-credential':       'Incorrect email or password.',
    'auth/email-already-in-use':     'An account with this email already exists.',
    'auth/weak-password':            'Password must be at least 6 characters.',
    'auth/too-many-requests':        'Too many attempts. Please try again later.',
    'auth/popup-closed-by-user':     'Sign-in popup was closed.',
    'auth/network-request-failed':   'Network error. Check your connection.',
  };
  return map[code] || `Error: ${code}`;
}
