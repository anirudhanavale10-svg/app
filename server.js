const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'speakapp-secret-2024';
const CLIENT_DIST = path.join(__dirname, 'client', 'dist');

// ─── Database (in-memory) ────────────────────────────────────────────────────
const users = new Map();
const events = [];
const rooms = new Map();

async function seedAdmin() {
  const hash = await bcrypt.hash('admin123', 10);
  users.set('admin@speakapp.io', {
    id: 1, email: 'admin@speakapp.io', password_hash: hash,
    name: 'Admin', role: 'superadmin'
  });
  console.log('✅ Admin ready: admin@speakapp.io / admin123');
}

// ─── Room helpers ────────────────────────────────────────────────────────────
function makeCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += c[Math.floor(Math.random() * c.length)];
  return code;
}

function getRoom(id) { return id ? rooms.get(id.toUpperCase()) : null; }

function roomJSON(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, hostName: r.hostName, status: r.status,
    queue: r.queue.map(q => ({ id: q.id, name: q.name, question: q.question || '', linkedin: q.linkedin || '' })),
    currentSpeaker: r.currentSpeaker ? { id: r.currentSpeaker.id, name: r.currentSpeaker.name, linkedin: r.currentSpeaker.linkedin || '' } : null,
    attendeeCount: r.attendees.size,
    transcript: r.transcript.slice(-50)
  };
}

// ─── Express ─────────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Serve built frontend
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  console.log('📁 Serving frontend from:', CLIENT_DIST);
}

// ─── Socket.IO ───────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// ─── Auth helpers ────────────────────────────────────────────────────────────
function authMiddleware(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  try { return jwt.verify(h.split(' ')[1], JWT_SECRET); } catch { return null; }
}

// ─── REST API ────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', rooms: rooms.size, users: users.size, uptime: Math.floor(process.uptime()) });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = users.get(email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const key = email.toLowerCase().trim();
    if (users.has(key)) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const user = { id: users.size + 1, email: key, password_hash: hash, name: name.trim(), role: 'user' };
    users.set(key, user);

    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.get('/api/auth/me', (req, res) => {
  const decoded = authMiddleware(req);
  if (!decoded) return res.status(401).json({ error: 'Not authenticated' });

  for (const u of users.values()) {
    if (u.id === decoded.userId) {
      return res.json({ user: { id: u.id, email: u.email, name: u.name, role: u.role } });
    }
  }
  res.status(404).json({ error: 'User not found' });
});

app.get('/api/admin/stats', (req, res) => {
  const decoded = authMiddleware(req);
  if (!decoded) return res.status(401).json({ error: 'Not authenticated' });
  if (!['admin', 'superadmin'].includes(decoded.role)) return res.status(403).json({ error: 'Admin only' });

  res.json({ totalUsers: users.size, totalEvents: events.length, activeEvents: rooms.size });
});

// ─── Socket.IO handlers ─────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 +${socket.id.slice(0, 8)}`);

  socket.on('create_event', (data) => {
    let code = makeCode();
    while (rooms.has(code)) code = makeCode();

    const room = {
      id: code, name: data?.name || 'Untitled', hostSocketId: socket.id,
      hostName: data?.hostName || 'Host', status: 'active',
      queue: [], currentSpeaker: null, attendees: new Map(), transcript: []
    };
    rooms.set(code, room);
    events.push({ code, name: room.name, host: room.hostName, ts: new Date() });

    socket.join(code);
    socket.roomId = code;
    socket.isHost = true;
    socket.emit('event_created', roomJSON(room));
    console.log(`✅ Event ${code}: "${room.name}"`);
  });

  socket.on('end_event', (roomId) => {
    const room = getRoom(roomId);
    if (!room || socket.id !== room.hostSocketId) return;
    room.status = 'ended';
    io.to(room.id).emit('event_ended', { roomId: room.id });
    setTimeout(() => rooms.delete(room.id), 3000);
  });

  socket.on('join_room_attendee', ({ roomId, user }) => {
    const room = getRoom(roomId);
    if (!room) return socket.emit('error', 'Room not found. Check the code.');
    if (room.status === 'ended') return socket.emit('error', 'This event has ended');

    room.attendees.set(socket.id, { id: socket.id, name: user?.name || 'Guest', linkedin: user?.linkedin || '' });
    socket.join(room.id);
    socket.roomId = room.id;
    socket.isHost = false;

    socket.emit('room_data', roomJSON(room));
    io.to(room.hostSocketId).emit('attendee_joined', { name: user?.name, count: room.attendees.size });
    console.log(`👤 ${user?.name || 'Guest'} → ${room.id}`);
  });

  socket.on('join_queue', ({ roomId, user }) => {
    const room = getRoom(roomId);
    if (!room || room.queue.some(q => q.id === socket.id)) return;
    const attendee = room.attendees.get(socket.id);
    room.queue.push({ id: socket.id, name: user?.name || 'Guest', question: '', linkedin: attendee?.linkedin || user?.linkedin || '' });
    io.to(room.id).emit('room_data', roomJSON(room));
  });

  socket.on('leave_queue', (roomId) => {
    const room = getRoom(roomId);
    if (!room) return;
    room.queue = room.queue.filter(q => q.id !== socket.id);
    io.to(room.id).emit('room_data', roomJSON(room));
  });

  socket.on('submit_question', ({ roomId, text }) => {
    const room = getRoom(roomId);
    if (!room) return;
    const entry = room.queue.find(q => q.id === socket.id);
    if (entry) { entry.question = text || ''; io.to(room.id).emit('room_data', roomJSON(room)); }
  });

  socket.on('grant_floor', ({ roomId, userId }) => {
    const room = getRoom(roomId);
    if (!room || room.currentSpeaker) return;
    const idx = room.queue.findIndex(q => q.id === userId);
    if (idx < 0) return;
    room.currentSpeaker = room.queue.splice(idx, 1)[0];
    io.to(room.id).emit('room_data', roomJSON(room));
    io.to(userId).emit('floor_granted');
    console.log(`🎤 ${room.currentSpeaker.name} speaking in ${room.id}`);
  });

  socket.on('end_speech', (roomId) => {
    const room = getRoom(roomId);
    if (!room || !room.currentSpeaker) return;
    const speaker = room.currentSpeaker;
    room.currentSpeaker = null;
    io.to(room.id).emit('room_data', roomJSON(room));
    io.to(room.id).emit('speech_ended', { speakerName: speaker.name });
    // Notify the speaker they can request follow-up (re-join queue)
    io.to(speaker.id).emit('speech_done_can_rejoin');
  });

  socket.on('rejoin_queue', ({ roomId, user }) => {
    const room = getRoom(roomId);
    if (!room || room.queue.some(q => q.id === socket.id)) return;
    const attendee = room.attendees.get(socket.id);
    room.queue.push({ id: socket.id, name: user?.name || 'Guest', question: '(Follow-up)', linkedin: attendee?.linkedin || '' });
    io.to(room.id).emit('room_data', roomJSON(room));
  });

  socket.on('remove_from_queue', ({ roomId, userId }) => {
    const room = getRoom(roomId);
    if (!room || socket.id !== room.hostSocketId) return;
    room.queue = room.queue.filter(q => q.id !== userId);
    io.to(userId).emit('removed_from_queue');
    io.to(room.id).emit('room_data', roomJSON(room));
  });

  socket.on('remove_speaker', (roomId) => {
    const room = getRoom(roomId);
    if (!room || socket.id !== room.hostSocketId || !room.currentSpeaker) return;
    const speakerId = room.currentSpeaker.id;
    const speakerName = room.currentSpeaker.name;
    room.currentSpeaker = null;
    io.to(speakerId).emit('speech_ended', { speakerName });
    io.to(speakerId).emit('removed_from_speaking');
    io.to(room.id).emit('room_data', roomJSON(room));
  });

  socket.on('signal_followup', (roomId) => {
    const room = getRoom(roomId);
    if (room?.currentSpeaker) {
      io.to(room.hostSocketId).emit('followup_signal', { speakerName: room.currentSpeaker.name });
    }
  });

  socket.on('followup_response', ({ roomId, approved }) => {
    const room = getRoom(roomId);
    if (!room?.currentSpeaker) return;
    if (approved) {
      io.to(room.currentSpeaker.id).emit('followup_approved');
    } else {
      const speaker = room.currentSpeaker;
      io.to(speaker.id).emit('followup_declined');
      room.currentSpeaker = null;
      // Re-add speaker to end of queue
      const attendee = room.attendees.get(speaker.id);
      room.queue.push({ id: speaker.id, name: speaker.name, question: '(Follow-up)', linkedin: attendee?.linkedin || speaker.linkedin || '' });
      io.to(room.id).emit('room_data', roomJSON(room));
    }
  });

  socket.on('send_reaction', ({ roomId, emoji }) => {
    if (roomId && emoji) io.to(roomId.toUpperCase()).emit('reaction_received', emoji);
  });

  // WebRTC signaling
  socket.on('webrtc_offer', ({ roomId, offer }) => {
    const room = getRoom(roomId);
    if (room) io.to(room.hostSocketId).emit('webrtc_offer', { from: socket.id, offer });
  });

  socket.on('webrtc_answer', ({ to, answer }) => {
    if (to) io.to(to).emit('webrtc_answer', { from: socket.id, answer });
  });

  socket.on('webrtc_ice', ({ roomId, candidate, to }) => {
    if (to) io.to(to).emit('webrtc_ice', { from: socket.id, candidate });
    else if (roomId) socket.to(roomId.toUpperCase()).emit('webrtc_ice', { from: socket.id, candidate });
  });

  socket.on('transcript_update', ({ roomId, text, speaker }) => {
    const room = getRoom(roomId);
    if (!room) return;
    const entry = { id: Date.now(), speaker: speaker || room.currentSpeaker?.name || 'Speaker', text, timestamp: Date.now() };
    room.transcript.push(entry);
    if (room.transcript.length > 100) room.transcript = room.transcript.slice(-100);
    io.to(room.id).emit('transcript_update', entry);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 -${socket.id.slice(0, 8)}`);
    if (!socket.roomId) return;
    const room = getRoom(socket.roomId);
    if (!room) return;

    if (socket.isHost) {
      room.status = 'ended';
      io.to(room.id).emit('event_ended', { reason: 'Host disconnected' });
      setTimeout(() => rooms.delete(room.id), 3000);
    } else {
      room.attendees.delete(socket.id);
      room.queue = room.queue.filter(q => q.id !== socket.id);
      if (room.currentSpeaker?.id === socket.id) room.currentSpeaker = null;
      io.to(room.id).emit('room_data', roomJSON(room));
    }
  });
});

// ─── SPA fallback (must be AFTER /api routes) ────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const index = path.join(CLIENT_DIST, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  res.status(200).send('<h1>SpeakApp</h1><p>Frontend not built. Run: <code>npm run build</code></p>');
});

// ─── Start ───────────────────────────────────────────────────────────────────
seedAdmin().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎤 SpeakApp running on port ${PORT}\n`);
  });
});
