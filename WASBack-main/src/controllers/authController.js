const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const User   = require('../models/User');

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ message: 'Invalid email or password' });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: {
        id:       user._id.toString(),
        username: user.username,
        email:    user.email,
        role:     user.role,
        timezone: user.timezone,
      },
    });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

async function getMe(req, res) {
  res.json({ user: req.user });
}

async function createDemo(req, res) {
  try {
    const timestamp = Date.now();
    const guestEmail = `guest-${timestamp}@demo.com`;
    const guestUsername = `Guest_${Math.floor(Math.random() * 10000)}`;
    const randomPassword = Math.random().toString(36).slice(-10);
    
    const hash = await bcrypt.hash(randomPassword, 10);
    const user = await User.create({
      username: guestUsername,
      email: guestEmail,
      password_hash: hash,
      role: 'user',
      timezone: 'Asia/Kolkata',
    });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(201).json({
      token,
      user: {
        id:       user._id.toString(),
        username: user.username,
        email:    user.email,
        role:     user.role,
        timezone: user.timezone,
      },
    });
  } catch (err) {
    console.error('[createDemo]', err);
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
}

module.exports = { login, getMe, createDemo };
