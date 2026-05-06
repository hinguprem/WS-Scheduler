import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getContacts } from '../api.js';

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading]  = useState(true);
  const [syncing, setSyncing]  = useState(false);
  const [search,  setSearch]   = useState('');

  async function loadContacts(sync = false) {
    if (sync) setSyncing(true); else setLoading(true);
    try {
      const { data } = await getContacts(sync);
      setContacts(data.contacts || []);
      if (sync) toast.success(`Synced ${data.contacts?.length || 0} contacts`);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to load contacts'); }
    finally { setLoading(false); setSyncing(false); }
  }

  useEffect(() => { loadContacts(); }, []);

  const filtered = contacts.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <div className="section-title">👥 Contacts ({contacts.length})</div>
          <div className="section-desc">Your synced WhatsApp contacts</div>
        </div>
        <button className="btn btn-primary" onClick={() => loadContacts(true)} disabled={syncing}>
          {syncing ? <span className="spinner" /> : '🔄'} Sync Contacts
        </button>
      </div>

      {/* Search */}
      <div className="form-group" style={{ maxWidth: 360 }}>
        <input className="form-control" placeholder="🔍 Search contacts…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state"><div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <p>{contacts.length === 0
              ? 'No contacts synced yet. Connect WhatsApp and click "Sync Contacts".'
              : 'No contacts match your search.'}
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Last Synced</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.phone}>
                    <td>
                      <div className="flex items-center gap-3">
                        {c.profile_pic_url
                          ? <img src={c.profile_pic_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} onError={e => e.target.style.display='none'} />
                          : (
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,var(--blue),var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#fff', flexShrink: 0 }}>
                              {(c.name || c.phone || '?')[0].toUpperCase()}
                            </div>
                          )
                        }
                        <span style={{ fontWeight: 600 }}>{c.name || <span className="text-muted">Unknown</span>}</span>
                      </div>
                    </td>
                    <td className="text-muted" style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.phone}</td>
                    <td className="text-muted text-sm">{c.last_synced ? new Date(c.last_synced).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
