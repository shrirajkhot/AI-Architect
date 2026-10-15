import { useState } from 'react';
import { useAuth } from '../../auth/store/AuthContext';
import { login as loginApi } from '../../../shared/api-client/api';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await loginApi({ email, password });
      login(data.access_token, data.user);
      toast.success('Login successful!');
      navigate('/dashboard');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || 'Login failed');
      setError(msg || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-secondary)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '2rem', left: '2rem' }}>
        <Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', transition: 'color 0.2s' }} onMouseOver={e=>e.currentTarget.style.color='var(--accent-color)'} onMouseOut={e=>e.currentTarget.style.color='var(--text-secondary)'}>
          ← Back to Home
        </Link>
      </div>

      <div style={{ width: '100%', maxWidth: '440px', padding: '0 1rem', position: 'relative', zIndex: 10 }}>
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '2.5rem', boxShadow: 'var(--shadow-elevated)' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', background: 'var(--accent-color)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900, fontSize: '1.5rem' }}>
                A
              </div>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Welcome Back</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Sign in to continue to AI Architect</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>Email Address</label>
              <input 
                type="email" 
                placeholder="hello@example.com" 
                required 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' }}
                onFocus={e => e.target.style.borderColor = 'var(--accent-color)'}
                onBlur={e => e.target.style.borderColor = 'var(--input-border)'}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>Password</label>
              <input 
                type="password" 
                placeholder="••••••••" 
                required 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' }}
                onFocus={e => e.target.style.borderColor = 'var(--accent-color)'}
                onBlur={e => e.target.style.borderColor = 'var(--input-border)'}
              />
            </div>
            
            {error && <p style={{ color: 'var(--error)', fontSize: '0.85rem', margin: '4px 0 0 0', fontWeight: 600 }}>{error}</p>}
            
            <button type="submit" disabled={loading} className="primary-btn" style={{ padding: '14px', fontSize: '1.05rem', fontWeight: 700, marginTop: '8px', width: '100%', borderRadius: '8px' }}>
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--accent-color)', textDecoration: 'none', fontWeight: 700 }}>Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
