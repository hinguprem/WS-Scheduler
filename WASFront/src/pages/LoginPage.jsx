import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { login, createDemo } from '../api.js';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const navigate = useNavigate();

  async function handleDemo() {
    setDemoLoading(true);
    try {
      const { data } = await createDemo();
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success('Welcome to your 24-Hour Demo!');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create demo account');
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) return toast.error('Please fill in all fields');
    setLoading(true);
    try {
      const { data } = await login(email, password);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success(`Welcome back, ${data.user.username}!`);
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="big-icon">📱</div>
          <h1>WA Scheduler</h1>
          <p>WhatsApp Message Automation Platform</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-control"
              placeholder="user@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={loading || demoLoading} style={{ marginTop: 8 }}>
            {loading ? <span className="spinner" /> : '🔐'} Sign In
          </button>
          
          <button type="button" onClick={handleDemo} className="btn btn-secondary w-full" disabled={loading || demoLoading} style={{ marginTop: 12 }}>
            {demoLoading ? <span className="spinner" /> : '🚀'} Try 24-Hour Demo
          </button>
        </form>

        <p className="text-muted text-sm mt-4" style={{ textAlign: 'center' }}>
          Want an account? Contact us on WhatsApp at <strong>+91 9512922405</strong>
        </p>
      </div>
    </div>
  );
}
