'use strict';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

const prisma = require('../models/prisma');
const { authenticateSocket } = require('../realtime');
const { signToken } = require('../utils/jwt');

// The Socket.IO handshake must enforce the same tokenVersion revocation as
// requireAuth — otherwise a token invalidated by logout / password change would
// still stream that user's reminders for its full lifetime.
async function run(token) {
  const socket = { handshake: { auth: token ? { token } : {} } };
  return new Promise((resolve) => {
    authenticateSocket(socket, (err) => resolve({ err, socket }));
  });
}

let user;

beforeAll(async () => {
  user = await prisma.user.create({
    data: { email: 'socket@b.com', passwordHash: 'x', tokenVersion: 0 },
  });
});

describe('socket handshake auth', () => {
  test('rejects a missing token', async () => {
    const { err } = await run(null);
    expect(err).toBeInstanceOf(Error);
  });

  test('rejects a malformed token', async () => {
    const { err } = await run('not-a-jwt');
    expect(err.message).toBe('Invalid token');
  });

  test('accepts a current token and attaches the user id', async () => {
    const token = signToken({ sub: user.id, email: user.email, ver: 0 });
    const { err, socket } = await run(token);
    expect(err).toBeUndefined();
    expect(socket.userId).toBe(user.id);
  });

  test('rejects a token whose version no longer matches (revoked by logout)', async () => {
    const stale = signToken({ sub: user.id, email: user.email, ver: 0 });
    await prisma.user.update({ where: { id: user.id }, data: { tokenVersion: 1 } });

    const { err } = await run(stale);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Session expired');
  });

  test('rejects a token for a deleted user', async () => {
    const token = signToken({ sub: 'no-such-user', email: 'ghost@b.com', ver: 0 });
    const { err } = await run(token);
    expect(err.message).toBe('Session expired');
  });
});
