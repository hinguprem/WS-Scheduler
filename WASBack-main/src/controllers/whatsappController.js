const waService = require('../services/whatsappService');
const WAGroup   = require('../models/WAGroup');
const WAContact = require('../models/WAContact');
const WASession = require('../models/WASession');

function resolveUserId(req) {
  return req.user.id;
}

async function getStatus(req, res) {
  try {
    const userId = resolveUserId(req);
    if (waService.getStatus(userId) === 'disconnected') {
      waService.autoReconnectIfSession(userId).catch(() => {});
    }
    res.json({ status: waService.getStatus(userId), qr: waService.getQR(userId), userId });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

async function getAllStatuses(req, res) {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    res.json({ statuses: waService.getAllStatuses() });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

async function connect(req, res) {
  try {
    const userId = resolveUserId(req);
    const status = waService.getStatus(userId);
    if (status === 'connected')  return res.json({ message: 'Already connected', userId });
    if (status === 'initializing' || status === 'qr_ready') {
      return res.json({ message: 'Initialization in progress', qr: waService.getQR(userId), userId });
    }

    // Clear old sessions before fresh connect
    try {
      const deleted = await WASession.deleteMany({ user_id: userId });
      if (deleted.deletedCount > 0) {
        console.log(`[WA:${userId}] Cleared ${deleted.deletedCount} old session(s) before new connect`);
      }
    } catch (delErr) {
      console.warn(`[WA:${userId}] Could not clear old sessions:`, delErr.message);
    }

    await waService.initializeClient(userId);
    res.json({ message: 'WhatsApp initialization started', userId });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

async function disconnect(req, res) {
  try {
    const userId = resolveUserId(req);
    await waService.disconnectClient(userId);
    
    await WASession.deleteMany({ user_id: userId });
    await WAGroup.deleteMany({ user_id: userId });
    await WAContact.deleteMany({ user_id: userId });
    console.log(`[WA:${userId}] Cleared session data, groups, and contacts on disconnect`);

    res.json({ message: 'WhatsApp disconnected', userId });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

async function getGroups(req, res) {
  try {
    const userId = resolveUserId(req);
    const groups = await WAGroup.find({ user_id: userId }).sort('name');
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

async function syncGroups(req, res) {
  try {
    const userId = resolveUserId(req);
    const count  = await waService.syncGroups(userId);
    const groups = await WAGroup.find({ user_id: userId }).sort('name');
    res.json({ message: `Synced ${count} group(s)`, groups });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

async function getContacts(req, res) {
  try {
    const userId    = resolveUserId(req);
    const forceSync = req.query.sync === 'true';

    if (forceSync) {
      const count    = await waService.syncContacts(userId);
      const contacts = await WAContact.find({ user_id: userId }).sort('name').select('phone name profile_pic_url last_synced');
      return res.json({ message: `Synced ${count} contact(s)`, contacts });
    }

    const contacts = await WAContact.find({ user_id: userId }).sort('name').select('phone name profile_pic_url last_synced');
    res.json({ contacts });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

async function getGroupsWithPics(req, res) {
  try {
    const userId = resolveUserId(req);
    const groups = await WAGroup.find({ user_id: userId }).sort('name');
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

async function getGroupMembers(req, res) {
  try {
    const userId   = resolveUserId(req);
    const groupJid = decodeURIComponent(req.params.jid);

    const group = await WAGroup.findOne({ user_id: userId, group_jid: groupJid });
    if (!group) return res.json({ members: [] });

    const phones   = group.members || [];
    const contacts = await WAContact.find({ user_id: userId, phone: { $in: phones } }).select('phone name');
    const cMap     = Object.fromEntries(contacts.map(c => [c.phone, c.name]));

    const members = phones
      .map(phone => ({ phone, name: cMap[phone] || null }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    res.json({ members });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

module.exports = {
  getStatus, getAllStatuses, connect, disconnect,
  getGroups, syncGroups, getContacts, getGroupsWithPics, getGroupMembers,
};