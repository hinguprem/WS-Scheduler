const { Client, RemoteAuth } = require('whatsapp-web.js');
const qrcode   = require('qrcode');
const https    = require('https');
const http     = require('http');
const User     = require('../models/User');
const WAGroup  = require('../models/WAGroup');
const WAContact = require('../models/WAContact');
const WASession = require('../models/WASession');
const MongoDBStore = require('../config/waStore');
const { sendWADisconnectAlert } = require('./emailService');

// Optional sharp for WebP compression
let sharp = null;
try { sharp = require('sharp'); } catch {
  console.warn('[WA] sharp not installed — pics stored as raw JPEG. Run: npm install sharp');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchAndCompressImage(url) {
  if (!url) return null;
  let buffer;
  try {
    buffer = await new Promise((resolve, reject) => {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { timeout: 12000, headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://web.whatsapp.com/',
      }}, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          res.resume();
          return fetchAndCompressImage(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end',  () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      });
      req.on('error',   reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  } catch (err) {
    console.warn(`[PicFetch] Failed: ${err.message}`);
    return null;
  }
  if (!buffer || buffer.length < 100) return null;
  if (sharp) {
    try {
      const webp = await sharp(buffer).resize(64, 64, { fit: 'cover' }).webp({ quality: 75 }).toBuffer();
      return `data:image/webp;base64,${webp.toString('base64')}`;
    } catch { /* fall through */ }
  }
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

async function getPicUrlForJid(waClient, jid) {
  try {
    if (waClient?.pupPage && !waClient.pupPage.isClosed()) {
      const url = await waClient.pupPage.evaluate(async (id) => {
        try {
          const wid = window.Store.WidFactory.createWid(id);
          const r   = await window.Store.ProfilePic.profilePicFind(wid);
          if (r?.eurl) return r.eurl;
          if (r?.img)  return r.img;
          const c = window.Store.Contact.get(id);
          if (c?.profilePicThumbObj?.eurl) return c.profilePicThumbObj.eurl;
          return null;
        } catch { return null; }
      }, jid);
      if (url) return url;
    }
  } catch { /* ignore */ }
  try { return await waClient.getProfilePicUrl(jid); } catch { return null; }
}

// ─── Per-user client state ────────────────────────────────────────────────────
const userClients = new Map();
let io = null;

function setIO(socketIO) { io = socketIO; }

function getState(userId) {
  const key = userId.toString();
  if (!userClients.has(key)) userClients.set(key, { client: null, status: 'disconnected', qrBase64: null });
  return userClients.get(key);
}

function getStatus(userId)  { return getState(userId).status; }
function getQR(userId)      { return getState(userId).qrBase64; }
function getClient(userId)  { return getState(userId).client; }

function getAllStatuses() {
  const result = {};
  for (const [uid, state] of userClients.entries()) {
    result[uid] = { status: state.status, hasQR: !!state.qrBase64 };
  }
  return result;
}

function emitToUser(userId, event, data) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, { ...data, userId });
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function getUserEmail(userId) {
  try {
    const user = await User.findById(userId).select('email username');
    return user ? { email: user.email, username: user.username } : null;
  } catch { return null; }
}

// ─── ACK handler ──────────────────────────────────────────────────────────────
async function handleMessageAck(userId, message, ack) {
  try {
    const ScheduledMessage = require('../models/ScheduledMessage');
    const waMessageId = message.id?._serialized || message.id?.id;
    if (!waMessageId) return;

    const msg = await ScheduledMessage.findOne({ wa_message_id: waMessageId, user_id: userId });
    if (!msg) return;

    if (msg.type === 'group') {
      await ScheduledMessage.findByIdAndUpdate(msg._id, { $max: { ack_status: ack } });
    } else {
      await ScheduledMessage.findByIdAndUpdate(msg._id, { ack_status: ack });
    }

    emitToUser(userId, 'wa:message_ack', { messageId: msg._id.toString(), ack });
  } catch (err) {
    console.error(`[WA:${userId}] handleMessageAck error:`, err.message);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initializeClient(userId) {
  const state = getState(userId);
  if (state.client) { console.log(`[WA:${userId}] Client already initialized`); return; }

  state.status = 'initializing';
  emitToUser(userId, 'wa:status', { status: 'initializing', qr: null });

  const store    = new MongoDBStore(userId);
  const waClient = new Client({
    authStrategy: new RemoteAuth({
      clientId: `user-${userId}`,
      store,
      backupSyncIntervalMs: 60000,
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas',
        '--no-first-run', '--no-zygote', '--disable-gpu',
      ],
    },
  });

  state.client = waClient;

  waClient.on('qr', async (qr) => {
    try {
      state.qrBase64 = await qrcode.toDataURL(qr);
      state.status   = 'qr_ready';
      emitToUser(userId, 'wa:qr', { qr: state.qrBase64 });
      console.log(`[WA:${userId}] QR code generated`);
    } catch (err) { console.error(`[WA:${userId}] QR error:`, err.message); }
  });

  waClient.on('ready', () => {
    state.status   = 'connected';
    state.qrBase64 = null;
    emitToUser(userId, 'wa:ready', {});
    console.log(`[WA:${userId}] Client ready`);

    setTimeout(async () => {
      try {
        const clientId = `user-${userId}`;
        const tempZip  = `RemoteAuth-${clientId}.zip`;
        await store.save({ session: tempZip });
        console.log(`[WA:${userId}] Post-ready session save OK`);
      } catch (e) { console.warn(`[WA:${userId}] Post-ready save skipped:`, e.message); }
    }, 30000);
  });

  waClient.on('authenticated', () => {
    console.log(`[WA:${userId}] Authenticated`);
    setTimeout(async () => {
      try {
        const clientId = `user-${userId}`;
        const tempZip  = `RemoteAuth-${clientId}.zip`;
        await store.save({ session: tempZip });
        console.log(`[WA:${userId}] Post-auth session save OK`);
      } catch (e) { console.warn(`[WA:${userId}] Post-auth save skipped:`, e.message); }
    }, 15000);
  });

  waClient.on('auth_failure', async (msg) => {
    state.status = 'disconnected'; state.client = null;
    emitToUser(userId, 'wa:disconnected', { reason: msg });
    console.error(`[WA:${userId}] Auth failure:`, msg);
    const userInfo = await getUserEmail(userId);
    if (userInfo) sendWADisconnectAlert(userInfo.email, userInfo.username, `Auth failure: ${msg}`).catch(() => {});
  });

  waClient.on('disconnected', async (reason) => {
    state.status = 'disconnected'; state.qrBase64 = null; state.client = null;
    emitToUser(userId, 'wa:disconnected', { reason });
    console.log(`[WA:${userId}] Disconnected:`, reason);

    const isManual = reason === 'Manual disconnect' || reason === 'LOGOUT';
    if (!isManual) {
      const userInfo = await getUserEmail(userId);
      if (userInfo) sendWADisconnectAlert(userInfo.email, userInfo.username, reason).catch(() => {});
      console.log(`[WA:${userId}] Auto-reconnect in 10s…`);
      setTimeout(() => {
        autoReconnectIfSession(userId).catch(err =>
          console.error(`[WA:${userId}] Post-disconnect reconnect error:`, err.message)
        );
      }, 10000);
    }
  });

  waClient.on('remote_session_saved', () => { console.log(`[WA:${userId}] Remote session saved`); });
  waClient.on('message_ack', (message, ack) => {
    if (!message.fromMe) return;
    handleMessageAck(userId, message, ack).catch(() => {});
  });
  waClient.on('error', (err) => { console.error(`[WA:${userId}] Client error:`, err?.message || err); });

  await waClient.initialize();
  console.log(`[WA:${userId}] Initialization started`);
}

// ─── Session helpers ──────────────────────────────────────────────────────────
async function hasStoredSession(userId) {
  try {
    const doc = await WASession.findOne({ user_id: userId });
    return !!doc;
  } catch { return false; }
}

async function autoReconnectIfSession(userId) {
  const state = getState(userId);
  if (state.client) return;

  let sessionDoc = null;
  try {
    sessionDoc = await WASession.findOne({ user_id: userId });
    if (!sessionDoc) return;
  } catch { return; }

  const nodePath = require('path');
  const fs       = require('fs');
  const absPath  = nodePath.resolve(__dirname, '../../uploads', sessionDoc.session_file);
  if (!fs.existsSync(absPath)) {
    console.warn(`[WA:${userId}] Session file missing — clearing stale DB doc`);
    WASession.deleteOne({ user_id: userId }).catch(() => {});
    return;
  }

  console.log(`[WA:${userId}] Stored session found — auto-reconnecting…`);
  initializeClient(userId).catch(err =>
    console.error(`[WA:${userId}] Auto-reconnect error:`, err.message)
  );
}

async function reconnectAllSessionsOnStartup() {
  try {
    const userIds = await WASession.distinct('user_id');
    if (userIds.length === 0) {
      console.log('[WA] No stored sessions — nothing to reconnect');
      return;
    }
    console.log(`[WA] Startup: reconnecting ${userIds.length} session(s)…`);
    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i].toString();
      setTimeout(() => {
        autoReconnectIfSession(userId).catch(err =>
          console.error(`[WA:${userId}] Startup reconnect error:`, err.message)
        );
      }, i * 3000);
    }
  } catch (err) {
    console.error('[WA] reconnectAllSessionsOnStartup failed:', err.message);
  }
}

// ─── Disconnect ───────────────────────────────────────────────────────────────
async function disconnectClient(userId) {
  const state = getState(userId);
  if (!state.client) return;
  try { await state.client.destroy(); } catch (err) { console.error(`[WA:${userId}] Destroy error:`, err.message); }
  state.client = null; state.status = 'disconnected'; state.qrBase64 = null;
  emitToUser(userId, 'wa:disconnected', { reason: 'Manual disconnect' });
}

// ─── Sync groups ──────────────────────────────────────────────────────────────
async function syncGroups(userId) {
  const state = getState(userId);
  if (!state.client || state.status !== 'connected') throw new Error('WhatsApp not connected');

  const chats  = await state.client.getChats();
  const groups = chats.filter(c => c.isGroup);
  console.log(`[WA:${userId}] Syncing ${groups.length} groups…`);

  let myWid = null;
  try { myWid = state.client.info.wid.user; } catch { /* ignore */ }

  let picCount = 0;
  for (let i = 0; i < groups.length; i++) {
    const group   = groups[i];
    const picUrl  = await getPicUrlForJid(state.client, group.id._serialized);
    const picData = await fetchAndCompressImage(picUrl);
    if (picData) picCount++;

    const memberPhones = (group.participants || [])
      .filter(p => !p.isMe && (!myWid || p.id.user !== myWid))
      .map(p => p.id.user);

    await WAGroup.findOneAndUpdate(
      { user_id: userId, group_jid: group.id._serialized },
      {
        $set: {
          name: group.name,
          participants_count: group.participants?.length || 0,
          profile_pic_url: picData,
          members: memberPhones,
          last_synced: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    if ((i + 1) % 5 === 0) await sleep(200);
  }

  console.log(`[WA:${userId}] Synced ${groups.length} groups (${picCount} with pics)`);
  return groups.length;
}

// ─── Sync contacts ────────────────────────────────────────────────────────────
async function syncContacts(userId) {
  const state = getState(userId);
  if (!state.client || state.status !== 'connected') throw new Error('WhatsApp not connected');

  const contacts     = await state.client.getContacts();
  const realContacts = contacts.filter(c =>
    c.id?.server === 'c.us' && !c.isMe && c.isMyContact === true && (c.name || c.pushname || c.shortName)
  );

  console.log(`[WA:${userId}] Syncing ${realContacts.length} contacts…`);

  const bulkOps = realContacts.map(c => ({
    updateOne: {
      filter: { user_id: userId, phone: c.id.user },
      update: {
        $set: {
          name: c.name || c.pushname || c.shortName || c.id.user,
          last_synced: new Date(),
        },
      },
      upsert: true,
    },
  }));

  if (bulkOps.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < bulkOps.length; i += CHUNK) {
      await WAContact.bulkWrite(bulkOps.slice(i, i + CHUNK), { ordered: false });
    }
  }

  console.log(`[WA:${userId}] Sync complete — ${realContacts.length} contacts`);
  return realContacts.length;
}

module.exports = {
  setIO, getStatus, getQR, getClient, getAllStatuses,
  initializeClient, disconnectClient,
  hasStoredSession, autoReconnectIfSession, reconnectAllSessionsOnStartup,
  syncGroups, syncContacts,
  emitToUser,  // exported so schedulerService can use it without circular import
};