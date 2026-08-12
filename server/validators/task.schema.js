'use strict';

const { z } = require('zod');

const upper = (v) => (typeof v === 'string' ? v.toUpperCase().replace(/\s+/g, '_') : v);

const priority = z.preprocess(upper, z.enum(['LOW', 'MEDIUM', 'HIGH']));
const status = z.preprocess(upper, z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']));
const recurrence = z.preprocess(upper, z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']));

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).optional(),
  priority: priority.optional(),
  status: status.optional(),
  recurrence: recurrence.optional(),
  dueDate: z.coerce.date().optional().nullable(),
  tags: z.array(z.string().trim().min(1)).max(50).optional(),
});

const updateTaskSchema = createTaskSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update' }
);

const listTaskQuerySchema = z.object({
  status: status.optional(),
  priority: priority.optional(),
  tag: z.string().optional(),
  q: z.string().optional(),
  sort: z.enum(['createdAt', 'dueDate', 'priority']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

module.exports = { createTaskSchema, updateTaskSchema, listTaskQuerySchema };
