'use strict';

const { Server } = require('socket.io');
const { verifyToken } = require('./utils/jwt');
const config = require('./config/env');
const prisma = require('./models/prisma');

let io = null;

// Handshake auth, mirroring `middleware/auth.requireAuth`: a valid signature is not
// enough — the token's version must still match the user's current tokenVersion, so
// logout / password change revokes websockets too, not just HTTP requests.
async function authenticateSocket(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return next(new Error('Invalid token'));
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || (payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
      return next(new Error('Session expired'));
    }
    socket.userId = user.id;
    return next();
  } catch (err) {
    return next(err);
  }
}

// Attach Socket.IO to the HTTP server. Clients authenticate with their JWT in the
// handshake and are placed in a room keyed by their user id, so we can push
// user-scoped reminder notifications.
function attachRealtime(server) {
  io = new Server(server, {
    cors: { origin: config.clientOrigin, credentials: true },
  });

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    socket.join(socket.userId);
  });

  return io;
}

function emitToUser(userId, event, payload) {
  if (io) io.to(userId).emit(event, payload);
}

// Evict a user's live sockets after their tokens are revoked — the handshake check
// only runs on connect, so an already-open socket would otherwise survive a logout.
// Best-effort: never throws, since revocation must succeed regardless.
function disconnectUser(userId) {
  try {
    if (io) io.in(userId).disconnectSockets(true);
  } catch {
    // Ignore — the token is revoked either way; the socket dies on its next reconnect.
  }
}

module.exports = { attachRealtime, authenticateSocket, emitToUser, disconnectUser, getIo: () => io };
