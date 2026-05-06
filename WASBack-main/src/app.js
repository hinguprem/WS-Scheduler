require('dotenv').config();

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  if (msg.includes('ENOENT') && msg.includes('wwebjs_temp_session')) return;
  console.error('[Process] Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err.message || err);
});

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');
const path    = require('path');

const { connectDB }      = require('./config/db');
const waService          = require('./services/whatsappService');
const { startScheduler } = require('./services/schedulerService');

const authRoutes      = require('./routes/auth');
const userRoutes      = require('./routes/users');
const whatsappRoutes  = require('./routes/whatsapp');
const messageRoutes   = require('./routes/messages');

const app    = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const io = new Server(server, {
  cors: { origin: CLIENT_URL, methods: ['GET', 'POST'], credentials: true },
});

waService.setIO(io);

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth',     authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/messages', messageRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File size exceeds 16MB limit' });
  }
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('join', async ({ userId }) => {
    if (!userId) return;
    const room = `user:${userId}`;
    socket.join(room);
    console.log(`[Socket] ${socket.id} joined room ${room}`);
    await waService.autoReconnectIfSession(userId);
    socket.emit('wa:status', {
      status: waService.getStatus(userId),
      qr:     waService.getQR(userId),
      userId,
    });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

const PORT = parseInt(process.env.PORT) || 5000;

server.listen(PORT, async () => {
  console.log(`[Server] Running on port ${PORT} | NODE_ENV=${process.env.NODE_ENV || 'development'}`);

  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET === 'super_secret_key_change_me_in_production') {
    console.warn('[Server] ⚠️  WARNING: JWT_SECRET is using the default value! Change it in production.');
  }

  await connectDB();
  startScheduler();
  await waService.reconnectAllSessionsOnStartup();
});

module.exports = { app, server, io };