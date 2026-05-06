import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { getWAStatus, connectWA, disconnectWA, getGroups, syncGroups } from '../api.js';

// ─── QR Display: backend sends a data:image/png;base64,… string ──────────────
// Use a plain <img> tag — no need for QRCodeCanvas at all.
function QRDisplay({ qr }) {
  if (!qr) return null;
  return (
    <img
      src={qr}
      alt="WhatsApp QR Code"
      style={{ width: 230, height: 230, borderRadius: 10, background: '#fff', padding: 6, display: 'block' }}
    />
  );
}

export default function WhatsAppPage() {
  const [status, setStatus]         = useState('disconnected');
  const [qr, setQr]                 = useState(null);
  const [groups, setGroups]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [syncing, setSyncing]       = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [liveSocket, setLiveSocket] = useState(false);

  const prevStatus = useRef('disconnected');

  const user  = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');

  // ─── REST poll ───────────────────────────────────────────────────────────
  async function loadStatus() {
    try {
      const { data } = await getWAStatus();
      const s = data.status || 'disconnected';
      setStatus(s);
      if (data.qr) setQr(data.qr);
      else if (s === 'connected' || s === 'disconnected') setQr(null);
    } catch (err) {
      console.warn('[WA] REST poll error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadGroups() {
    try {
      const { data } = await getGroups();
      setGroups(data.groups || []);
    } catch {}
  }

  // ─── Socket.io ───────────────────────────────────────────────────────────
  useEffect(() => {
    loadStatus();
    loadGroups();

    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      setLiveSocket(true);
      socket.emit('join', { userId: user.id });
    });
    socket.on('disconnect', () => setLiveSocket(false));
    socket.on('connect_error', () => setLiveSocket(false));

    // Backend sends wa:qr when QR is ready (data:image/png;base64,…)
    socket.on('wa:qr', (payload) => {
      const q = payload?.qr || null;
      if (q) {
        setQr(q);
        setStatus('qr_ready');
      }
    });

    // Backend sends wa:ready when WhatsApp is authenticated
    socket.on('wa:ready', () => {
      setStatus('connected');
      setQr(null);
      prevStatus.current = 'connected';
      toast.success('WhatsApp connected! 🎉');
      loadGroups();
    });

    // Backend sends wa:disconnected on disconnect / auth failure
    socket.on('wa:disconnected', (payload) => {
      setStatus('disconnected');
      setQr(null);
      prevStatus.current = 'disconnected';
      const reason = payload?.reason || '';
      if (reason !== 'Manual disconnect') {
        toast.error('WhatsApp disconnected' + (reason ? `: ${reason}` : ''));
      }
    });

    // wa:status is used for initializing etc.
    socket.on('wa:status', (payload) => {
      if (payload?.status) setStatus(payload.status);
    });

    const interval = setInterval(loadStatus, 8000);
    return () => { socket.disconnect(); clearInterval(interval); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions ─────────────────────────────────────────────────────────────
  async function handleConnect() {
    setConnecting(true);
    setStatus('initializing');
    setQr(null);
    try {
      await connectWA();
      toast.success('Starting WhatsApp — QR code will appear in ~10–30 seconds…');
      setTimeout(loadStatus, 5000);
      setTimeout(loadStatus, 12000);
      setTimeout(loadStatus, 20000);
    } catch (err) {
      setStatus('disconnected');
      toast.error(err.response?.data?.message || 'Failed to start WhatsApp');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect WhatsApp?')) return;
    try {
      await disconnectWA();
      setStatus('disconnected');
      setQr(null);
      toast.success('Disconnected');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to disconnect');
    }
  }

  async function handleSyncGroups() {
    setSyncing(true);
    try {
      const { data } = await syncGroups();
      setGroups(data.groups || []);
      toast.success(`Synced ${data.groups?.length || 0} groups`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sync failed — is WhatsApp connected?');
    } finally {
      setSyncing(false);
    }
  }

  // ─── Status config ───────────────────────────────────────────────────────
  const cfgMap = {
    connected:    { color: '#22c55e', emoji: '🟢', label: 'Connected',     desc: 'WhatsApp is active and ready to send messages.' },
    disconnected: { color: '#64748b', emoji: '🔴', label: 'Disconnected',  desc: 'Connect your WhatsApp to enable automated messaging.' },
    initializing: { color: '#f59e0b', emoji: '🟡', label: 'Starting…',     desc: 'Chrome is launching. The QR code will appear shortly (10–30s).' },
    qr_ready:     { color: '#3b82f6', emoji: '📱', label: 'Scan QR Code',  desc: 'Open WhatsApp → Linked Devices → Link a Device and scan below.' },
    reconnecting: { color: '#8b5cf6', emoji: '🔄', label: 'Reconnecting…', desc: 'Restoring your previous session automatically.' },
  };
  const cfg = cfgMap[status] || cfgMap.disconnected;
  const isWorking = connecting || status === 'initializing' || status === 'reconnecting';

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <div className="section-title">📲 WhatsApp</div>
          <div className="section-desc">Manage your WhatsApp connection</div>
        </div>
        <span style={{ fontSize: 12, color: liveSocket ? 'var(--accent)' : 'var(--muted)' }}>
          ● {liveSocket ? 'Live updates' : 'Polling mode'}
        </span>
      </div>

      {loading ? (
        <div className="empty-state">
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <>
          {/* ── Top two cards ───────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>

            {/* Status card */}
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 60, marginBottom: 12 }}>{cfg.emoji}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: cfg.color, marginBottom: 8 }}>{cfg.label}</div>
              <p className="text-muted" style={{ marginBottom: 24, fontSize: 14 }}>{cfg.desc}</p>

              <div className="flex gap-3" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                {status === 'connected' ? (
                  <button className="btn btn-danger" onClick={handleDisconnect}>🔌 Disconnect</button>
                ) : (
                  <button className="btn btn-primary" onClick={handleConnect} disabled={isWorking}>
                    {isWorking ? <span className="spinner" /> : '🔗'} Connect WhatsApp
                  </button>
                )}
                <button className="btn btn-secondary" onClick={loadStatus}>🔄 Refresh</button>
              </div>

              {isWorking && (
                <p className="text-muted text-sm mt-4">
                  ⏳ This can take 10–30 seconds on first launch…
                </p>
              )}
            </div>

            {/* QR card */}
            <div className="card" style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
              {qr ? (
                <div className="qr-wrapper">
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>📱 Scan with WhatsApp</div>
                  <p className="text-muted text-sm" style={{ textAlign: 'center', marginBottom: 14 }}>
                    WhatsApp → Linked Devices → Link a Device
                  </p>
                  <QRDisplay qr={qr} />
                  <p className="text-muted text-sm" style={{ marginTop: 10 }}>
                    QR expires in ~60s. Click Refresh if it doesn't work.
                  </p>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                  {isWorking ? (
                    <>
                      <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>Launching Chrome…</div>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                      <p className="text-sm" style={{ marginTop: 12 }}>QR code will appear here automatically</p>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
                      <div style={{ fontWeight: 600 }}>QR Code will appear here</div>
                      <p className="text-sm mt-4">Click "Connect WhatsApp" to begin</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Groups ─────────────────────────────────────────────────── */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">👥 WhatsApp Groups ({groups.length})</div>
              <button className="btn btn-secondary btn-sm" onClick={handleSyncGroups} disabled={syncing || status !== 'connected'}>
                {syncing ? <span className="spinner" /> : '🔄'} Sync Groups
              </button>
            </div>
            <div className="card-body">
              {groups.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">👥</div>
                  <p>
                    {status === 'connected'
                      ? 'Click "Sync Groups" to import your WhatsApp groups.'
                      : 'Connect WhatsApp first, then sync your groups.'}
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Group Name</th><th>Members</th><th>JID</th></tr></thead>
                    <tbody>
                      {groups.map(g => (
                        <tr key={g.group_jid}>
                          <td>
                            <div className="flex items-center gap-2">
                              {g.profile_pic_url
                                ? <img src={g.profile_pic_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                                : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👥</div>
                              }
                              <span style={{ fontWeight: 600 }}>{g.name}</span>
                            </div>
                          </td>
                          <td><span className="badge badge-user">{g.participants_count}</span></td>
                          <td className="text-muted text-sm" style={{ fontFamily: 'monospace', fontSize: 11 }}>{g.group_jid}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ── How to connect ─────────────────────────────────────────── */}
          <div className="card mt-6" style={{ padding: 24 }}>
            <div className="card-title mb-4">📖 How to Connect</div>
            <ol style={{ paddingLeft: 20, color: 'var(--muted)', lineHeight: 2.4, fontSize: 14 }}>
              <li>Click <strong style={{ color: 'var(--text)' }}>Connect WhatsApp</strong>.</li>
              <li>Wait 10–30 seconds for Chrome to start in the background.</li>
              <li>The QR code will appear automatically on the right.</li>
              <li>On your phone: <strong style={{ color: 'var(--text)' }}>WhatsApp → ⋮ → Linked Devices → Link a Device</strong>.</li>
              <li>Scan the QR. Status changes to <span className="badge badge-connected">Connected</span>.</li>
              <li>Click <strong style={{ color: 'var(--text)' }}>Sync Groups</strong> to import groups for scheduling.</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
