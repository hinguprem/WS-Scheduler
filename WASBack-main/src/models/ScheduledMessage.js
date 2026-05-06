const mongoose = require('mongoose');

const scheduledMessageSchema = new mongoose.Schema({
  user_id:             { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient:           { type: String, default: null },
  message_body:        { type: String, default: null },
  media_path:          { type: String, default: null },
  media_type:          { type: String, default: null },
  media_filename:      { type: String, default: null },
  type:                { type: String, enum: ['individual', 'group', 'status'], required: true },
  scheduled_at:        { type: Date, required: true },
  user_timezone:       { type: String, default: 'UTC' },
  status:              { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  sent_at:             { type: Date, default: null },
  wa_message_id:       { type: String, default: null },
  ack_status:          { type: Number, default: 0 },
  total_recipients:    { type: Number, default: 0 },
  error_message:       { type: String, default: null },
  recurrence:          { type: String, enum: ['none', 'daily', 'weekly', 'monthly'], default: 'none' },
  recurrence_end_date: { type: Date, default: null },
  parent_message_id:   { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

scheduledMessageSchema.virtual('id').get(function () { return this._id.toString(); });
scheduledMessageSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('ScheduledMessage', scheduledMessageSchema);
