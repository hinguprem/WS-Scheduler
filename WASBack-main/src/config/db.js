const mongoose = require('mongoose');
require('dotenv').config();

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[DB] MONGODB_URI environment variable is not set!');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('[DB] MongoDB Atlas connected successfully');
  } catch (err) {
    console.error('[DB] MongoDB connection failed:', err.message);
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => {
    console.error('[DB] MongoDB connection error:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] MongoDB disconnected — will auto-reconnect');
  });
}

module.exports = { connectDB };