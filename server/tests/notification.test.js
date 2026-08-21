'use strict';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

// The scheduler emits over Socket.IO; stub it so the test doesn't need a live server.
jest.mock('../realtime', () => ({ emitToUser: jest.fn() }));

const request = require('supertest');
const createApp = require('../app');
const prisma = require('../models/prisma');
const scheduler = require('../services/reminderScheduler');

const app = createApp();
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('reminder → persisted notification → catch-up (G1)', () => {
  test('a due reminder writes a notification the user can fetch and mark read', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'notif@b.com', password: 'password123' });
    const token = reg.body.token;
    const userId = reg.body.user.id;

    // A reminder already past due.
    await prisma.reminder.create({
      data: { userId, message: 'Call mom', remindAt: new Date(Date.now() - 1000), sent: false },
    });

    await scheduler.tick();

    // The reminder was marked sent and a notification was persisted.
    const [reminder] = await prisma.reminder.findMany({ where: { userId } });
    expect(reminder.sent).toBe(true);

    const list = await request(app).get('/api/notifications').set(bearer(token));
    expect(list.status).toBe(200);
    expect(list.body.notifications).toHaveLength(1);
    expect(list.body.notifications[0].message).toBe('Call mom');
    expect(list.body.unread).toBe(1);

    // Mark all read → unread clears.
    const read = await request(app).post('/api/notifications/read').set(bearer(token));
    expect(read.status).toBe(200);

    const after = await request(app).get('/api/notifications').set(bearer(token));
    expect(after.body.unread).toBe(0);
  });

  test('notifications are scoped to the owner', async () => {
    const a = await request(app).post('/api/auth/register').send({ email: 'na@b.com', password: 'password123' });
    const b = await request(app).post('/api/auth/register').send({ email: 'nb@b.com', password: 'password123' });
    await prisma.notification.create({ data: { userId: a.body.user.id, message: 'secret', type: 'reminder' } });

    const res = await request(app).get('/api/notifications').set(bearer(b.body.token));
    expect(res.body.notifications).toHaveLength(0);
  });
});
