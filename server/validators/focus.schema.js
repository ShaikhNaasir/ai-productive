'use strict';

const { z } = require('zod');

// Optional startedAt lets the client record the real moment the timer began
// (before the network round-trip). A value in the future (client clock skew) is
// tolerated here and clamped to "now" by the controller, not rejected — otherwise
// any device whose clock runs slightly fast could never start a session.
const startFocusSchema = z.object({
  taskId: z.string().min(1).optional().nullable(),
  startedAt: z.coerce.date().optional(),
  // Planned duration in seconds (capped at 24h) so a reload can recover the timer.
  plannedSeconds: z.coerce.number().int().positive().max(24 * 3600).optional(),
});

// Stop may carry the client's active seconds (excluding paused time). The server
// clamps it to the wall-clock elapsed, so it can shorten but never inflate.
const stopFocusSchema = z.object({
  seconds: z.coerce.number().int().min(0).max(24 * 3600).optional(),
});

module.exports = { startFocusSchema, stopFocusSchema };
