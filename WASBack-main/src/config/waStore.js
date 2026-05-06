const fs      = require('fs');
const path    = require('path');
const zlib    = require('zlib');
const crypto  = require('crypto');
const { promisify } = require('util');

const gzip   = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const WASession = require('../models/WASession');

const SESSIONS_DIR = path.resolve(__dirname, '../../uploads/sessions');

function ensureSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    console.log(`[WAStore] Created sessions directory: ${SESSIONS_DIR}`);
  }
}

class MongoDBStore {
  constructor(userId) {
    this.userId = userId;
    ensureSessionsDir();
  }

  async sessionExists({ session }) {
    const sessionId = path.basename(session);
    const doc = await WASession.findOne({ user_id: this.userId, session_id: sessionId });
    return !!doc;
  }

  async save({ session }) {
    const zipPath  = `${session}.zip`;
    const sessionId = path.basename(session);

    try {
      if (!fs.existsSync(zipPath)) {
        console.warn(`[WAStore:${this.userId}] Zip not found at ${zipPath}`);
        return;
      }

      const rawBuffer  = fs.readFileSync(zipPath);
      const compressed = await gzip(rawBuffer);

      const uniqueName = `${this.userId}_${crypto.randomUUID()}.gz`;
      const destPath   = path.join(SESSIONS_DIR, uniqueName);
      const relPath    = `sessions/${uniqueName}`;

      fs.writeFileSync(destPath, compressed);

      // Fetch old file path before overwriting
      let oldFile = null;
      try {
        const oldDoc = await WASession.findOne({ user_id: this.userId, session_id: sessionId });
        if (oldDoc) oldFile = oldDoc.session_file;
      } catch { /* non-fatal */ }

      // Upsert the new file path
      await WASession.findOneAndUpdate(
        { user_id: this.userId, session_id: sessionId },
        { $set: { session_file: relPath, updated_at: new Date() } },
        { upsert: true, new: true }
      );

      // Delete old file after DB row updated
      if (oldFile && oldFile !== relPath) {
        const oldAbsPath = path.resolve(__dirname, '../../uploads', oldFile);
        try {
          if (fs.existsSync(oldAbsPath)) fs.unlinkSync(oldAbsPath);
        } catch (delErr) {
          console.warn(`[WAStore:${this.userId}] Could not delete old file:`, delErr.message);
        }
      }
    } catch (err) {
      console.error(`[WAStore:${this.userId}] Failed to save session:`, err.message);
      throw err;
    }
  }

  async extract({ session, path: extractPath }) {
    const sessionId = path.basename(session);

    const doc = await WASession.findOne({ user_id: this.userId, session_id: sessionId });
    if (!doc) {
      console.warn(`[WAStore:${this.userId}] No session record for "${sessionId}"`);
      return;
    }

    const absPath = path.resolve(__dirname, '../../uploads', doc.session_file);
    if (!fs.existsSync(absPath)) {
      console.warn(`[WAStore:${this.userId}] Session file missing: ${absPath}`);
      await WASession.deleteOne({ user_id: this.userId, session_id: sessionId }).catch(() => {});
      return;
    }

    const compressed = fs.readFileSync(absPath);
    let data;
    try { data = await gunzip(compressed); } catch { data = compressed; }

    fs.writeFileSync(extractPath, data);
    console.log(`[WAStore:${this.userId}] Session extracted from ${absPath}`);
  }

  async delete({ session }) {
    const sessionId = path.basename(session);
    try {
      const doc = await WASession.findOne({ user_id: this.userId, session_id: sessionId });
      if (doc) {
        const absPath = path.resolve(__dirname, '../../uploads', doc.session_file);
        try { if (fs.existsSync(absPath)) fs.unlinkSync(absPath); } catch { /* ignore */ }
      }
    } catch { /* non-fatal */ }

    await WASession.deleteOne({ user_id: this.userId, session_id: sessionId });
  }
}

module.exports = MongoDBStore;