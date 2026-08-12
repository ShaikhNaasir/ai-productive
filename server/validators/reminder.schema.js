'use strict';

const { z } = require('zod');

const upper = (v) => (typeof v === 'string' ? v.toUpperCase().replace(/\s+/g, '_') : v);
const recurrence = z.preprocess(upper, z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']));

const createReminderSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  remindAt: z.coerce.date(),
  recurrence: recurrence.optional(),
  taskId: z.string().uuid().optional().nullable(),
});

const updateReminderSchema = z
  .object({
    message: z.string().trim().min(1).max(1000).optional(),
    remindAt: z.coerce.date().optional(),
    sent: z.boolean().optional(),
    recurrence: recurrence.optional(),
    taskId: z.string().uuid().optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

module.exports = { createReminderSchema, updateReminderSchema };
