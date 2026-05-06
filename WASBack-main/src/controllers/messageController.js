const moment          = require('moment-timezone');
const ScheduledMessage = require('../models/ScheduledMessage');
const WAGroup          = require('../models/WAGroup');
const WAContact        = require('../models/WAContact');
const { getMediaType } = require('../middleware/upload');
const { processMessages, sendMessage } = require('../services/schedulerService');
const { getClient, getStatus } = require('../services/whatsappService');

// ─── Helper: enrich messages with recipient_name ──────────────────────────────
async function enrichMessages(messages, userId) {
  const groupJids = messages.filter(m => m.type === 'group' && m.recipient).map(m => m.recipient);
  const phones    = messages.filter(m => m.type === 'individual' && m.recipient).map(m => m.recipient);

  const [groups, contacts] = await Promise.all([
    groupJids.length ? WAGroup.find({ user_id: userId, group_jid: { $in: groupJids } }).select('group_jid name') : [],
    phones.length    ? WAContact.find({ user_id: userId, phone: { $in: phones } }).select('phone name') : [],
  ]);

  const groupMap   = Object.fromEntries(groups.map(g => [g.group_jid, g.name]));
  const contactMap = Object.fromEntries(contacts.map(c => [c.phone, c.name]));

  return messages.map(m => {
    const obj = m.toJSON();
    if (m.type === 'group')      obj.recipient_name = groupMap[m.recipient]   || m.recipient || null;
    if (m.type === 'individual') obj.recipient_name = contactMap[m.recipient] || m.recipient || null;
    return obj;
  });
}

async function listMessages(req, res) {
  try {
    const { status, type, ack_read, page = 1, limit = 20 } = req.query;
    const userId = req.user.id;
    const skip   = (parseInt(page) - 1) * parseInt(limit);

    const filter = { user_id: userId };
    if (status) filter.status = status;
    if (type && ['individual', 'group', 'status'].includes(type)) filter.type = type;
    if (ack_read === 'true') filter.ack_status = { $gte: 3 };

    const [messages, total] = await Promise.all([
      ScheduledMessage.find(filter).sort({ scheduled_at: -1 }).skip(skip).limit(parseInt(limit)),
      ScheduledMessage.countDocuments(filter),
    ]);

    const enriched = await enrichMessages(messages, userId);

    // Per-type counts for the active status tab
    let typeCounts = { individual: 0, group: 0, status: 0 };
    if (status) {
      const agg = await ScheduledMessage.aggregate([
        { $match: { user_id: require('mongoose').Types.ObjectId.createFromHexString(userId), status } },
        { $group: { _id: '$type', cnt: { $sum: 1 } } },
      ]);
      agg.forEach(r => { typeCounts[r._id] = r.cnt; });
    }

    res.json({
      messages: enriched,
      pagination: {
        total,
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      typeCounts,
    });
  } catch (err) {
    console.error('[listMessages]', err);
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

async function createMessage(req, res) {
  try {
    const { recipient, message_body, type, scheduled_at, user_timezone, recurrence, recurrence_end_date } = req.body;

    if (!type || !['individual', 'group', 'status'].includes(type)) {
      return res.status(400).json({ message: 'Invalid type. Must be individual, group, or status.' });
    }
    if (type !== 'status' && !recipient) {
      return res.status(400).json({ message: 'recipient is required for individual/group messages' });
    }
    if (!scheduled_at) return res.status(400).json({ message: 'scheduled_at is required' });

    const validRecurrence = ['none', 'daily', 'weekly', 'monthly'];
    const rec = validRecurrence.includes(recurrence) ? recurrence : 'none';
    const tz  = user_timezone || req.user.timezone || process.env.DEFAULT_TIMEZONE;
    const scheduledUtc = moment.tz(scheduled_at, tz).utc().toDate();

    if (moment.utc(scheduledUtc).isBefore(moment.utc())) {
      return res.status(400).json({ message: 'scheduled_at must be in the future' });
    }

    let recEndUtc = null;
    if (rec !== 'none' && recurrence_end_date) {
      recEndUtc = moment.tz(recurrence_end_date, tz).utc().toDate();
    }

    let media_path = null, media_type = null, media_filename = null;
    if (req.file) {
      media_path     = req.file.filename;
      media_type     = getMediaType(req.file.mimetype);
      media_filename = req.file.originalname;
    }

    const msg = await ScheduledMessage.create({
      user_id: req.user.id, recipient: recipient || null,
      message_body: message_body || null, media_path, media_type, media_filename,
      type, scheduled_at: scheduledUtc, user_timezone: tz,
      status: 'pending', recurrence: rec, recurrence_end_date: recEndUtc,
    });

    res.status(201).json({ message: 'Scheduled successfully', id: msg._id.toString() });
  } catch (err) {
    console.error('[createMessage]', err);
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

async function updateMessage(req, res) {
  try {
    const { id } = req.params;
    const { recipient, message_body, scheduled_at, user_timezone, recurrence, recurrence_end_date } = req.body;

    const msg = await ScheduledMessage.findById(id);
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    if (req.user.role !== 'admin' && msg.user_id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (msg.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending messages can be edited' });
    }

    const tz = user_timezone || msg.user_timezone;
    const update = {};
    if (recipient !== undefined)    update.recipient     = recipient;
    if (message_body !== undefined) update.message_body  = message_body;
    if (user_timezone)              update.user_timezone = user_timezone;
    if (scheduled_at)               update.scheduled_at  = moment.tz(scheduled_at, tz).utc().toDate();
    if (recurrence !== undefined) {
      const validRec = ['none','daily','weekly','monthly'];
      update.recurrence = validRec.includes(recurrence) ? recurrence : 'none';
    }
    if (recurrence_end_date !== undefined) {
      update.recurrence_end_date = recurrence_end_date
        ? moment.tz(recurrence_end_date, tz).utc().toDate() : null;
    }

    if (!Object.keys(update).length) return res.status(400).json({ message: 'Nothing to update' });
    await ScheduledMessage.findByIdAndUpdate(id, update);
    res.json({ message: 'Updated successfully' });
  } catch (err) {
    console.error('[updateMessage]', err);
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

async function deleteMessage(req, res) {
  try {
    const { id } = req.params;
    const msg = await ScheduledMessage.findById(id);
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    if (req.user.role !== 'admin' && msg.user_id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (msg.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending messages can be deleted' });
    }
    await ScheduledMessage.findByIdAndDelete(id);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error('[deleteMessage]', err);
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

async function sendNow(req, res) {
  try {
    const { recipient, message_body, type, user_timezone } = req.body;

    if (!type || !['individual', 'group', 'status'].includes(type)) {
      return res.status(400).json({ message: 'Invalid type.' });
    }
    if (type !== 'status' && !recipient) {
      return res.status(400).json({ message: 'recipient is required' });
    }
    if (!message_body && !req.file) {
      return res.status(400).json({ message: 'Please provide a message or attach media' });
    }

    const userId = req.user.id;
    if (getStatus(userId) !== 'connected') {
      return res.status(400).json({ message: 'WhatsApp is not connected' });
    }

    const tz = user_timezone || req.user.timezone || process.env.DEFAULT_TIMEZONE;
    let media_path = null, media_type = null, media_filename = null;
    if (req.file) {
      media_path = req.file.filename;
      media_type = getMediaType(req.file.mimetype);
      media_filename = req.file.originalname;
    }

    const msg = await ScheduledMessage.create({
      user_id: userId, recipient: recipient || null,
      message_body: message_body || null, media_path, media_type, media_filename,
      type, scheduled_at: new Date(), user_timezone: tz, status: 'pending',
    });

    const waClient = getClient(userId);
    try {
      const waResult = await sendMessage(waClient, {
        id: msg._id.toString(), type,
        recipient: recipient || null,
        message_body: message_body || null,
        media_path, media_type,
      });

      const waMessageId = waResult?.id?._serialized || waResult?.id?.id || null;
      let totalRecipients = 0;
      if (type === 'group' && recipient) {
        try {
          const chat = await waClient.getChatById(recipient);
          totalRecipients = Math.max(0, (chat?.participants?.length || 0) - 1);
        } catch { /* ignore */ }
      }

      await ScheduledMessage.findByIdAndUpdate(msg._id, {
        status: 'sent', sent_at: new Date(),
        wa_message_id: waMessageId, ack_status: 1, total_recipients: totalRecipients,
      });
      res.status(200).json({ message: 'Message sent successfully', id: msg._id.toString() });
    } catch (sendErr) {
      const errMsg = String(sendErr?.message || sendErr || 'Unknown error').substring(0, 500);
      await ScheduledMessage.findByIdAndUpdate(msg._id, { status: 'failed', error_message: errMsg });
      res.status(500).json({ message: `Failed to send: ${errMsg}` });
    }
  } catch (err) {
    console.error('[sendNow]', err);
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

async function triggerNow(req, res) {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    await processMessages();
    res.json({ message: 'Scheduler triggered manually' });
  } catch (err) {
    console.error('[triggerNow]', err);
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

module.exports = { listMessages, createMessage, sendNow, updateMessage, deleteMessage, triggerNow };