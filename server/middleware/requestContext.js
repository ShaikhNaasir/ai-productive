'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

// Carries per-request data (currently the authenticated userId) so deep helpers
// like the AI client can attribute work to a user without threading it through
// every call site (Roadmap C3).
const storage = new AsyncLocalStorage();

// Run the rest of the request within a fresh context store.
function requestContext(req, res, next) {
  storage.run({ userId: null }, () => next());
}

function setUserId(userId) {
  const store = storage.getStore();
  if (store) store.userId = userId;
}

function getUserId() {
  const store = storage.getStore();
  return store ? store.userId : null;
}

module.exports = { requestContext, setUserId, getUserId };
