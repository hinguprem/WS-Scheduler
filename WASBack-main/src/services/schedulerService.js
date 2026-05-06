const cron            = require('node-cron');
const path            = require('path');
const moment          = require('moment-timezone');
const ScheduledMessage = require('../models/ScheduledMessage');
const User            = require('../models/User');
const waService       = require('./whatsappService');
const { sendScheduledMessageFailedAlert, sendWADisconnectAlert } = require('./emailService');

// ─── Use waService.emitToUser directly — eliminates the circular require('../app') ──
function emitToUser(userId, event, data) {
  waService.emitToUser(userId, event, data);
}

let schedulerTask = null;

async function getUserInfo(userId) {
  try {
    const user = await User.findById(userId).select('email username');
    return user ? { email: user.email, username: user.username } : null;
  } catch { return null; }
}

// ─── Puppeteer health check ───────────────────────────────────────────────────
async function isPupPageAlive(waClient) {
  try {
    if (!waClient?.pupPage || waClient.pupPage.isClosed()) return false;
    await waClient.pupPage.evaluate(() => true);
    return true;
  } catch { return false; }
}

async function safeWACall(fn) {
  try { return await fn(); } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes('detached Frame') || msg.includes('Execution context was destroyed')) {
      throw new Error('WA_DETACHED_FRAME: WhatsApp page refreshed mid-send. Will retry next cycle.');
    }
    throw err;
  }
}

// ─── Core send logic ──────────────────────────────────────────────────────────
async function sendMessage(waClient, msg) {
  const { MessageMedia } = require('whatsapp-web.js');

  if (msg.type === 'status') {
    await safeWACall(() =>
      waClient.pupPage.evaluate(async () => {
        try {
          const wid = window.Store.WidFactory.createWid('status@broadcast');
          if (!window.Store.Chat.get(wid)) await window.Store.FindOrCreateChat.findOrCreateLatestChat(wid);
        } catch (_) { /* ignore */ }
      })
    ).catch(() => {});

    let result;
    if (msg.media_path) {
      const media = MessageMedia.fromFilePath(path.resolve(__dirname, '../../uploads', msg.media_path));
      result = await safeWACall(() => waClient.sendMessage('status@broadcast', media, { caption: msg.message_body || '' }));
    } else {
      result = await safeWACall(() => waClient.sendMessage('status@broadcast', msg.message_body || ''));
    }
    if (!result) throw new Error('Status post returned null');
    return null;
  }

  const recipientJid = msg.type === 'group'
    ? msg.recipient
    : `${msg.recipient.replace(/\D/g, '')}@c.us`;

  let result;
  if (msg.media_path) {
    const media = MessageMedia.fromFilePath(path.resolve(__dirname, '../../uploads', msg.media_path));
    result = await safeWACall(() =>
      waClient.sendMessage(recipientJid, media, {
        caption: msg.message_body || '',
        sendMediaAsDocument: msg.media_type === 'document',
      })
    );
  } else {
    result = await safeWACall(() => waClient.sendMessage(recipientJid, msg.message_body));
  }
  return result || null;
}

async function getGroupParticipantCount(waClient, groupJid) {
  try {
    const chat = await waClient.getChatById(groupJid);
    return chat?.participants?.length || 0;
  } catch { return 0; }
}

const _disconnectEmailedThisRun = new Set();

// ─── Main scheduler ───────────────────────────────────────────────────────────
async function processMessages() {
  _disconnectEmailedThisRun.clear();

  // Auto-fail messages 30+ min past scheduled time
  try {
    const cutoff  = new Date(Date.now() - 30 * 60 * 1000);
    const expired = await ScheduledMessage.find({ status: 'pending', scheduled_at: { $lte: cutoff } });
    if (expired.length > 0) {
      const errorMsg = 'WhatsApp was not connected at scheduled time - message expired after 30 min';
      await ScheduledMessage.updateMany(
        { status: 'pending', scheduled_at: { $lte: cutoff } },
        { $set: { status: 'failed', error_message: errorMsg } }
      );
      console.log(`[Scheduler] Auto-failed ${expired.length} stale message(s)`);

      const byUser = {};
      for (const row of expired) {
        const uid = row.user_id.toString();
        if (!byUser[uid]) byUser[uid] = [];
        byUser[uid].push(row);
      }
      for (const [userId, msgs] of Object.entries(byUser)) {
        emitToUser(userId, 'wa:message_failed', { messageId: null, error: errorMsg, bulk: true });
        const userInfo = await getUserInfo(userId);
        if (userInfo) {
          for (const msg of msgs) {
            await sendScheduledMessageFailedAlert(userInfo.email, userInfo.username, {
              id: msg._id.toString(), recipient: msg.recipient, type: msg.type,
              scheduled_at: msg.scheduled_at, error_message: errorMsg,
            }).catch(() => {});
          }
        }
      }
    }
  } catch (expireErr) {
    console.error('[Scheduler] Stale expiry check failed:', expireErr.message);
  }

  // Fetch all messages due now
  let messages;
  try {
    messages = await ScheduledMessage.find({ status: 'pending', scheduled_at: { $lte: new Date() } })
      .sort({ user_id: 1, scheduled_at: 1 });
  } catch (err) {
    console.error('[Scheduler] DB query error:', err.message);
    return;
  }

  if (messages.length === 0) {
    console.log('[Scheduler] No pending messages due at', new Date().toISOString());
    return;
  }

  const byUser = {};
  for (const msg of messages) {
    const uid = msg.user_id.toString();
    if (!byUser[uid]) byUser[uid] = [];
    byUser[uid].push(msg);
  }

  console.log(`[Scheduler] Processing ${messages.length} message(s) for ${Object.keys(byUser).length} user(s)`);

  for (const [userId, userMessages] of Object.entries(byUser)) {
    const waClient = waService.getClient(userId);
    const waStatus = waService.getStatus(userId);

    if (!waClient || waStatus !== 'connected') {
      console.log(`[Scheduler] User ${userId}: WA not connected — skipping ${userMessages.length} message(s)`);
      for (const msg of userMessages) {
        await ScheduledMessage.findByIdAndUpdate(msg._id, {
          $set: { error_message: `[Skipped: WA disconnected at ${new Date().toISOString()}] ` }
        }).catch(() => {});
      }
      if (!_disconnectEmailedThisRun.has(userId)) {
        _disconnectEmailedThisRun.add(userId);
        const userInfo = await getUserInfo(userId);
        if (userInfo) {
          const reason = `WhatsApp is disconnected. ${userMessages.length} scheduled message(s) were skipped.`;
          sendWADisconnectAlert(userInfo.email, userInfo.username, reason).catch(() => {});
        }
      }
      continue;
    }

    const pageAlive = await isPupPageAlive(waClient);
    if (!pageAlive) { console.warn(`[Scheduler] User ${userId}: Puppeteer detached — skipping run`); continue; }

    let userInfo = null;

    for (const msg of userMessages) {
      const stillAlive = await isPupPageAlive(waClient);
      if (!stillAlive) { console.warn(`[Scheduler] User ${userId}: Page detached mid-loop`); break; }

      try {
        console.log(`[Scheduler] User ${userId}: Sending msg id=${msg._id} type=${msg.type}`);
        const waResult = await sendMessage(waClient, msg);
        const waMessageId    = waResult?.id?._serialized || waResult?.id?.id || null;
        let totalRecipients  = 0;
        if (msg.type === 'group' && msg.recipient) {
          const count = await getGroupParticipantCount(waClient, msg.recipient);
          totalRecipients = Math.max(0, count - 1);
        }

        await ScheduledMessage.findByIdAndUpdate(msg._id, {
          $set: { status: 'sent', sent_at: new Date(), error_message: null,
                  wa_message_id: waMessageId, ack_status: 1, total_recipients: totalRecipients },
        });
        console.log(`[Scheduler] User ${userId}: Message ${msg._id} sent`);
        emitToUser(userId, 'wa:message_sent', {
          messageId: msg._id.toString(), sentAt: new Date().toISOString(), waMessageId, totalRecipients,
        });

        // Handle recurrence
        if (msg.recurrence && msg.recurrence !== 'none') {
          const tz = msg.user_timezone || 'UTC';
          const nextTime = moment.tz(msg.scheduled_at, 'UTC').tz(tz);
          if (msg.recurrence === 'daily')   nextTime.add(1, 'days');
          if (msg.recurrence === 'weekly')  nextTime.add(1, 'weeks');
          if (msg.recurrence === 'monthly') nextTime.add(1, 'months');

          const nextUtc = nextTime.utc().toDate();
          let shouldCreate = true;
          if (msg.recurrence_end_date && moment.utc(nextUtc).isAfter(moment.utc(msg.recurrence_end_date))) {
            shouldCreate = false;
          }
          if (shouldCreate) {
            await ScheduledMessage.create({
              user_id: msg.user_id, recipient: msg.recipient,
              message_body: msg.message_body, media_path: msg.media_path,
              media_type: msg.media_type, media_filename: msg.media_filename,
              type: msg.type, scheduled_at: nextUtc, user_timezone: msg.user_timezone,
              status: 'pending', recurrence: msg.recurrence,
              recurrence_end_date: msg.recurrence_end_date || null,
              parent_message_id: msg._id,
            });
            console.log(`[Scheduler] Created next occurrence for msg ${msg._id} at ${nextUtc}`);
            emitToUser(userId, 'wa:message_sent', { bulk: true });
          }
        }
      } catch (err) {
        const errMsg = String(err?.message || err || 'Unknown error').substring(0, 500);
        if (errMsg.startsWith('WA_DETACHED_FRAME')) {
          console.warn(`[Scheduler] User ${userId}: Message ${msg._id} detached — will retry`);
          break;
        }
        await ScheduledMessage.findByIdAndUpdate(msg._id, { $set: { status: 'failed', error_message: errMsg } });
        console.error(`[Scheduler] User ${userId}: Message ${msg._id} failed:`, errMsg);
        emitToUser(userId, 'wa:message_failed', { messageId: msg._id.toString(), error: errMsg });

        if (!userInfo) userInfo = await getUserInfo(userId);
        if (userInfo) {
          sendScheduledMessageFailedAlert(userInfo.email, userInfo.username, {
            id: msg._id.toString(), recipient: msg.recipient, type: msg.type,
            scheduled_at: msg.scheduled_at, error_message: errMsg,
          }).catch(() => {});
        }
      }
    }
  }
}

function startScheduler() {
  if (schedulerTask) { console.log('[Scheduler] Already running'); return; }
  schedulerTask = cron.schedule('* * * * *', async () => { await processMessages(); });
  setTimeout(() => {
    const second = cron.schedule('* * * * *', async () => { await processMessages(); });
    schedulerTask._secondTask = second;
  }, 30000);
  console.log('[Scheduler] Started — running every 30 seconds');
}

function stopScheduler() {
  if (schedulerTask) { schedulerTask.stop(); schedulerTask = null; console.log('[Scheduler] Stopped'); }
}

module.exports = { startScheduler, stopScheduler, processMessages, sendMessage };