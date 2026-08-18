'use strict';

const { z } = require('zod');

const createScheduleSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(5000).optional().nullable(),
    location: z.string().max(300).optional().nullable(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date().optional().nullable(),
    allDay: z.boolean().optional(),
  })
  .refine((d) => !d.endTime || d.endTime >= d.startTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });

const updateScheduleSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(5000).optional().nullable(),
    location: z.string().max(300).optional().nullable(),
    startTime: z.coerce.date().optional(),
    endTime: z.coerce.date().optional().nullable(),
    allDay: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

const rangeQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

module.exports = { createScheduleSchema, updateScheduleSchema, rangeQuerySchema };
