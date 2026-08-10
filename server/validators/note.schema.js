'use strict';

const { z } = require('zod');

const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(300),
  content: z.string().max(50000).optional(),
  category: z.string().trim().max(100).optional().nullable(),
  tags: z.array(z.string().trim().min(1)).max(50).optional(),
  pinned: z.boolean().optional(),
});

const updateNoteSchema = createNoteSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update' }
);

const listNoteQuerySchema = z.object({
  category: z.string().optional(),
  tag: z.string().optional(),
  pinned: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  q: z.string().optional(),
});

module.exports = { createNoteSchema, updateNoteSchema, listNoteQuerySchema };
