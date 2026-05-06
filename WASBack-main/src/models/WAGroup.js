const mongoose = require('mongoose');

const waGroupSchema = new mongoose.Schema({
  user_id:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group_jid:         { type: String, required: true },
  name:              { type: String },
  participants_count:{ type: Number, default: 0 },
  profile_pic_url:   { type: String, default: null },
  members:           [{ type: String }], // array of phone numbers
  last_synced:       { type: Date, default: Date.now },
});

waGroupSchema.index({ user_id: 1, group_jid: 1 }, { unique: true });
waGroupSchema.virtual('id').get(function () { return this._id.toString(); });
waGroupSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('WAGroup', waGroupSchema);
