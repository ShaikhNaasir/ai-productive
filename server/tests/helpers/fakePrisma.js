'use strict';

// Minimal in-memory Prisma stand-in covering the query surface used by controllers.
// Supports: findUnique, findFirst, findMany (where + orderBy), create, update, delete, count.

let counter = 1;
const nextId = () => String(counter++);

const modelDefaults = {
  tasks: { priority: 'MEDIUM', status: 'PENDING', recurrence: 'NONE', tags: [], description: null, dueDate: null, completedAt: null, parentId: null },
  notes: { content: '', category: null, tags: [], pinned: false },
  schedules: { description: null, location: null, endTime: null, googleEventId: null },
  reminders: { sent: false, recurrence: 'NONE', taskId: null },
  focusSessions: { taskId: null, endedAt: null, seconds: 0 },
  habits: { description: null },
  habitLogs: {},
  taskShares: { role: 'VIEW' },
  aiUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  googleAccounts: { accessToken: null, expiryDate: null, calendarId: 'primary', syncToken: null, lastSyncedAt: null },
  users: { name: null },
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

function makeModel(name) {
  const rows = [];
  const defaults = modelDefaults[name] || {};
  return {
    __rows: rows,
    findUnique: async ({ where }) => {
      const [field, val] = Object.entries(where)[0];
      return rows.find((r) => r[field] === val) || null;
    },
    findFirst: async ({ where, include } = {}) => {
      const found = rows.find((r) => matchWhere(r, where)) || null;
      if (!found) return null;
      return include ? applyInclude([found], include, rows)[0] : found;
    },
    findMany: async ({ where, orderBy, include } = {}) => {
      const filtered = rows.filter((r) => matchWhere(r, where));
      const ordered = applyOrderBy(filtered, orderBy);
      return applyInclude(ordered, include, rows);
    },
    count: async ({ where } = {}) => rows.filter((r) => matchWhere(r, where)).length,
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
