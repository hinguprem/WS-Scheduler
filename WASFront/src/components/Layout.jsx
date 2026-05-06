import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const navItems = [
  { to: '/',         icon: '🏠', label: 'Dashboard',  end: true },
  { to: '/messages', icon: '💬', label: 'Messages' },
  { to: '/whatsapp', icon: '📲', label: 'WhatsApp' },
  { to: '/contacts', icon: '👥', label: 'Contacts' },
];

const adminItems = [
  { to: '/users', icon: '🛡️', label: 'Users' },
];

export default function Layout() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    toast.success('Logged out');
    navigate('/login');
  }

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">📱</div>
          <div>
            <div className="logo-text">WA Scheduler</div>
            <div className="logo-sub">WhatsApp Automation</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-label">Menu</div>
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>

          {user.role === 'admin' && (
            <div className="nav-section">
              <div className="nav-label">Admin</div>
              {adminItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card" onClick={logout} title="Click to logout">
            <div className="user-avatar">
              {(user.username || 'U')[0].toUpperCase()}
            </div>
            <div className="user-info">
              <div className="user-name">{user.username || 'User'}</div>
              <div className="user-role">{user.role || 'user'} · Logout</div>
            </div>
            <span style={{ color: 'var(--muted)', fontSize: 16 }}>↩</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
