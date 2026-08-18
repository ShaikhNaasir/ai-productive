'use strict';

// Minimal in-memory Prisma stand-in covering the query surface used by controllers.
// Supports: findUnique, findFirst, findMany (where + orderBy), create, update, delete, count.

let counter = 1;
// UUID-shaped (v4 layout) so the `.uuid()` validators on request bodies behave the
// same against fake ids as they do against Prisma's real `@default(uuid())` values.
const nextId = () => `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`;

const modelDefaults = {
  tasks: { priority: 'MEDIUM', status: 'PENDING', recurrence: 'NONE', tags: [], description: null, dueDate: null, completedAt: null, parentId: null },
  notes: { content: '', category: null, tags: [], pinned: false },
  schedules: { description: null, location: null, endTime: null, allDay: false, googleEventId: null },
  reminders: { sent: false, recurrence: 'NONE', taskId: null },
  focusSessions: { taskId: null, endedAt: null, seconds: 0, plannedSeconds: null },
  habits: { description: null },
  habitLogs: {},
  taskShares: { role: 'VIEW' },
  aiUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  googleAccounts: { accessToken: null, expiryDate: null, calendarId: 'primary', syncToken: null, lastSyncedAt: null },
  users: { name: null, tokenVersion: 0, role: 'USER', status: 'ACTIVE', plan: 'FREE', planRenewsAt: null, lastActiveAt: null },
};

function matchCondition(value, cond) {
  if (cond === null) return value === null || value === undefined;
  if (typeof cond !== 'object' || cond instanceof Date) {
    return value instanceof Date && cond instanceof Date
      ? value.getTime() === cond.getTime()
      : value === cond;
  }
  // Operator object
  return Object.entries(cond).every(([op, operand]) => {
    switch (op) {
      case 'equals':
        return value === operand;
      case 'not':
        return value !== operand;
      case 'in':
        return operand.includes(value);
      case 'has':
        return Array.isArray(value) && value.includes(operand);
      case 'contains': {
        if (typeof value !== 'string') return false;
        return cond.mode === 'insensitive'
          ? value.toLowerCase().includes(String(operand).toLowerCase())
          : value.includes(operand);
      }
      case 'mode':
        return true; // handled alongside contains
      case 'lt':
        return value < operand;
      case 'lte':
        return value <= operand;
      case 'gt':
        return value > operand;
      case 'gte':
        return value >= operand;
      default:
        return false;
    }
  });
}

function matchWhere(record, where) {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return cond.some((c) => matchWhere(record, c));
    if (key === 'AND') return cond.every((c) => matchWhere(record, c));
    if (key === 'NOT') return !matchWhere(record, cond);
    return matchCondition(record[key], cond);
  });
}

function applyOrderBy(rows, orderBy) {
  if (!orderBy) return rows;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const clause of clauses) {
      const [field, dir] = Object.entries(clause)[0];
      let av = a[field];
      let bv = b[field];
      if (av instanceof Date) av = av.getTime();
      if (bv instanceof Date) bv = bv.getTime();
      if (av === bv) continue;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = av < bv ? -1 : 1;
      return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

// Resolve `include` for the self-relation used by tasks (subtasks/parent). Other
// relations aren't exercised by the controllers, so only these two are handled.
function applyInclude(records, include, allRows) {
  if (!include) return records;
  return records.map((r) => {
    const out = { ...r };
    for (const [rel, opt] of Object.entries(include)) {
      if (!opt) continue;
      if (rel === 'subtasks') {
        let kids = allRows.filter((x) => x.parentId === r.id);
        if (opt.orderBy) kids = applyOrderBy(kids, opt.orderBy);
        out.subtasks = kids;
      } else if (rel === 'parent') {
        out.parent = allRows.find((x) => x.id === r.parentId) || null;
      }
    }
    return out;
  });
}

// Project a row down to the requested fields, so a controller that reads a column it
// did not select fails here the same way it would against a real projected query.
function applySelect(records, select) {
  if (!select) return records;
  const fields = Object.entries(select)
    .filter(([, on]) => on)
    .map(([field]) => field);
  return records.map((r) => Object.fromEntries(fields.map((f) => [f, r[f]])));
}

function makeModel(name) {
  const rows = [];
  const defaults = modelDefaults[name] || {};
  return {
    __rows: rows,
    findUnique: async ({ where }) => {
      const [field, val] = Object.entries(where)[0];
      return rows.find((r) => r[field] === val) || null;
    },
    findFirst: async ({ where, orderBy, include, select } = {}) => {
      const filtered = rows.filter((r) => matchWhere(r, where));
      const found = applyOrderBy(filtered, orderBy)[0] || null;
      if (!found) return null;
      if (include) return applyInclude([found], include, rows)[0];
      return applySelect([found], select)[0];
    },
    findMany: async ({ where, orderBy, include, select, take, skip } = {}) => {
      const filtered = rows.filter((r) => matchWhere(r, where));
      let ordered = applyOrderBy(filtered, orderBy);
      if (skip != null) ordered = ordered.slice(skip);
      if (take != null) ordered = ordered.slice(0, take);
      return include ? applyInclude(ordered, include, rows) : applySelect(ordered, select);
    },
    count: async ({ where } = {}) => rows.filter((r) => matchWhere(r, where)).length,
    // Minimal aggregate: enough for the admin metrics/drill-down (_count + _sum).
    aggregate: async ({ where, _sum, _count } = {}) => {
      const filtered = rows.filter((r) => matchWhere(r, where));
      const out = {};
      if (_count) out._count = filtered.length;
      if (_sum) {
        out._sum = {};
        for (const key of Object.keys(_sum)) {
          out._sum[key] = filtered.reduce((acc, r) => acc + Number(r[key] || 0), 0);
        }
      }
      return out;
    },
    create: async ({ data }) => {
      const now = new Date();
      const row = {
        id: data.id || nextId(),
        createdAt: now,
        updatedAt: now,
        ...defaults,
        ...data,
      };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) {
        const err = new Error('Record not found');
        err.code = 'P2025';
        throw err;
      }
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
    delete: async ({ where }) => {
      const idx = rows.findIndex((r) => r.id === where.id);
      if (idx === -1) {
        const err = new Error('Record not found');
        err.code = 'P2025';
        throw err;
      }
      const [removed] = rows.splice(idx, 1);
      // Cascade self-relation children (subtasks) as the DB does on parent delete.
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].parentId === removed.id) rows.splice(i, 1);
      }
      return removed;
    },
    // Compound-unique `where` keys arrive as { field_field: { field, field } };
    // flatten them so the same matcher handles both forms.
    upsert: async ({ where, create, update }) => {
      const flat = {};
      for (const [key, val] of Object.entries(where)) {
        if (val && typeof val === 'object' && !(val instanceof Date) && key.includes('_')) {
          Object.assign(flat, val);
        } else {
          flat[key] = val;
        }
      }
      const existing = rows.find((r) => matchWhere(r, flat));
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return existing;
      }
      const now = new Date();
      const row = { id: nextId(), createdAt: now, updatedAt: now, ...defaults, ...create };
      rows.push(row);
      return row;
    },
    updateMany: async ({ where, data } = {}) => {
      const matched = rows.filter((r) => matchWhere(r, where));
      matched.forEach((r) => Object.assign(r, data, { updatedAt: new Date() }));
      return { count: matched.length };
    },
    deleteMany: async ({ where } = {}) => {
      const toRemove = rows.filter((r) => matchWhere(r, where));
      toRemove.forEach((r) => rows.splice(rows.indexOf(r), 1));
      return { count: toRemove.length };
    },
  };
}

function createFakePrisma() {
  return {
    user: makeModel('users'),
    task: makeModel('tasks'),
    note: makeModel('notes'),
    schedule: makeModel('schedules'),
    reminder: makeModel('reminders'),
    focusSession: makeModel('focusSessions'),
    habit: makeModel('habits'),
    habitLog: makeModel('habitLogs'),
    taskShare: makeModel('taskShares'),
    aiUsage: makeModel('aiUsage'),
    googleAccount: makeModel('googleAccounts'),
    $queryRaw: async () => [],
    $executeRaw: async () => 0,
    $disconnect: async () => {},
  };
}

module.exports = { createFakePrisma, matchWhere };
