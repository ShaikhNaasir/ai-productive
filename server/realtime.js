'use strict';

const { Server } = require('socket.io');
const { verifyToken } = require('./utils/jwt');
const config = require('./config/env');

let io = null;

// Attach Socket.IO to the HTTP server. Clients authenticate with their JWT in the
// handshake and are placed in a room keyed by their user id, so we can push
// user-scoped reminder notifications.
function attachRealtime(server) {
  io = new Server(server, {
    cors: { origin: config.clientOrigin, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyToken(token);
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(socket.userId);
  });

  return io;
}

function emitToUser(userId, event, payload) {
  if (io) io.to(userId).emit(event, payload);
}

module.exports = { attachRealtime, emitToUser, getIo: () => io };
