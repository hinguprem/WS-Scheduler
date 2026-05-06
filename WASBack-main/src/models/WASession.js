const mongoose = require('mongoose');

const waSessionSchema = new mongoose.Schema({
  user_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  session_id:   { type: String, required: true },
  session_file: { type: String, required: true },
  updated_at:   { type: Date, default: Date.now },
});

waSessionSchema.index({ user_id: 1, session_id: 1 }, { unique: true });

module.exports = mongoose.model('WASession', waSessionSchema);
