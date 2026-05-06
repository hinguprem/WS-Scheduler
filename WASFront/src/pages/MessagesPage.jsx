import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { getMessages, createMessage, sendNow, deleteMessage, getGroups, getContacts } from '../api.js';

const TIMEZONES = ['Asia/Kolkata', 'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Dubai', 'Asia/Singapore'];

// ─── Modal wrapper ────────────────────────────────────────────────────────────
function Modal({ onClose, children }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620 }}>{children}</div>
    </div>
  );
}

// ─── Multi-select tag picker for contacts ─────────────────────────────────────
function ContactPicker({ contacts, selected, onChange }) {
  const [search, setSearch] = useState('');
  const [open, setOpen]     = useState(false);
  const wrapRef = useRef();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    return (c.name?.toLowerCase().includes(q) || c.phone?.includes(q)) && !selected.find(s => s.phone === c.phone);
  }).slice(0, 30);

  function addContact(c) { onChange([...selected, c]); setSearch(''); }
  function removeContact(phone) { onChange(selected.filter(s => s.phone !== phone)); }

  // Also allow typing a raw phone number
  function handleKeyDown(e) {
    if (e.key === 'Enter' && search.trim()) {
      e.preventDefault();
      const raw = search.trim().replace(/\D/g, '');
      if (raw.length >= 7) {
        const exists = selected.find(s => s.phone === raw);
        if (!exists) { onChange([...selected, { phone: raw, name: raw }]); }
      }
      setSearch('');
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Selected tags */}
      <div
        style={{
          minHeight: 42, padding: '6px 10px', background: 'var(--bg3)',
          border: '1px solid var(--border)', borderRadius: 10, cursor: 'text',
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
          transition: 'border-color 0.2s',
        }}
        onClick={() => { setOpen(true); }}
      >
        {selected.map(c => (
          <span key={c.phone} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'rgba(37,211,102,0.15)', color: 'var(--accent)',
            border: '1px solid rgba(37,211,102,0.3)', borderRadius: 20,
            padding: '2px 8px', fontSize: 12, fontWeight: 600,
          }}>
            {c.name || c.phone}
            <span onClick={e => { e.stopPropagation(); removeContact(c.phone); }}
              style={{ cursor: 'pointer', fontWeight: 700, marginLeft: 2, opacity: 0.7 }}>✕</span>
          </span>
        ))}
        <input
          style={{ flex: 1, minWidth: 120, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit' }}
          placeholder={selected.length === 0 ? 'Search contacts or type number + Enter…' : 'Add more…'}
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
          maxHeight: 220, overflowY: 'auto', marginTop: 4,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {contacts.length === 0 && (
            <div style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: 13 }}>
              ⚠️ No contacts synced yet. Go to the Contacts page → Sync Contacts first.
            </div>
          )}
          {contacts.length > 0 && filtered.length === 0 && search && (
            <div style={{ padding: '10px 16px', color: 'var(--muted)', fontSize: 13 }}>
              No match — press Enter to add "{search.replace(/\D/g, '')}" as phone number
            </div>
          )}
          {filtered.map(c => (
            <div
              key={c.phone}
              onClick={() => addContact(c)}
              style={{
                padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,var(--blue),var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {(c.name || c.phone)[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name || c.phone}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.phone}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
        {selected.length > 0 && `${selected.length} recipient(s) selected · `}
        Tip: type a phone number and press Enter to add manually
      </div>
    </div>
  );
}

// ─── Group picker (single select with search) ─────────────────────────────────
function GroupPicker({ groups, value, onChange }) {
  const [search, setSearch] = useState('');
  const [open, setOpen]     = useState(false);
  const wrapRef = useRef();

  useEffect(() => {
    function handler(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = groups.find(g => g.group_jid === value);
  const filtered = groups.filter(g => g.name?.toLowerCase().includes(search.toLowerCase())).slice(0, 30);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        style={{
          padding: '10px 14px', background: 'var(--bg3)', border: '1px solid var(--border)',
          borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ color: selected ? 'var(--text)' : 'var(--muted)', fontSize: 14 }}>
          {selected ? `👥 ${selected.name}` : '— Select a Group —'}
        </span>
        <span style={{ color: 'var(--muted)' }}>▾</span>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
          maxHeight: 240, overflowY: 'auto', marginTop: 4,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg2)' }}>
            <input
              className="form-control"
              style={{ fontSize: 13 }}
              placeholder="Search groups…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
              autoFocus
            />
          </div>
          {groups.length === 0 && (
            <div style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: 13 }}>
              ⚠️ No groups synced. Go to WhatsApp page → Connect → Sync Groups first.
            </div>
          )}
          {groups.length > 0 && filtered.length === 0 && (
            <div style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: 13 }}>No groups match "{search}"</div>
          )}
          {filtered.map(g => (
            <div
              key={g.group_jid}
              onClick={() => { onChange(g.group_jid); setOpen(false); setSearch(''); }}
              style={{
                padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                background: g.group_jid === value ? 'rgba(37,211,102,0.1)' : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (g.group_jid !== value) e.currentTarget.style.background = 'var(--bg3)'; }}
              onMouseLeave={e => { if (g.group_jid !== value) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>👥</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{g.participants_count} members</div>
              </div>
              {g.group_jid === value && <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MessagesPage() {
  const [messages, setMessages]       = useState([]);
  const [pagination, setPagination]   = useState({});
  const [loading, setLoading]         = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter]   = useState('');
  const [ackReadFilter, setAckReadFilter] = useState(false); // ← new
  const [page, setPage]               = useState(1);
  const [showModal, setShowModal]     = useState(false);
  const [isSendNow, setIsSendNow]     = useState(false);
  const [groups, setGroups]           = useState([]);
  const [contacts, setContacts]       = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [liveSocket, setLiveSocket]   = useState(false);

  // Form state
  const [msgType, setMsgType]           = useState('individual');
  const [selectedContacts, setSelectedContacts] = useState([]); // for individual
  const [selectedGroup, setSelectedGroup]       = useState(''); // for group
  const [messageBody, setMessageBody]   = useState('');
  const [scheduledAt, setScheduledAt]   = useState('');
  const [timezone, setTimezone]         = useState('Asia/Kolkata');
  const [recurrence, setRecurrence]     = useState('none'); // new
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(''); // new
  const [mediaFile, setMediaFile]       = useState(null);
  const [submitting, setSubmitting]     = useState(false);
  const fileInputRef = useRef();

  const user  = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');

  // ── Fetch messages ──────────────────────────────────────────────────────────
  async function fetchMessages() {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (statusFilter)  params.status   = statusFilter;
      if (typeFilter)    params.type     = typeFilter;
      if (ackReadFilter) params.ack_read = 'true';
      const { data } = await getMessages(params);
      setMessages(data.messages || []);
      setPagination(data.pagination || {});
    } catch { toast.error('Failed to load messages'); }
    finally  { setLoading(false); }
  }

  async function loadOptions() {
    setLoadingOptions(true);
    try {
      const [gRes, cRes] = await Promise.allSettled([getGroups(), getContacts()]);
      if (gRes.status === 'fulfilled') setGroups(gRes.value.data.groups || []);
      if (cRes.status === 'fulfilled') setContacts(cRes.value.data.contacts || []);
    } catch {}
    finally { setLoadingOptions(false); }
  }

  useEffect(() => { fetchMessages(); }, [page, statusFilter, typeFilter, ackReadFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket.IO real-time updates + 15s polling fallback ─────────────────────
  const fetchMessagesRef = useRef(fetchMessages);
  useEffect(() => { fetchMessagesRef.current = fetchMessages; });

  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      setLiveSocket(true);
      socket.emit('join', { userId: user.id });
    });
    socket.on('disconnect',    () => setLiveSocket(false));
    socket.on('connect_error', () => setLiveSocket(false));

    // A new message was sent by the scheduler → refresh the list
    socket.on('wa:message_sent', () => fetchMessagesRef.current());

    // A message failed → refresh so status updates
    socket.on('wa:message_failed', () => fetchMessagesRef.current());

    // ACK update → patch only the affected row in-place (no flicker)
    socket.on('wa:message_ack', (payload) => {
      const { messageId, ack } = payload || {};
      if (!messageId || ack == null) return;
      setMessages(prev =>
        prev.map(m => m.id === messageId ? { ...m, ack_status: ack } : m)
      );
    });

    // Fallback poll every 15s when socket updates may be missed
    const interval = setInterval(() => fetchMessagesRef.current(), 15000);

    return () => { socket.disconnect(); clearInterval(interval); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Open modal ──────────────────────────────────────────────────────────────
  function openModal(isNow) {
    setIsSendNow(isNow);
    setMsgType('individual');
    setSelectedContacts([]);
    setSelectedGroup('');
    setMessageBody('');
    setScheduledAt('');
    setTimezone('Asia/Kolkata');
    setRecurrence('none');
    setRecurrenceEndDate('');
    setMediaFile(null);
    loadOptions();
    setShowModal(true);
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();

    if (msgType === 'individual' && selectedContacts.length === 0) {
      return toast.error('Select at least one contact');
    }
    if (msgType === 'group' && !selectedGroup) {
      return toast.error('Select a group');
    }
    if (!isSendNow && !scheduledAt) {
      return toast.error('Schedule date & time is required');
    }
    if (!messageBody.trim() && !mediaFile) {
      return toast.error('Message body or media is required');
    }

    setSubmitting(true);
    try {
      // For individual: send one message per contact (backend supports one recipient at a time)
      const recipients = msgType === 'individual'
        ? selectedContacts.map(c => c.phone)  // backend adds @c.us — do NOT append it here
        : [selectedGroup];

      let successCount = 0;
      for (const recipient of recipients) {
        const fd = new FormData();
        fd.append('type', msgType);
        fd.append('recipient', recipient);
        if (messageBody.trim()) fd.append('message_body', messageBody);
        fd.append('user_timezone', timezone);
        if (!isSendNow) {
          fd.append('scheduled_at', scheduledAt);
          fd.append('recurrence', recurrence);
          if (recurrence !== 'none' && recurrenceEndDate) {
            fd.append('recurrence_end_date', recurrenceEndDate);
          }
        }
        if (mediaFile)  fd.append('media', mediaFile);

        if (isSendNow) {
          await sendNow(fd);
        } else {
          await createMessage(fd);
        }
        successCount++;
      }

      toast.success(isSendNow
        ? `Sent to ${successCount} recipient(s)!`
        : `Scheduled ${successCount} message(s)!`
      );
      setShowModal(false);
      fetchMessages();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this message?')) return;
    try {
      await deleteMessage(id);
      toast.success('Deleted');
      fetchMessages();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cannot delete');
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="section-header">
        <div>
          <div className="section-title">💬 Messages</div>
          <div className="section-desc">Schedule and send WhatsApp messages</div>
        </div>
        <div className="flex gap-2 items-center">
          <span style={{ fontSize: 12, color: liveSocket ? 'var(--accent)' : 'var(--muted)', marginRight: 4 }}>
            ● {liveSocket ? 'Live' : 'Polling'}
          </span>
          <button className="btn btn-secondary" onClick={() => openModal(true)}>⚡ Send Now</button>
          <button className="btn btn-primary"   onClick={() => openModal(false)}>+ Schedule</button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex gap-3 mb-6" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {[
            ['', 'All'],
            ['pending', 'Pending ⏳'],
            ['sent', 'Sent ✅'],
            ['failed', 'Failed ❌'],
          ].map(([val, lbl]) => (
            <button key={val}
              className={`tab ${statusFilter === val && !ackReadFilter ? 'active' : ''}`}
              onClick={() => { setStatusFilter(val); setAckReadFilter(false); setPage(1); }}>
              {lbl}
            </button>
          ))}
          <button
            className={`tab ${ackReadFilter ? 'active' : ''}`}
            onClick={() => { setAckReadFilter(r => !r); setStatusFilter(''); setPage(1); }}
            style={{ color: ackReadFilter ? '#38bdf8' : undefined }}>
            Read 👀
          </button>
        </div>
        <select className="form-control" style={{ width: 160 }}
          value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
          <option value="">All Types</option>
          <option value="individual">👤 Individual</option>
          <option value="group">👥 Group</option>
          <option value="status">📢 Status</option>
        </select>
      </div>

      {/* ── Table ── */}
      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state"><div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} /></div>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <p>No messages found. Schedule your first one!</p>
            </div>
          ) : (
            <table>
                <thead>
                  <tr>
                    <th>#</th><th>Recipient</th><th>Type</th><th>Message</th><th>Status</th><th>Receipt</th><th>Scheduled</th><th></th>
                  </tr>
                </thead>
              <tbody>
                {messages.map(m => (
                  <tr key={m.id}>
                    <td className="text-muted text-sm">{m.id}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.recipient_name || m.recipient || <span className="text-muted">Status Update</span>}
                    </td>
                    <td><span className="badge badge-user">{m.type}</span></td>
                    <td className="text-muted text-sm" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.media_type ? `📎 ${m.media_type} ` : ''}{m.message_body || '—'}
                    </td>
                    <td><span className={`badge badge-${m.status}`}>{m.status}</span></td>
                    <td>
                      {m.status === 'sent' ? (
                        m.ack_status >= 3
                          ? <span className="badge" style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8' }}>👀 Read</span>
                          : m.ack_status === 2
                            ? <span className="badge" style={{ background: 'rgba(37,211,102,0.1)', color: 'var(--accent)' }}>✅✅ Delivered</span>
                            : <span className="badge" style={{ background: 'rgba(100,116,139,0.1)', color: 'var(--muted)' }}>✅ Sent</span>
                      ) : <span className="text-muted text-sm">—</span>}
                    </td>
                    <td className="text-muted text-sm">
                      {new Date(m.scheduled_at).toLocaleString()}
                      {m.recurrence && m.recurrence !== 'none' && (
                        <div style={{ marginTop: 4 }}>
                          <span className="badge" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>
                            🔁 {m.recurrence}
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      {m.status === 'pending' && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(m.id)}>🗑</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between" style={{ padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
            <span className="text-muted text-sm">Page {pagination.page} of {pagination.pages} ({pagination.total} total)</span>
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <button className="btn btn-secondary btn-sm" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <div className="modal-header">
            <div className="modal-title">{isSendNow ? '⚡ Send Message Now' : '📅 Schedule Message'}</div>
            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

              {/* Type selector */}
              <div className="form-group">
                <label className="form-label">Message Type</label>
                <div className="tabs" style={{ marginBottom: 0 }}>
                  {[['individual','👤 Individual'],['group','👥 Group'],['status','📢 Status']].map(([val, lbl]) => (
                    <button
                      key={val} type="button"
                      className={`tab ${msgType === val ? 'active' : ''}`}
                      onClick={() => { setMsgType(val); setSelectedContacts([]); setSelectedGroup(''); }}
                    >{lbl}</button>
                  ))}
                </div>
              </div>

              {/* Recipient */}
              {msgType === 'individual' && (
                <div className="form-group">
                  <label className="form-label">
                    Contacts
                    {loadingOptions && <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2, marginLeft: 8 }} />}
                  </label>
                  <ContactPicker
                    contacts={contacts}
                    selected={selectedContacts}
                    onChange={setSelectedContacts}
                  />
                </div>
              )}

              {msgType === 'group' && (
                <div className="form-group">
                  <label className="form-label">
                    Group
                    {loadingOptions && <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2, marginLeft: 8 }} />}
                  </label>
                  <GroupPicker
                    groups={groups}
                    value={selectedGroup}
                    onChange={setSelectedGroup}
                  />
                  {groups.length === 0 && !loadingOptions && (
                    <p className="text-sm" style={{ color: 'var(--yellow)', marginTop: 6 }}>
                      ⚠️ No groups found. <a href="/whatsapp" style={{ color: 'var(--accent)' }}>Connect WhatsApp & Sync Groups first →</a>
                    </p>
                  )}
                </div>
              )}

              {/* Message */}
              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea
                  className="form-control"
                  placeholder="Type your message… (optional if sending media)"
                  value={messageBody}
                  onChange={e => setMessageBody(e.target.value)}
                  style={{ minHeight: 90 }}
                />
              </div>

              {/* Media */}
              <div className="form-group">
                <label className="form-label">Media <span className="text-muted" style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                <input
                  type="file" ref={fileInputRef} style={{ display: 'none' }}
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                  onChange={e => setMediaFile(e.target.files[0])}
                />
                <div className="flex gap-2 items-center">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current.click()}>
                    📎 Attach File
                  </button>
                  {mediaFile && <span className="text-sm text-muted" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mediaFile.name}</span>}
                  {mediaFile && <button type="button" className="btn btn-danger btn-sm btn-icon" onClick={() => setMediaFile(null)}>✕</button>}
                </div>
              </div>

              {/* Schedule */}
              {!isSendNow && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Date & Time</label>
                      <input
                        type="datetime-local" className="form-control"
                        value={scheduledAt}
                        onChange={e => setScheduledAt(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Timezone</label>
                      <select className="form-control" value={timezone} onChange={e => setTimezone(e.target.value)}>
                        {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-row" style={{ marginTop: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Repeat Message?</label>
                      <select className="form-control" value={recurrence} onChange={e => { setRecurrence(e.target.value); if (e.target.value === 'none') setRecurrenceEndDate(''); }}>
                        <option value="none">Does not repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    {recurrence !== 'none' && (
                      <div className="form-group">
                        <label className="form-label">End Repeat On <span className="text-muted text-sm" style={{ fontWeight: 400 }}>(optional)</span></label>
                        <input
                          type="datetime-local" className="form-control"
                          value={recurrenceEndDate}
                          onChange={e => setRecurrenceEndDate(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Summary */}
              {(selectedContacts.length > 1) && (
                <div style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                  ✅ Will send <strong>{selectedContacts.length} separate messages</strong> — one per recipient.
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? <span className="spinner" /> : isSendNow ? '⚡' : '📅'}
                {' '}{isSendNow ? `Send${selectedContacts.length > 1 ? ` to ${selectedContacts.length}` : ''}` : 'Schedule'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
