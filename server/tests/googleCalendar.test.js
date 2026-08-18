'use strict';

// Drive the real googleCalendar service against a stubbed googleapis client so the
// pagination and event-shape mapping are covered without any network access.

const mockList = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    calendar: () => ({ events: { list: mockList } }),
  },
}));

const googleCalendar = require('../services/googleCalendar');

const account = { userId: 'u1', refreshToken: 'rt', calendarId: 'primary', syncToken: null };
const page = (items, over = {}) => ({ data: { items, ...over } });

beforeEach(() => {
  mockList.mockReset();
});

describe('listEvents pagination', () => {
  test('single page returns its events and sync token', async () => {
    mockList.mockResolvedValueOnce(page([{ id: 'a' }], { nextSyncToken: 'tok1' }));

    const res = await googleCalendar.listEvents(account);

    expect(res.events.map((e) => e.id)).toEqual(['a']);
    expect(res.nextSyncToken).toBe('tok1');
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  test('follows nextPageToken and only takes the sync token from the final page', async () => {
    // Google omits nextSyncToken on every page but the last; stopping at page one
    // would discard the token and replay the same page forever.
    mockList
      .mockResolvedValueOnce(page([{ id: 'a' }, { id: 'b' }], { nextPageToken: 'p2' }))
      .mockResolvedValueOnce(page([{ id: 'c' }], { nextPageToken: 'p3' }))
      .mockResolvedValueOnce(page([{ id: 'd' }], { nextSyncToken: 'tok-final' }));

    const res = await googleCalendar.listEvents(account);

    expect(res.events.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(res.nextSyncToken).toBe('tok-final');
    expect(mockList).toHaveBeenCalledTimes(3);
    // Later requests carry the page token forward.
    expect(mockList.mock.calls[1][0].pageToken).toBe('p2');
    expect(mockList.mock.calls[2][0].pageToken).toBe('p3');
  });

  test('stops at the page cap instead of looping forever', async () => {
    mockList.mockResolvedValue(page([{ id: 'x' }], { nextPageToken: 'always-more' }));

    const res = await googleCalendar.listEvents(account);

    expect(mockList).toHaveBeenCalledTimes(20);
    expect(res.nextSyncToken).toBeNull();
  });

  test('an expired sync token surfaces as code 410', async () => {
    const err = new Error('Gone');
    err.code = 410;
    mockList.mockRejectedValueOnce(err);

    await expect(googleCalendar.listEvents(account)).rejects.toMatchObject({ code: 410 });
  });

  test('uses the stored sync token when present, timeMin otherwise', async () => {
    mockList.mockResolvedValueOnce(page([], { nextSyncToken: 't' }));
    await googleCalendar.listEvents({ ...account, syncToken: 'stored' });
    expect(mockList.mock.calls[0][0].syncToken).toBe('stored');
    expect(mockList.mock.calls[0][0].timeMin).toBeUndefined();

    mockList.mockResolvedValueOnce(page([], { nextSyncToken: 't' }));
    await googleCalendar.listEvents(account);
    expect(mockList.mock.calls[1][0].syncToken).toBeUndefined();
    expect(mockList.mock.calls[1][0].timeMin).toBeTruthy();
  });
});

describe('toGoogleEvent', () => {
  test('a timed schedule maps to dateTime', () => {
    const body = googleCalendar.toGoogleEvent({
      title: 'Standup',
      startTime: new Date('2026-08-20T09:00:00Z'),
      endTime: new Date('2026-08-20T09:30:00Z'),
    });
    expect(body.start).toEqual({ dateTime: '2026-08-20T09:00:00.000Z' });
    expect(body.end).toEqual({ dateTime: '2026-08-20T09:30:00.000Z' });
  });

  test('an all-day schedule maps to date, never a midnight timestamp', () => {
    const body = googleCalendar.toGoogleEvent({
      title: 'Holiday',
      allDay: true,
      startTime: new Date('2026-08-20T00:00:00Z'),
      endTime: new Date('2026-08-21T00:00:00Z'),
    });
    expect(body.start).toEqual({ date: '2026-08-20' });
    expect(body.end).toEqual({ date: '2026-08-21' });
    expect(body.start.dateTime).toBeUndefined();
  });

  test('a single-day all-day schedule gets an exclusive end date', () => {
    const body = googleCalendar.toGoogleEvent({
      title: 'One day',
      allDay: true,
      startTime: new Date('2026-08-20T00:00:00Z'),
      endTime: null,
    });
    expect(body.start).toEqual({ date: '2026-08-20' });
    expect(body.end).toEqual({ date: '2026-08-21' });
  });
});
