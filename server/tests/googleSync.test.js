'use strict';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

jest.mock('../services/googleCalendar', () => ({
  listEvents: jest.fn(async () => ({ events: [], nextSyncToken: 'tok-default' })),
  insertEvent: jest.fn(async () => ({ id: 'gev-new' })),
  updateEvent: jest.fn(async () => ({})),
  deleteEvent: jest.fn(async () => ({})),
}));

const prisma = require('../models/prisma');
const googleCalendar = require('../services/googleCalendar');
const googleSync = require('../services/googleSync');

const iso = (s) => new Date(s);
const gEvent = (id, over = {}) => ({
  id,
  status: 'confirmed',
  summary: 'Event',
  start: { dateTime: '2026-08-20T09:00:00Z' },
  end: { dateTime: '2026-08-20T10:00:00Z' },
  ...over,
});

async function connect(userId, over = {}) {
  return prisma.googleAccount.create({ data: { userId, refreshToken: 'rt', ...over } });
}

describe('googleSync (C1.2)', () => {
  test('no-ops when the user is not connected', async () => {
    const res = await googleSync.syncUser('nobody');
    expect(res.skipped).toBe(true);
  });

  test('pull imports a new Google event as a schedule + saves the sync token', async () => {
    await connect('userA');
    googleCalendar.listEvents.mockResolvedValueOnce({
      events: [gEvent('gA', { summary: 'Standup' })],
      nextSyncToken: 'tokA',
    });

    await googleSync.syncUser('userA');

    const rows = await prisma.schedule.findMany({ where: { userId: 'userA' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].googleEventId).toBe('gA');
    expect(rows[0].title).toBe('Standup');

    const account = await prisma.googleAccount.findUnique({ where: { userId: 'userA' } });
    expect(account.syncToken).toBe('tokA');
    expect(googleCalendar.insertEvent).not.toHaveBeenCalled();
  });

  test('pull updates an already-linked schedule', async () => {
    await connect('userU');
    await prisma.schedule.create({
      data: { userId: 'userU', title: 'old', startTime: iso('2026-08-01T09:00:00Z'), googleEventId: 'gU' },
    });
    googleCalendar.listEvents.mockResolvedValueOnce({
      events: [gEvent('gU', { summary: 'new title' })],
      nextSyncToken: 'tokU',
    });

    await googleSync.syncUser('userU');

    const row = await prisma.schedule.findFirst({ where: { userId: 'userU', googleEventId: 'gU' } });
    expect(row.title).toBe('new title');
  });

  test('pull deletes a schedule when its Google event is cancelled', async () => {
    await connect('userC');
    await prisma.schedule.create({
      data: { userId: 'userC', title: 'gone soon', startTime: iso('2026-08-01T09:00:00Z'), googleEventId: 'gC' },
    });
    googleCalendar.listEvents.mockResolvedValueOnce({
      events: [gEvent('gC', { status: 'cancelled' })],
      nextSyncToken: 'tokC',
    });

    await googleSync.syncUser('userC');

    const row = await prisma.schedule.findFirst({ where: { userId: 'userC', googleEventId: 'gC' } });
    expect(row).toBeNull();
  });

  test('push creates a Google event for a new local schedule and stores its id', async () => {
    await connect('userP');
    await prisma.schedule.create({
      data: { userId: 'userP', title: 'local only', startTime: iso('2026-08-05T09:00:00Z') },
    });
    googleCalendar.insertEvent.mockResolvedValueOnce({ id: 'gP-created' });

    await googleSync.syncUser('userP');

    const row = await prisma.schedule.findFirst({ where: { userId: 'userP' } });
    expect(googleCalendar.insertEvent).toHaveBeenCalledTimes(1);
    expect(row.googleEventId).toBe('gP-created');
  });

  test('conflict: a remote edit wins over a concurrent local edit (Google wins)', async () => {
    await connect('userG', { lastSyncedAt: new Date(Date.now() - 3600000) });
    // Linked schedule edited locally just now (updatedAt > lastSyncedAt).
    await prisma.schedule.create({
      data: { userId: 'userG', title: 'local edit', startTime: iso('2026-08-06T09:00:00Z'), googleEventId: 'gZ' },
    });
    googleCalendar.listEvents.mockResolvedValueOnce({
      events: [gEvent('gZ', { summary: 'remote edit' })],
      nextSyncToken: 'tokG',
    });

    await googleSync.syncUser('userG');

    const row = await prisma.schedule.findFirst({ where: { userId: 'userG', googleEventId: 'gZ' } });
    expect(row.title).toBe('remote edit');
    // Google won the event during pull, so it must NOT be pushed back up.
    expect(googleCalendar.updateEvent).not.toHaveBeenCalled();
  });

  test('deleteRemoteForSchedule deletes the linked Google event (best-effort)', async () => {
    await connect('userD');
    const schedule = { userId: 'userD', googleEventId: 'gD' };

    await googleSync.deleteRemoteForSchedule(schedule);

    expect(googleCalendar.deleteEvent).toHaveBeenCalledWith(expect.anything(), 'gD');
  });

  test('deleteRemoteForSchedule is a no-op for an unlinked schedule', async () => {
    await googleSync.deleteRemoteForSchedule({ userId: 'userD', googleEventId: null });
    expect(googleCalendar.deleteEvent).not.toHaveBeenCalled();
  });

  test('syncAll isolates a failing account and never throws (graceful degrade)', async () => {
    googleCalendar.listEvents.mockRejectedValue(new Error('network down'));
    await expect(googleSync.syncAll()).resolves.toBeUndefined();
  });
});
