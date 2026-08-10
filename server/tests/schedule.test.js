'use strict';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

const request = require('supertest');
const createApp = require('../app');

const app = createApp();
let token;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'sched@b.com', password: 'password123' });
  token = res.body.token;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('schedules + reminders + calendar', () => {
  test('create schedule', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .set(auth())
      .send({ title: 'Team Meeting', startTime: '2026-08-12T09:00:00Z', endTime: '2026-08-12T10:00:00Z' });
    expect(res.status).toBe(201);
    expect(res.body.schedule.title).toBe('Team Meeting');
  });

  test('reject endTime before startTime', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .set(auth())
      .send({ title: 'bad', startTime: '2026-08-12T10:00:00Z', endTime: '2026-08-12T09:00:00Z' });
    expect(res.status).toBe(400);
  });

  test('create reminder', async () => {
    const res = await request(app)
      .post('/api/reminders')
      .set(auth())
      .send({ message: 'Project review', remindAt: '2026-08-11T10:00:00Z' });
    expect(res.status).toBe(201);
    expect(res.body.reminder.sent).toBe(false);
  });

  test('calendar aggregates tasks, schedules, reminders', async () => {
    await request(app).post('/api/tasks').set(auth()).send({ title: 'due task', dueDate: '2026-08-12T15:00:00Z' });
    const res = await request(app).get('/api/calendar').set(auth());
    expect(res.status).toBe(200);
    const types = new Set(res.body.events.map((e) => e.type));
    expect(types.has('schedule')).toBe(true);
    expect(types.has('reminder')).toBe(true);
    expect(types.has('task')).toBe(true);
    // sorted ascending by date
    const dates = res.body.events.map((e) => new Date(e.date).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });
});
