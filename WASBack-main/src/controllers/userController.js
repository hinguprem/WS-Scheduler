const bcrypt = require('bcryptjs');
const User   = require('../models/User');

async function listUsers(req, res) {
  try {
    const users = await User.find().sort({ created_at: -1 })
      .select('username email full_name mobile role timezone created_at');
    res.json({ users: users.map(u => ({ ...u.toJSON(), id: u._id.toString() })) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function createUser(req, res) {
  const { username, email, password, role, timezone, full_name, mobile } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'username, email, and password are required' });
  }
  try {
    const existing = await User.findOne({ $or: [{ email: email.toLowerCase().trim() }, { username: username.trim() }] });
    if (existing) return res.status(409).json({ message: 'Email or username already exists' });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username:      username.trim(),
      email:         email.toLowerCase().trim(),
      password_hash: hash,
      role:          role === 'admin' ? 'admin' : 'user',
      timezone:      timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
      full_name:     full_name?.trim() || null,
      mobile:        mobile?.trim() || null,
    });
    res.status(201).json({ message: 'User created', id: user._id.toString() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateUser(req, res) {
  const { id } = req.params;
  const { username, email, role, timezone, full_name, mobile } = req.body;
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  try {
    const update = {};
    if (username)              update.username  = username.trim();
    if (email)                 update.email     = email.toLowerCase().trim();
    if (timezone)              update.timezone  = timezone;
    if (full_name !== undefined) update.full_name = full_name?.trim() || null;
    if (mobile !== undefined)    update.mobile    = mobile?.trim() || null;
    if (role && req.user.role === 'admin') update.role = role;

    if (!Object.keys(update).length) return res.status(400).json({ message: 'Nothing to update' });
    await User.findByIdAndUpdate(id, update);
    res.json({ message: 'User updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function changePassword(req, res) {
  const { id } = req.params;
  const { current_password, new_password } = req.body;
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters' });
  }
  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (req.user.role !== 'admin') {
      if (!current_password) return res.status(400).json({ message: 'Current password is required' });
      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password_hash = await bcrypt.hash(new_password, 10);
    await user.save();
    res.json({ message: 'Password changed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function deleteUser(req, res) {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ message: 'Cannot delete your own account' });
  try {
    const result = await User.findByIdAndDelete(id);
    if (!result) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateTimezone(req, res) {
  const { timezone } = req.body;
  if (!timezone) return res.status(400).json({ message: 'timezone is required' });
  try {
    await User.findByIdAndUpdate(req.user.id, { timezone });
    res.json({ message: 'Timezone updated', timezone });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { listUsers, createUser, updateUser, changePassword, deleteUser, updateTimezone };