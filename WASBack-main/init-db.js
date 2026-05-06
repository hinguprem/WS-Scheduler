require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set in .env'); process.exit(1); }

  await mongoose.connect(uri);
  console.log('[Seed] Connected to MongoDB');

  // Load model after connection
  const User = require('./src/models/User');

  const adminEmail = 'admin@whatsapp-scheduler.com';
  const existing   = await User.findOne({ email: adminEmail });

  if (existing) {
    console.log('[Seed] Admin user already exists — skipping');
  } else {
    const hash = await bcrypt.hash('Admin@123', 10);
    await User.create({
      username:      'admin',
      email:         adminEmail,
      password_hash: hash,
      role:          'admin',
      timezone:      'Asia/Kolkata',
    });
    console.log('[Seed] ✅ Admin user created:');
    console.log('       Email:    admin@whatsapp-scheduler.com');
    console.log('       Password: Admin@123');
    console.log('       ⚠️  Change the password after first login!');
  }

  await mongoose.disconnect();
  console.log('[Seed] Done');
}

seed().catch(err => { console.error('[Seed] Error:', err.message); process.exit(1); });
