'use strict';

const { z } = require('zod');

// Optional startedAt lets the client record the real moment the timer began
// (before the network round-trip). It must not be in the future.
const startFocusSchema = z.object({
  taskId: z.string().min(1).optional().nullable(),
  startedAt: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now(), { message: 'startedAt cannot be in the future' })
    .optional(),
});

module.exports = { startFocusSchema };
