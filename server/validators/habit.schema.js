'use strict';

const { z } = require('zod');

const createHabitSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
});

const updateHabitSchema = createHabitSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update' }
);

module.exports = { createHabitSchema, updateHabitSchema };
