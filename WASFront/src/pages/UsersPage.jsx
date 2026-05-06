import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { listUsers, createUser, deleteUser, changePassword } from '../api.js';

function Modal({ onClose, children }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">{children}</div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [showPwd, setShowPwd]   = useState(null);
  const [form, setForm]         = useState({ username: '', email: '', password: '', role: 'user', timezone: 'Asia/Kolkata' });
  const [pwdForm, setPwdForm]   = useState({ password: '', confirm: '' });
  const [submitting, setSubmitting] = useState(false);
  const me = JSON.parse(localStorage.getItem('user') || '{}');

  async function load() {
    setLoading(true);
    try {
      const { data } = await listUsers();
      setUsers(data.users || data || []);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.username || !form.email || !form.password) return toast.error('Fill all required fields');
    setSubmitting(true);
    try {
      await createUser(form);
      toast.success('User created!');
      setShowAdd(false);
      setForm({ username: '', email: '', password: '', role: 'user', timezone: 'Asia/Kolkata' });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to create user'); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(user) {
    if (user.id === me.id) return toast.error("You can't delete your own account");
    if (!confirm(`Delete user ${user.username}?`)) return;
    try { await deleteUser(user.id); toast.success('Deleted'); load(); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  }

  async function handleChangePwd(e) {
    e.preventDefault();
    if (!pwdForm.password || pwdForm.password !== pwdForm.confirm) return toast.error('Passwords must match');
    setSubmitting(true);
    try {
      await changePassword(showPwd.id, { new_password: pwdForm.password });
      toast.success('Password changed!');
      setShowPwd(null);
      setPwdForm({ password: '', confirm: '' });
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <div className="section-title">🛡️ Users ({users.length})</div>
          <div className="section-desc">Manage user accounts</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add User</button>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state"><div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} /></div>
        ) : users.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">👤</div><p>No users yet.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>User</th><th>Email</th><th>Role</th><th>Timezone</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,var(--blue),var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#fff', flexShrink: 0 }}>
                          {(u.username || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{u.username}</div>
                          {u.id === me.id && <div className="text-muted text-sm">You</div>}
                        </div>
                      </div>
                    </td>
                    <td className="text-muted text-sm">{u.email}</td>
                    <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                    <td className="text-muted text-sm">{u.timezone || '—'}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary btn-sm" onClick={() => { setShowPwd(u); setPwdForm({ password: '', confirm: '' }); }}>🔑 Pwd</button>
                        {u.id !== me.id && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u)}>🗑</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add user Modal */}
      {showAdd && (
        <Modal onClose={() => setShowAdd(false)}>
          <div className="modal-header">
            <div className="modal-title">➕ Add New User</div>
            <button className="modal-close" onClick={() => setShowAdd(false)}>✕</button>
          </div>
          <form onSubmit={handleCreate}>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Username *</label>
                  <input className="form-control" placeholder="john_doe" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input type="email" className="form-control" placeholder="john@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <input type="password" className="form-control" placeholder="••••••••" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-control" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Timezone</label>
                <select className="form-control" value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}>
                  {['Asia/Kolkata','UTC','America/New_York','America/Los_Angeles','Europe/London','Asia/Dubai','Asia/Singapore'].map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? <span className="spinner" /> : '➕'} Create User
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Change password Modal */}
      {showPwd && (
        <Modal onClose={() => setShowPwd(null)}>
          <div className="modal-header">
            <div className="modal-title">🔑 Change Password — {showPwd.username}</div>
            <button className="modal-close" onClick={() => setShowPwd(null)}>✕</button>
          </div>
          <form onSubmit={handleChangePwd}>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input type="password" className="form-control" placeholder="New password" value={pwdForm.password} onChange={e => setPwdForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input type="password" className="form-control" placeholder="Confirm password" value={pwdForm.confirm} onChange={e => setPwdForm(f => ({ ...f, confirm: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowPwd(null)}>Cancel</button>
              <button type="submit" className="btn btn-blue" disabled={submitting}>
                {submitting ? <span className="spinner" /> : '🔑'} Update Password
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
