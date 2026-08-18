'use strict';

const { z } = require('zod');

const roleSchema = z.object({ role: z.enum(['USER', 'ADMIN']) });

const planSchema = z.object({
  plan: z.enum(['FREE', 'PAID']),
  planRenewsAt: z.string().datetime().nullable().optional(),
});

// Soft delete by default; hard delete (irreversible, cascades content) is opt-in.
const deleteSchema = z.object({ hard: z.boolean().optional() });

module.exports = { roleSchema, planSchema, deleteSchema };
