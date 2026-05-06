import { useState, useEffect } from 'react';
import { getMessages, getWAStatus } from '../api.js';

export default function DashboardPage() {
  const [stats, setStats]     = useState({ total: 0, pending: 0, sent: 0, failed: 0 });
  const [waStatus, setWaStatus] = useState('disconnected');
  const [recent, setRecent]   = useState([]);
  const [loading, setLoading] = useState(true);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    async function load() {
      try {
        const [msgRes, waRes] = await Promise.allSettled([
          getMessages({ limit: 5 }),
          getWAStatus(),
        ]);

        if (msgRes.status === 'fulfilled') {
          const all = msgRes.value.data;
          const messages = all.messages || [];
          setRecent(messages);
          // Fetch counts per status
          const [sent, pending, failed] = await Promise.allSettled([
            getMessages({ status: 'sent',    limit: 1 }),
            getMessages({ status: 'pending', limit: 1 }),
            getMessages({ status: 'failed',  limit: 1 }),
          ]);
          setStats({
            total:   all.pagination?.total || 0,
            sent:    sent.status === 'fulfilled'    ? sent.value.data.pagination?.total    || 0 : 0,
            pending: pending.status === 'fulfilled' ? pending.value.data.pagination?.total || 0 : 0,
            failed:  failed.status === 'fulfilled'  ? failed.value.data.pagination?.total  || 0 : 0,
          });
        }

        if (waRes.status === 'fulfilled') {
          setWaStatus(waRes.value.data.status || 'disconnected');
        }
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  const statCards = [
    { label: 'Total Messages', value: stats.total,   icon: '💬', color: 'blue' },
    { label: 'Sent',           value: stats.sent,    icon: '✅', color: 'green' },
    { label: 'Pending',        value: stats.pending, icon: '⏳', color: 'yellow' },
    { label: 'Failed',         value: stats.failed,  icon: '❌', color: 'red' },
  ];

  function statusBadge(status) {
    return <span className={`badge badge-${status}`}>{status}</span>;
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="section-header">
        <div>
          <div className="section-title">👋 Welcome, {user.username || 'User'}!</div>
          <div className="section-desc">Here's your WhatsApp scheduler overview</div>
        </div>
        <div className="flex gap-2 items-center">
          <span className={`badge badge-${waStatus === 'connected' ? 'connected' : 'disconnected'}`}>
            WA: {waStatus}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {statCards.map(sc => (
          <div key={sc.label} className={`stat-card ${sc.color}`}>
            <div className={`stat-icon ${sc.color}`}>{sc.icon}</div>
            <div className="stat-info">
              <div className="stat-value">{loading ? '—' : sc.value}</div>
              <div className="stat-label">{sc.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* WhatsApp status card */}
      <div style={{ marginBottom: 28 }}>
        <div className="card" style={{ padding: 24 }}>
          <div className="card-title mb-4">📲 WhatsApp Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 40 }}>
              {waStatus === 'connected' ? '🟢' : '🔴'}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, textTransform: 'capitalize' }}>{waStatus}</div>
              <div className="text-muted text-sm">
                {waStatus === 'connected' ? 'Messages can be sent automatically' : 'Connect WhatsApp to enable messaging'}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <a href="/whatsapp" className="btn btn-primary btn-sm">Manage Connection →</a>
          </div>
        </div>
      </div>

      {/* Recent Messages */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">🕓 Recent Messages</div>
          <a href="/messages" className="btn btn-secondary btn-sm">View All</a>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="empty-state"><div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} /></div>
          ) : recent.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <p>No messages yet. Schedule your first message!</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Scheduled</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(m => (
                    <tr key={m.id}>
                      <td>{m.recipient_name || m.recipient || 'Status Update'}</td>
                      <td><span className="badge badge-user">{m.type}</span></td>
                      <td>{statusBadge(m.status)}</td>
                      <td className="text-muted text-sm">{new Date(m.scheduled_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
