'use strict';

const prisma = require('../models/prisma');
const ApiError = require('../utils/ApiError');
const {
  createNoteSchema,
  updateNoteSchema,
  listNoteQuerySchema,
} = require('../validators/note.schema');

let onNoteChanged = null;
function setNoteChangeHook(fn) {
  onNoteChanged = fn;
}

async function list(req, res) {
  const q = listNoteQuerySchema.parse(req.query);

  const where = { userId: req.user.id };
  if (q.category) where.category = q.category;
  if (q.tag) where.tags = { has: q.tag };
  if (q.pinned !== undefined) where.pinned = q.pinned;
  if (q.q) {
    where.OR = [
      { title: { contains: q.q, mode: 'insensitive' } },
      { content: { contains: q.q, mode: 'insensitive' } },
    ];
  }

  const notes = await prisma.note.findMany({
    where,
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
  });
  res.json({ notes });
}

async function getOwnedNote(userId, id) {
  const note = await prisma.note.findFirst({ where: { id, userId } });
  if (!note) throw ApiError.notFound('Note not found');
  return note;
}

async function getOne(req, res) {
  const note = await getOwnedNote(req.user.id, req.params.id);
  res.json({ note });
}

async function create(req, res) {
  const data = createNoteSchema.parse(req.body);
  const note = await prisma.note.create({
    data: {
      ...data,
      content: data.content || '',
      tags: data.tags || [],
      userId: req.user.id,
    },
  });
  if (onNoteChanged) onNoteChanged(note).catch(() => {});
  res.status(201).json({ note });
}

async function update(req, res) {
  const data = updateNoteSchema.parse(req.body);
  await getOwnedNote(req.user.id, req.params.id);
  const note = await prisma.note.update({ where: { id: req.params.id }, data });
  if (onNoteChanged) onNoteChanged(note).catch(() => {});
  res.json({ note });
}

async function togglePin(req, res) {
  const existing = await getOwnedNote(req.user.id, req.params.id);
  const note = await prisma.note.update({
    where: { id: req.params.id },
    data: { pinned: !existing.pinned },
  });
  res.json({ note });
}

async function remove(req, res) {
  await getOwnedNote(req.user.id, req.params.id);
  await prisma.note.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

module.exports = { list, getOne, create, update, togglePin, remove, setNoteChangeHook };
