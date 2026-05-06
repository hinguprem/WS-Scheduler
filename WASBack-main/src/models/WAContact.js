const mongoose = require('mongoose');

const waContactSchema = new mongoose.Schema({
  user_id:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  phone:           { type: String, required: true },
  name:            { type: String },
  profile_pic_url: { type: String, default: null },
  last_synced:     { type: Date, default: Date.now },
});

waContactSchema.index({ user_id: 1, phone: 1 }, { unique: true });
waContactSchema.virtual('id').get(function () { return this._id.toString(); });
waContactSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('WAContact', waContactSchema);
