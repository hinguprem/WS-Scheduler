const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true, trim: true },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  role:         { type: String, enum: ['admin', 'user'], default: 'user' },
  timezone:     { type: String, default: 'Asia/Kolkata' },
  full_name:    { type: String, default: null },
  mobile:       { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Virtual 'id' so frontend keeps using user.id
userSchema.virtual('id').get(function () { return this._id.toString(); });
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
