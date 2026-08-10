'use strict';

const { z } = require('zod');

const createReminderSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  remindAt: z.coerce.date(),
  taskId: z.string().uuid().optional().nullable(),
});

const updateReminderSchema = z
  .object({
    message: z.string().trim().min(1).max(1000).optional(),
    remindAt: z.coerce.date().optional(),
    sent: z.boolean().optional(),
    taskId: z.string().uuid().optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

module.exports = { createReminderSchema, updateReminderSchema };
