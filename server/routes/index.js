'use strict';

const express = require('express');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'server', time: new Date().toISOString() });
});

// Feature routers are mounted here as later phases add them.
router.use('/auth', require('./auth.routes'));
router.use('/tasks', require('./task.routes'));
router.use('/notes', require('./note.routes'));
router.use('/schedules', require('./schedule.routes'));
router.use('/reminders', require('./reminder.routes'));
router.use('/calendar', require('./calendar.routes'));
router.use('/google', require('./google.routes'));
router.use('/ai', require('./ai.routes'));
router.use('/analytics', require('./analytics.routes'));
router.use('/focus', require('./focus.routes'));
router.use('/documents', require('./document.routes'));
router.use('/habits', require('./habit.routes'));
router.use('/search', require('./search.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;
