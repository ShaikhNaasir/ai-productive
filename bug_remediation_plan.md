# Bug Remediation Plan

**Generated:** 2026-09-07 · **Branch:** `claude/beautiful-einstein-5cti83` · **Base commit:** `7c1528b`

Automated audit of the AI-Powered Personal Productivity Assistant repository.

> ## ⛔ AWAITING APPROVAL — NOTHING HAS BEEN CHANGED
>
> This file is the audit output only. No source file was modified. Approve the
> items you want fixed (all, or a subset by ID) before any code-writing starts.

> ### ⚠️ Two findings are exploitable today and were reproduced, not merely read
>
> - **[BUG-01](#bug-01)** — the 2FA challenge token authenticates every API route.
>   Anyone with a password logs in **without** the second factor. 2FA is currently
>   decorative for any account that has never logged out or changed its password.
> - **[BUG-02](#bug-02)** — `POST /api/billing/verify` never checks that the
>   subscription belongs to the caller. One paid signature upgrades unlimited
>   accounts to PAID.
>
> Both were confirmed by running them against the app (transcript in
> [Reproductions](#reproductions)). They are independent of each other.

---

## Scope of this audit

The previous audit (`bug_remediation_plan.md`, 2026-08-17, 24 items) shipped in full
to `main` via PR #1. Since then the repo has gained **Tiers C–G**: the admin panel
(D1–D4), SaaS billing (D5), email verification (E1), TOTP two-factor auth (E2),
global rate limiting (F1), auth hardening (F2–F3), and persisted notifications (G1).

None of that code existed when the last audit ran. **This audit targets it**, and
re-checks the shared surfaces (auth middleware, realtime, schedulers, quotas) that
the new features now feed into. All 24 previously fixed items were spot-checked and
remain fixed; none has regressed.

## Baseline health (measured, 2026-09-07)

| Check | Result |
| --- | --- |
| `server && npm test` (Jest) | ✅ 32 suites, 251 tests passing |
| `server && npm run lint` | ✅ clean |
| `server && npm audit --omit=dev` | ⚠️ **3 moderate** (production deps) — see [BUG-09](#bug-09) |
| `client && npm test` (Vitest) | ❌ **1 failing** of 60 (24 files) — see [BUG-03](#bug-03) |
| `client && npm run lint` | ✅ clean |
| `client && npm run build` | ✅ OK (Vite 8, chunking intact) |
| `client && npm audit` | ✅ 0 vulnerabilities |
| `ai-service && pytest` | ✅ 38 passing |

Note: the container ships no `.venv`, and `pip install -r requirements.txt` must run
before pytest. On Linux the interpreter is `.venv/bin/python`, not the
`.venv/Scripts/python` documented in `CLAUDE.md` — see [BUG-14](#bug-14).

Except for BUG-03, **every finding below is a latent defect the existing suites do
not cover.** The suites are green over them.

## Summary

| ID | Severity | Area | Issue | Difficulty |
| --- | --- | --- | --- | --- |
| [BUG-01](#bug-01) | 🔴 **Critical** | server/auth | 2FA challenge token is accepted as a full session token — second factor bypassed | 🟢 Easy |
| [BUG-02](#bug-02) | 🔴 **High** | server/billing | `/billing/verify` never binds the subscription to the caller — one signature upgrades any number of accounts | 🟢 Easy |
| [BUG-03](#bug-03) | 🟠 Medium | client/tests | Billing test fails: Vitest 4 forbids `new` on an arrow-function mock | 🟢 Easy |
| [BUG-04](#bug-04) | 🟠 Medium | server/rate-limit | `apiLimiter` never keys by user id — the branch is dead, every user shares an IP bucket | 🟢 Easy |
| [BUG-05](#bug-05) | 🟠 Medium | server/rate-limit | IPv6 clients bypass the global limiter by rotating addresses in their own /64 | 🟢 Easy |
| [BUG-06](#bug-06) | 🟠 Medium | server/ai | AI task endpoints skip `assertWithinQuota` — free plan caps bypassed | 🟢 Easy |
| [BUG-07](#bug-07) | 🟠 Medium | server/realtime | Socket handshake lacks the DISABLED/DELETED status check that HTTP auth has | 🟢 Easy |
| [BUG-08](#bug-08) | 🟠 Medium | server/email | User-controlled `name` interpolated raw into verification email HTML | 🟢 Easy |
| [BUG-09](#bug-09) | 🟠 Medium | server/deps | 3 moderate advisories in production deps (`qs` → `body-parser` → `express`) | 🟢 Easy |
| [BUG-10](#bug-10) | 🟡 Low | server/billing | Webhook dedupe is check-then-insert — a redelivery race 500s | 🟡 Moderate |
| [BUG-11](#bug-11) | 🟡 Low | server/auth | `tfaFailures` map grows without bound (slow memory leak) | 🟢 Easy |
| [BUG-12](#bug-12) | 🟡 Low | server/admin | `activeToday` uses server-local midnight while every sibling metric is UTC | 🟢 Easy |
| [BUG-13](#bug-13) | 🟡 Low | server/ai | `/ai/usage` pulls every row into memory to aggregate | 🟡 Moderate |
| [BUG-14](#bug-14) | 🟡 Low | docs | `CLAUDE.md` documents a Windows-only pytest path; no venv bootstrap step | 🟢 Easy |
| [BUG-15](#bug-15) | 🟡 Low | ai-service | Model catalog is stale — default is Opus 4.8; Opus 5 unpriced in `aiCost.js` | 🟢 Easy |

Difficulty: 🟢 Easy (< 1h, local change + test) · 🟡 Moderate (touches a flow or schema).

---

<a id="bug-01"></a>
## BUG-01 · 🔴 Critical — 2FA challenge token authenticates every API route

**Files:** `server/controllers/auth.controller.js:148`, `server/middleware/auth.js:29`,
`server/realtime.js:26`

### Root cause

After a correct password, an account with 2FA enabled gets a *challenge* token that
is only supposed to be exchangeable at `POST /api/auth/2fa/login`:

```js
// auth.controller.js — login()
if (account.twoFactorEnabled) {
  const challengeToken = signToken({ sub: account.id, purpose: '2fa' }, { expiresIn: CHALLENGE_TTL });
  return res.json({ twoFactorRequired: true, challengeToken });
}
```

It is signed with **the same secret** as a real session token and differs only by
carrying `purpose: '2fa'` and omitting the `ver` claim. `requireAuth` checks neither:

```js
// middleware/auth.js — requireAuth()
const user = await prisma.user.findUnique({ where: { id: payload.sub } });
if (!user || (payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {   // ← ver is absent → 0
  return next(ApiError.unauthorized('Session expired. Please sign in again.'));
}
```

`payload.ver ?? 0` coerces the missing claim to `0`, and a fresh user's
`tokenVersion` **is** `0` (`schema.prisma` default, mirrored in
`tests/helpers/fakePrisma.js`). The versions match, no `purpose` check runs, and the
challenge token is a valid session for its full 5-minute TTL.

So an attacker holding only the password calls `POST /api/auth/login`, ignores the
2FA prompt, and uses the returned `challengeToken` as an ordinary `Bearer` token.
Confirmed against `/api/auth/me` and `/api/tasks` — both **200**.

Two aggravating details:

- The same hole exists in `realtime.js:26`, so the challenge token also opens an
  authenticated websocket.
- It fails closed only for accounts whose `tokenVersion` has drifted above 0 (one
  logout or password change). **Every account that has never done either is exposed** —
  which includes every newly registered account, i.e. exactly the accounts most
  likely to have just enrolled in 2FA.

### Remediation

Make the two token classes non-interchangeable. Two independent changes, both cheap;
apply both (defence in depth).

**1 — Reject non-session tokens at the gate.** In `server/middleware/auth.js`, right
after `verifyToken`:

```js
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return next(ApiError.unauthorized('Invalid or expired token'));
  }

  // A scoped token (e.g. the 2FA login challenge) is NOT a session. It is signed
  // with the same secret and omits `ver`, so without this it would authenticate
  // any account still on tokenVersion 0.
  if (payload.purpose) {
    return next(ApiError.unauthorized('Invalid or expired token'));
  }
```

Apply the identical guard in `server/realtime.js` inside `authenticateSocket`, after
its own `verifyToken`.

**2 — Stop treating a missing `ver` as 0.** Same file; require the claim to be
present on a session token:

```js
-    if (!user || (payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
+    if (!user || typeof payload.ver !== 'number' || payload.ver !== (user.tokenVersion ?? 0)) {
```

`issueToken` already always sets `ver`, so no legitimate session token is affected.
Note this invalidates any session token issued before the change *only* if one was
ever minted without `ver` — none is.

**3 — Bind the challenge to the token version too**, so a challenge issued before a
password change cannot still be redeemed. In `auth.controller.js`:

```js
-    const challengeToken = signToken({ sub: account.id, purpose: '2fa' }, { expiresIn: CHALLENGE_TTL });
+    const challengeToken = signToken(
+      { sub: account.id, purpose: '2fa', ver: account.tokenVersion ?? 0 },
+      { expiresIn: CHALLENGE_TTL }
+    );
```

and in `loginTwoFactor`, alongside the existing `purpose` check:

```js
   if (payload.purpose !== '2fa') {
     throw ApiError.unauthorized('Invalid login challenge.');
   }
   const user = await prisma.user.findUnique({ where: { id: payload.sub } });
   if (!user || !user.twoFactorEnabled) {
     throw ApiError.unauthorized('Invalid login challenge.');
   }
+  if ((payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
+    throw ApiError.unauthorized('Your login session expired. Please sign in again.');
+  }
```

### Tests to add (`server/tests/twoFactor.test.js`)

```js
test('a 2FA challenge token cannot be used as a session token', async () => {
  // ...enroll 2FA, then password-login to get the challenge
  const { challengeToken } = (await login('tfa@b.com')).body;
  for (const path of ['/api/auth/me', '/api/tasks', '/api/notes']) {
    const res = await request(app).get(path).set(bearer(challengeToken));
    expect(res.status).toBe(401);
  }
});

test('a challenge issued before a password change is no longer redeemable', async () => { /* ... */ });
```

Plus a `realtime.test.js` case asserting `authenticateSocket` rejects a
`purpose: '2fa'` token.

**Difficulty:** 🟢 Easy — three small edits, no schema change, no client change.

---

<a id="bug-02"></a>
## BUG-02 · 🔴 High — `/billing/verify` upgrades a caller for someone else's subscription

**File:** `server/controllers/billing.controller.js:60-79`

### Root cause

`verify` checks that the signature is internally consistent, then writes `PAID` to
**whoever sent the request**:

```js
if (!razorpay.verifyPaymentSignature({ paymentId, subscriptionId, signature })) {
  throw ApiError.badRequest('Payment verification failed');
}
const updated = await prisma.user.update({
  where: { id: req.user.id },                                     // ← the caller
  data: { plan: 'PAID', subscriptionStatus: 'active', razorpaySubscriptionId: subscriptionId },
});
```

`verifyPaymentSignature` is an HMAC over `paymentId|subscriptionId`. It proves the
*payment* is genuine. It says **nothing about who paid**. Nothing ties
`subscriptionId` back to the subscription this user opened at `checkout` — which is
already stored on the row as `razorpaySubscriptionId` and is simply never consulted.

Consequences, in order of likelihood:

1. One customer pays once, then shares the three values (they are handed to the
   browser by Razorpay Checkout, so the payer sees them in devtools). Every recipient
   POSTs them and becomes PAID. The signature stays valid indefinitely — there is no
   nonce and no replay window.
2. Each such write also stamps the *payer's* `razorpaySubscriptionId` onto the
   freeloader's row. `applySubscriptionEvent` then resolves that subscription with
   `prisma.user.findFirst({ where: { razorpaySubscriptionId: entity.id } })` — an
   arbitrary pick among the duplicates. When the real payer cancels, the downgrade
   webhook may land on a stranger's account and leave the payer PAID, or vice versa.

Reproduced: a second account with no subscription of its own POSTed a foreign triple
and got **200 `{"plan":"PAID"}`**.

### Remediation

Bind the verification to the subscription this user actually opened.

```js
async function verify(req, res) {
  const {
    razorpay_payment_id: paymentId,
    razorpay_subscription_id: subscriptionId,
    razorpay_signature: signature,
  } = req.body || {};
  if (!paymentId || !subscriptionId || !signature) {
    throw ApiError.badRequest('Missing payment verification fields');
  }

  // The signature proves the payment is genuine, not that it is THIS user's. Only
  // the subscription opened by this account at /checkout may upgrade it — otherwise
  // one shared payment triple upgrades unlimited accounts.
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user?.razorpaySubscriptionId || user.razorpaySubscriptionId !== subscriptionId) {
    throw ApiError.badRequest('Payment verification failed');
  }

  if (!razorpay.verifyPaymentSignature({ paymentId, subscriptionId, signature })) {
    throw ApiError.badRequest('Payment verification failed');
  }

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { plan: 'PAID', subscriptionStatus: 'active' },   // subscription id already set at checkout
  });
  res.json({ plan: 'PAID', planRenewsAt: updated.planRenewsAt });
}
```

Note the ownership check runs **before** the HMAC and returns the same message, so
the endpoint does not become an oracle for which subscription ids are live.

**Recommended follow-up (same slice):** make `razorpaySubscriptionId` unique in
`schema.prisma` so the duplicate state this bug creates cannot recur, and so
`applySubscriptionEvent` resolves one row deterministically:

```prisma
  razorpaySubscriptionId String? @unique
```

Render applies this via `prisma db push` per the existing convention. **Check for
existing duplicates before pushing** — if this bug has already been exercised in
production the constraint will fail to apply until they are reconciled.

### Tests to add (`server/tests/billing.test.js`)

```js
test('verify rejects a subscription the caller did not open', async () => {
  jest.spyOn(razorpay, 'verifyPaymentSignature').mockReturnValue(true);
  const res = await request(app).post('/api/billing/verify').set(bearer(otherUserToken))
    .send({ razorpay_payment_id: 'pay_x', razorpay_subscription_id: 'sub_not_mine', razorpay_signature: 'sig' });
  expect(res.status).toBe(400);
});

test('verify accepts the subscription stored at checkout', async () => { /* ... */ });
```

**Difficulty:** 🟢 Easy for the controller fix; the unique constraint adds a
data-reconciliation check before deploy.

---

<a id="bug-03"></a>
## BUG-03 · 🟠 Medium — client suite is red: Vitest 4 rejects `new` on an arrow-function mock

**File:** `client/src/test/billing.test.jsx:46`

### Root cause

This is the one finding that is **failing right now**, not latent:

```
FAIL  src/test/billing.test.jsx > BillingCard (D5) > starts checkout and opens Razorpay when Upgrade is clicked
AssertionError: expected "vi.fn()" to be called at least once
```

The rendered card shows the real error the component caught:
`() => ({ open }) is not a constructor`, and Vitest logs
`The vi.fn() mock did not use 'function' or 'class' in its implementation`.

The test stubs the Razorpay global with an arrow function:

```js
const open = vi.fn();
window.Razorpay = vi.fn(() => ({ open }));   // ← arrow function: not constructible
```

`Settings.jsx:160` calls `new Razorpay({...})`. Arrow functions have no `[[Construct]]`
slot, so `new` throws a `TypeError`. Under Vitest 3 `vi.fn()` wrapped the
implementation in a constructible function and this happened to work; Vitest 4
(`"vitest": "^4.1.10"`, floating) calls the implementation directly and it does not.
A minor-version bump of a `^`-ranged devDependency turned the suite red — **the
production code is correct and unchanged**.

### Remediation

Make the mock constructible. Fix the test, not `Settings.jsx`.

```js
-    const open = vi.fn();
-    window.Razorpay = vi.fn(() => ({ open }));
+    const open = vi.fn();
+    // Settings.jsx calls `new Razorpay(...)`. Vitest 4 invokes a mock's
+    // implementation directly, so it must be constructible — an arrow function
+    // is not, and `new` on it throws "is not a constructor".
+    window.Razorpay = vi.fn(function Razorpay() {
+      return { open };
+    });
```

A constructor returning an object overrides `this`, so `new Razorpay(...)` still
yields `{ open }` and the existing `toHaveBeenCalledWith(...)` assertion on
`window.Razorpay` is unaffected.

Add `afterEach(() => { delete window.Razorpay; })` while here — the global currently
leaks into the third test in the file.

**Verify:** `cd client && npx vitest run src/test/billing.test.jsx` → 3 passed, then
the full suite → 60 passed.

**Consider (separate, optional):** pin `vitest` and `vite` to exact versions in
`client/package.json`. A floating `^` on a test runner is what let this land without
a code change.

**Difficulty:** 🟢 Easy.

---

<a id="bug-04"></a>
## BUG-04 · 🟠 Medium — the global limiter never keys by user id

**Files:** `server/middleware/rateLimit.js:26`, `server/app.js:46`

### Root cause

`apiLimiter` is documented as per-user with an IP fallback:

```js
// Keyed by user id once authenticated, otherwise by IP.
keyGenerator: (req) => (req.user && req.user.id ? req.user.id : req.ip),
```

But it is mounted **before** anything that populates `req.user`:

```js
// app.js
app.use('/api', apiLimiter);          // ← here req.user is always undefined
app.use('/api/auth', authLimiter);
// ...
app.use('/api', requestContext, routes);   // ← requireAuth runs inside these routers
```

`requireAuth` lives on the individual feature routers, several middleware layers
later. The `req.user.id` branch is therefore **dead code** and every request keys by
IP. Two consequences:

- Users sharing an egress IP — an office, a school, a mobile carrier NAT, a corporate
  VPN — share one 200-req/min bucket and throttle each other. On a normal SPA that
  fires several requests per page this is reachable with a handful of colleagues.
- A single authenticated abuser is limited only per-IP, so rotating IPs sidesteps the
  cap the comment claims to provide.

### Remediation

Split into two limiters and mount the per-user one where `req.user` exists.

In `server/middleware/rateLimit.js`, key the global limiter honestly by IP:

```js
const { ipKeyGenerator } = require('express-rate-limit');

// Pre-auth, so there is no user id here — this is deliberately an IP-only net.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),   // see BUG-05
  message: { error: { message: 'Too many requests. Please slow down and try again shortly.' } },
});

// Per-account cap. Mounted after requireAuth (see routes/index.js), so req.user is set.
const userLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.USER_RATE_LIMIT_MAX || '300', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `u:${req.user.id}` : ipKeyGenerator(req.ip)),
  message: { error: { message: 'Too many requests. Please slow down and try again shortly.' } },
});
```

Then raise the IP ceiling (it now covers whole offices) and mount `userLimiter`
inside the authenticated routers. The simplest wiring that does not touch 16 route
files is a small shared chain in `routes/index.js`, applied after each router's own
`requireAuth`; alternatively mount it per-router next to `requireAuth`. Confirm the
choice during implementation — it is the only judgement call in this fix.

Keep both disabled under `config.isTest`, as today.

### Test to add (`server/tests/apiLimiter.test.js`)

The existing suite only covers the IP path. Add a case that two different
authenticated users on the same IP do **not** consume each other's budget.

**Difficulty:** 🟢 Easy for the limiter change; the mount point needs one decision.

---

<a id="bug-05"></a>
## BUG-05 · 🟠 Medium — IPv6 clients bypass the global rate limit

**File:** `server/middleware/rateLimit.js:26`

### Root cause

`express-rate-limit` v8 emits this on every boot — it appears seven times in a clean
`npm test` run:

```
ValidationError: Custom keyGenerator appears to use request IP without calling the
ipKeyGenerator helper function for IPv6 addresses. This could allow IPv6 users to
bypass limits.  code: 'ERR_ERL_KEY_GEN_IPV6'
```

Using `req.ip` verbatim keys on a single IPv6 *address*. An IPv6 client is routinely
allocated a /64 — 2^64 addresses — and can source each request from a different one,
getting a fresh bucket every time. The library's `ipKeyGenerator` normalises IPv6 to
its /64 prefix so the whole allocation shares one bucket; IPv4 is passed through
unchanged.

The warning is currently drowned in test output, which is why it has gone unnoticed.

### Remediation

Wrap every raw `req.ip` use (this is the same edit shown in BUG-04 — apply once):

```js
+const { ipKeyGenerator } = require('express-rate-limit');
...
-  keyGenerator: (req) => (req.user && req.user.id ? req.user.id : req.ip),
+  keyGenerator: (req) => ipKeyGenerator(req.ip),
```

`authLimiter` and `aiLimiter` are unaffected: `authLimiter` passes no `keyGenerator`
(the library's default already handles IPv6), and `aiLimiter` keys on user id.

**Verify:** `cd server && npm test` — the `ERR_ERL_KEY_GEN_IPV6` stack traces
disappear. Consider failing CI on that string so it cannot silently return.

**Difficulty:** 🟢 Easy.

---

<a id="bug-06"></a>
## BUG-06 · 🟠 Medium — AI task creation bypasses plan quotas

**File:** `server/controllers/ai.controller.js:47`, `:79`

### Root cause

`assertWithinQuota` guards the three ordinary creation paths:

```
controllers/task.controller.js:86      await assertWithinQuota(req.user, 'tasks');
controllers/note.controller.js:51      await assertWithinQuota(req.user, 'notes');
controllers/document.controller.js:37  await assertWithinQuota(req.user, 'notes');
```

It is absent from `ai.controller.js`, which creates tasks in two places:

- `createTaskFromText` (`POST /api/ai/tasks`) — one task per call, no cap check.
- `breakdownTask` (`POST /api/ai/tasks/:id/breakdown`) — up to **7** child tasks per
  call, no cap check.

`ai.routes.js` applies `requireAuth`, `requireVerified`, `aiLimiter` and
`enforceAiBudget` — cost and rate controls, but nothing that counts rows. A FREE user
capped at 100 tasks passes it freely through the AI endpoints. The AI budget is a
weak proxy: at ~$2/month of `parse-task` calls a user can create hundreds of tasks.

Second, subtler leak in `breakdownTask`: subtasks are created for `task.userId` (the
owner), but the endpoint is open to an **EDIT-shared** user. A sharee can therefore
inflate the owner's row count against the owner's plan — a check on `req.user` alone
would still be wrong there.

### Remediation

Guard both handlers, charging the quota to the account that will own the rows.

```js
 const { getAccessibleTask } = require('../services/taskAccess');
+const { assertWithinQuota } = require('../services/quota');
```

In `createTaskFromText`, before the LLM call (fail fast — do not pay for a call whose
result cannot be stored):

```js
 async function createTaskFromText(req, res) {
   const { text } = textSchema.parse(req.body);
+  await assertWithinQuota(req.user, 'tasks');
   const parsed = await aiClient.parseTask(text, new Date().toISOString());
```

In `breakdownTask`, the owner pays. `assertWithinQuota` takes a user object and reads
`plan` / `planRenewsAt` via `effectivePlan`, so load the owner when the caller is a
sharee:

```js
   const task = await getAccessibleTask(req.user.id, req.params.id, { edit: true });
   if (task.parentId) throw ApiError.badRequest('Cannot break down a subtask');
+  // Subtasks are created for the task's OWNER, so they count against the owner's
+  // plan, not the sharee's. Check once up front for the whole batch.
+  const owner =
+    task.userId === req.user.id
+      ? req.user
+      : await prisma.user.findUnique({ where: { id: task.userId } });
+  await assertWithinQuota(owner, 'tasks');
```

A single pre-check is a deliberate simplification: a breakdown may cross the cap by
up to six rows. Checking inside the loop and aborting mid-batch would leave a
partially expanded task, which is worse. If exactness matters, compare
`count + titles.length` against the cap after validating the AI output and before
the first `create`.

### Tests to add (`server/tests/ai.test.js`)

```js
test('AI task creation is refused at the plan cap', async () => { /* seed 100 tasks → expect 402 */ });
test('breakdown charges the owner quota, not the sharee', async () => { /* ... */ });
```

**Difficulty:** 🟢 Easy.

---

<a id="bug-07"></a>
## BUG-07 · 🟠 Medium — socket handshake skips the account-status check

**File:** `server/realtime.js:26-31`

### Root cause

`requireAuth` blocks a disabled or deleted account even when its token is otherwise
valid:

```js
// middleware/auth.js
if (user.status === 'DISABLED' || user.status === 'DELETED') {
  return next(ApiError.forbidden('This account is not active.'));
}
```

`authenticateSocket` checks the token version but **not** the status:

```js
// realtime.js
const user = await prisma.user.findUnique({ where: { id: payload.sub } });
if (!user || (payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
  return next(new Error('Session expired'));
}
socket.userId = user.id;
```

Today this is masked: `disableUser` and the soft `deleteUser` both bump
`tokenVersion`, so existing tokens fail the version check anyway. The gap is real but
narrow — it opens whenever a status reaches `DISABLED`/`DELETED` without a version
bump: a direct DB edit, a data migration, a support script, or any future admin path
that forgets the bump. The two auth surfaces are supposed to mirror each other (the
comment above `authenticateSocket` says exactly that), and one of them silently does
not.

### Remediation

Mirror the blocklist:

```js
     const user = await prisma.user.findUnique({ where: { id: payload.sub } });
     if (!user || (payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
       return next(new Error('Session expired'));
     }
+    // Mirror requireAuth: a disabled/deleted account is locked out everywhere, not
+    // only over HTTP. (Blocklist, not `!== ACTIVE`, so a row with a missing status
+    // is never accidentally locked out.)
+    if (user.status === 'DISABLED' || user.status === 'DELETED') {
+      return next(new Error('This account is not active.'));
+    }
     socket.userId = user.id;
```

Apply the BUG-01 `purpose` guard in the same edit — both land in this function.

### Test to add (`server/tests/realtime.test.js`)

```js
test('a DISABLED user cannot open a socket even with a version-matching token', async () => { /* ... */ });
```

**Difficulty:** 🟢 Easy.

---

<a id="bug-08"></a>
## BUG-08 · 🟠 Medium — user-controlled name is interpolated raw into email HTML

**File:** `server/services/mailer.js:26-27`

### Root cause

```js
function verificationHtml(name, link) {
  const hi = name ? `Hi ${name},` : 'Hi,';
  return `
    ...
      <p>${hi}</p>
```

`name` comes straight from `registerSchema` / `updateProfileSchema`, which validate
only `z.string().trim().min(1).max(100)` — no character restriction. A name of
`<a href="https://evil.example">Click here to secure your account</a>` is embedded as
live markup in the outgoing email.

Severity is bounded by who receives it: the verification email goes to the address on
the account, so an attacker can currently only inject into mail they receive
themselves. It matters because (a) the pattern is one template away from a
user-to-user email — any future share/invite/digest mail would be directly
exploitable; (b) injected markup can break the template or forge trusted-looking
content for a phishing screenshot; and (c) `link` is interpolated the same way, so
the template has no escaping discipline at all.

### Remediation

Escape every interpolated value. No dependency needed:

```js
+// Escape untrusted values before they go into an HTML email body. `name` is
+// user-controlled and validated only for length, so it can carry live markup.
+function escapeHtml(value) {
+  return String(value ?? '')
+    .replace(/&/g, '&amp;')
+    .replace(/</g, '&lt;')
+    .replace(/>/g, '&gt;')
+    .replace(/"/g, '&quot;')
+    .replace(/'/g, '&#39;');
+}
+
 function verificationHtml(name, link) {
-  const hi = name ? `Hi ${name},` : 'Hi,';
+  const hi = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
+  const href = encodeURI(link);
   return `
     ...
       <p>${hi}</p>
-      <p><a href="${link}" style="...">Verify email</a></p>
-      <p style="...">Or paste this link into your browser:<br>${link}</p>
+      <p><a href="${href}" style="...">Verify email</a></p>
+      <p style="...">Or paste this link into your browser:<br>${escapeHtml(link)}</p>
```

Export `escapeHtml` so any future template reuses it.

### Test to add (`server/tests/emailVerification.test.js`)

```js
test('a name containing markup is escaped in the email body', () => {
  const html = mailer.verificationHtml('<script>x</script>', 'https://app/verify?token=t');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
});
```

(`verificationHtml` is currently module-private — export it for the test.)

**Difficulty:** 🟢 Easy.

---

<a id="bug-09"></a>
## BUG-09 · 🟠 Medium — 3 moderate advisories in production dependencies

**File:** `server/package.json` / `package-lock.json`

### Root cause

`npm audit --omit=dev` is no longer clean (it was 0 at the last audit):

```
qs  2.2.5 - 6.15.3   (moderate)
  · array-limit bypass via bracket-key comma parsing   GHSA-x5fp-wj9c-mxmx
  · Denial of Service via attacker-controlled isBuffer GHSA-4mjr-xmp4-gh2g
  body-parser 1.20.5 - 1.20.6  — depends on vulnerable qs
  express     4.22.2           — depends on vulnerable body-parser and qs
```

Installed: `express@4.22.2` → `body-parser@1.20.6` → `qs@6.15.3`. `qs` is also pulled
in by `googleapis@174.0.1`. These are **production** deps on the request path:
`express.json()` and `express.urlencoded({ extended: true })` in `app.js` both parse
attacker-supplied input through this exact code. The DoS is the one that matters — a
crafted body can pin the single Render instance.

The client is unaffected (`npm audit` → 0).

### Remediation

```bash
cd server
npm audit fix          # patch-level bump of qs / body-parser within express 4
npm audit --omit=dev   # expect: found 0 vulnerabilities
npm test               # 32 suites / 251 tests must stay green
npm run lint
```

Commit the resulting `package-lock.json`. If `npm audit fix` cannot resolve it
without `--force` (i.e. it wants Express 5), **do not force it** — Express 5 is a
breaking change across every route file and belongs in its own planned slice. In that
case pin the transitive dependency instead:

```json
  "overrides": {
    "qs": "^6.15.4"
  }
```

then re-run the audit and the suite to confirm the override took.

**Difficulty:** 🟢 Easy, assuming `audit fix` resolves within Express 4.

---

<a id="bug-10"></a>
## BUG-10 · 🟡 Low — webhook dedupe is check-then-insert

**File:** `server/controllers/billing.controller.js:137-155`

### Root cause

```js
const seen = await prisma.billingEvent.findUnique({ where: { providerEventId: eventId } });
if (seen) return res.json({ ok: true, deduped: true });
// ... apply the event ...
await prisma.billingEvent.create({ data: { providerEventId: eventId, ... } });
```

The read and the write are not atomic. Razorpay retries deliveries, and two
concurrent retries of the same event both pass `findUnique` (nothing is stored yet),
both call `applySubscriptionEvent`, then the loser's `create` violates the unique
constraint on `providerEventId` and throws — a **500** back to Razorpay, which makes
it retry again. The plan mutation is idempotent, so no wrong state results; the cost
is a 500, a spurious retry, and a missing audit row.

Related, lower still: if `applySubscriptionEvent` succeeds and the subsequent
`create` fails for any reason, the event is applied but unrecorded, so a redelivery
re-applies it.

### Remediation

Insert first and let the unique constraint arbitrate — claim the event, then apply:

```js
  // Claim the event id BEFORE applying it. The unique constraint on
  // providerEventId is the lock: a concurrent redelivery loses the insert and
  // returns deduped instead of racing us through applySubscriptionEvent.
  try {
    await prisma.billingEvent.create({
      data: { providerEventId: eventId, type: payload.event || 'unknown', userId: null, payload },
    });
  } catch (err) {
    if (err.code === 'P2002') return res.json({ ok: true, deduped: true });
    throw err;
  }

  let userId = null;
  if (typeof payload.event === 'string' && payload.event.startsWith('subscription.')) {
    const entity = payload.payload?.subscription?.entity;
    if (entity?.id) userId = await applySubscriptionEvent(payload.event, entity);
  }
  if (userId) {
    await prisma.billingEvent.update({ where: { providerEventId: eventId }, data: { userId } });
  }
  return res.json({ ok: true });
```

This requires moving the `JSON.parse` above the claim (it already precedes the
apply). Trade-off: if the process dies between claim and apply, the event is recorded
but unapplied and a redelivery is deduped away. The following webhook
(`subscription.charged` recurs monthly) reconciles it, and `effectivePlan` already
expires stale PAID at runtime. Prefer this over the current window, in which a
redelivery 500s.

Confirm `fakePrisma` raises a `P2002`-shaped error on a duplicate unique write, or
extend it — the test depends on that.

**Difficulty:** 🟡 Moderate — small diff, but it reorders a payments path; test the
dedupe, the race, and the userId backfill.

---

<a id="bug-11"></a>
## BUG-11 · 🟡 Low — `tfaFailures` map grows without bound

**File:** `server/controllers/auth.controller.js:33-56`

### Root cause

```js
const tfaFailures = new Map(); // userId → { count, firstAt }
```

Entries are added on every failed 2FA attempt and removed only by `tfaReset` (on a
successful login) or lazily inside `tfaLocked` when that *same* user is checked again
after the window. A user who fails once and never returns leaves an entry forever.
There is no sweep, no cap, and no TTL.

Each entry is tiny, so this is a slow leak rather than a crash — but it is unbounded
and attacker-driven: enumerating user ids with wrong codes grows the map
indefinitely, and the process is long-lived (Render restarts are the only reset). The
existing comment ("resets on restart, which is fine") accounts for correctness, not
for growth.

### Remediation

Sweep expired entries opportunistically, bounded so the sweep itself is cheap:

```js
 const tfaFailures = new Map(); // userId → { count, firstAt }
+// Drop entries whose window has elapsed. Called on write, and only when the map has
+// grown past a threshold, so the common path stays O(1).
+const TFA_SWEEP_THRESHOLD = 1000;
+function tfaSweep(now) {
+  if (tfaFailures.size < TFA_SWEEP_THRESHOLD) return;
+  for (const [id, rec] of tfaFailures) {
+    if (now - rec.firstAt > TFA_WINDOW_MS) tfaFailures.delete(id);
+  }
+}

 function tfaRecordFailure(userId) {
+  const now = Date.now();
+  tfaSweep(now);
   const rec = tfaFailures.get(userId);
-  if (!rec || Date.now() - rec.firstAt > TFA_WINDOW_MS) {
-    tfaFailures.set(userId, { count: 1, firstAt: Date.now() });
+  if (!rec || now - rec.firstAt > TFA_WINDOW_MS) {
+    tfaFailures.set(userId, { count: 1, firstAt: now });
   } else {
     rec.count += 1;
   }
 }
```

Worth noting for a future slice, not this one: this throttle is per-process. If the
API is ever scaled past one instance it stops being a real limit and should move to
the database (or a shared store), like the DB-backed scheduler did.

**Difficulty:** 🟢 Easy.

---

<a id="bug-12"></a>
## BUG-12 · 🟡 Low — `activeToday` uses local midnight among UTC metrics

**File:** `server/controllers/admin.controller.js:17-21`

### Root cause

```js
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);      // ← server-local midnight
  return d;
}
```

Every neighbouring boundary is UTC-based: `since(7)` / `since(30)` are UTC offsets
from now, `quota.monthlyAiCostUsd` uses `setUTCDate(1)` / `setUTCHours(0,0,0,0)`, and
`ai.controller.usage` uses `setUTCHours`. Only the admin "active today" tile uses
local time.

Render containers run UTC, so the two coincide today and the metric is correct in
production. It silently diverges the moment `TZ` is set on the service, a second
region is added, or someone runs the API locally in a non-UTC zone — and it is the
kind of skew nobody notices, because the number stays plausible.

### Remediation

```js
 function startOfToday() {
   const d = new Date();
-  d.setHours(0, 0, 0, 0);
+  // UTC to match every other boundary in the codebase (quota.monthlyAiCostUsd,
+  // ai.controller.usage). Local midnight silently diverges if TZ is ever set.
+  d.setUTCHours(0, 0, 0, 0);
   return d;
 }
```

`ai.controller.usage` builds its 7-day chart keys with local `setDate`/`getDate`
while bucketing rows by `toISOString().slice(0,10)` (UTC) — the same class of mismatch,
which drops or misplaces a day's spend for a non-UTC server. Fix both in one slice.

**Difficulty:** 🟢 Easy.

---

<a id="bug-13"></a>
## BUG-13 · 🟡 Low — `/ai/usage` aggregates in memory

**File:** `server/controllers/ai.controller.js:213-224`

### Root cause

```js
const rows = await prisma.aiUsage.findMany({
  where: { userId: req.user.id, createdAt: { gte: since } },
  select: { endpoint: true, inputTokens: true, outputTokens: true, costUsd: true, createdAt: true },
});
```

Every row in the window (up to 365 days, caller-controlled via `?days=`) is loaded
into the Node process and summed in a JS loop. There is no `take`. A prior fix
bounded the *window*; it did not bound the *row count* inside it.

One `aiUsage` row is written per AI call. A PAID user at the 120-calls/15-min rate
ceiling can accumulate on the order of 10^5–10^6 rows a year, all fetched into one
Express worker on a single request — hundreds of MB of hydrated objects on a small
Render instance. The endpoint is authenticated but self-service, so a user can
trigger it repeatedly with `?days=365`.

### Remediation

Push the aggregation into the database, which is what it is for:

```js
  const [totals, byEndpoint] = await Promise.all([
    prisma.aiUsage.aggregate({
      where: { userId: req.user.id, createdAt: { gte: since } },
      _count: true,
      _sum: { inputTokens: true, outputTokens: true, costUsd: true },
    }),
    prisma.aiUsage.groupBy({
      by: ['endpoint'],
      where: { userId: req.user.id, createdAt: { gte: since } },
      _count: true,
      _sum: { inputTokens: true, outputTokens: true, costUsd: true },
    }),
  ]);
```

The 7-day chart needs a per-day grouping, which Prisma cannot express over a
timestamp column; use a bound `$queryRaw` over the last 7 days only:

```sql
SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS day, SUM("costUsd") AS cost
FROM "ai_usage" WHERE "userId" = $1 AND "createdAt" >= $2
GROUP BY 1 ORDER BY 1
```

Follow the parameter-binding discipline already established in
`search.controller.js` — bind `$1`/`$2`, interpolate nothing. Note the existing
composite index on `AiUsage` (added by the previous audit) already covers
`(userId, createdAt)`.

Keep the response shape identical so the client needs no change; `fakePrisma` will
need `groupBy` support (it already has `aggregate`).

**Difficulty:** 🟡 Moderate — mostly the raw-SQL day bucket and the fake-Prisma
support.

---

<a id="bug-14"></a>
## BUG-14 · 🟡 Low — documented pytest path is Windows-only; no venv bootstrap

**File:** `CLAUDE.md` (Commands)

### Root cause

```
- AI service: `cd ai-service && .venv/Scripts/python -m pytest`
```

`.venv/Scripts/python` exists only on Windows. On Linux — this container, Docker, and
Render — it is `.venv/bin/python`. There is also no documented step to *create* the
environment, and the repo ships no `.venv`, so following `CLAUDE.md` verbatim on a
fresh clone fails twice: no interpreter at that path, and no installed dependencies
if one substitutes the right path.

Small, but it costs every fresh agent session a detour, and it is the reason the
2026-08-17 audit recorded the ai-service findings as "code reading only". It is
recorded here because `CLAUDE.md` is the contract agents follow.

### Remediation

```diff
 ## Commands

 - Server: `cd server && npm test` · `npm run lint` · `npm run dev`
-- AI service: `cd ai-service && .venv/Scripts/python -m pytest`
+- AI service (first run): `cd ai-service && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
+- AI service: `cd ai-service && .venv/bin/python -m pytest`
+  (on Windows the interpreter is `.venv/Scripts/python`)
 - Client: `cd client && npm test` · `npm run lint` · `npm run build`
```

Verified on this container: after the bootstrap line, `pytest` reports **38 passed**.

**Difficulty:** 🟢 Easy.

---

<a id="bug-15"></a>
## BUG-15 · 🟡 Low — model catalog is stale

**Files:** `ai-service/config.py:11-12`, `server/utils/aiCost.js:5-19`

### Root cause

Two related drifts:

1. `ai-service/config.py` defaults to `anthropic_model: "claude-opus-4-8"`. The
   current top-tier model is **Opus 5** (`claude-opus-5`). The repo's own guidance is
   to default to the latest and most capable Claude models.
2. `server/utils/aiCost.js` prices `claude-opus-4-8`, `claude-opus-4-7`,
   `claude-sonnet-5` and Haiku 4.5, but has **no entry for `claude-opus-5`**. An
   unknown model silently falls back to `FALLBACK = { in: 5, out: 25 }`.

Consequence: the moment `ANTHROPIC_MODEL` is pointed at Opus 5, every cost figure —
the `/ai/usage` report, the admin AI spend tile, and the `enforceAiBudget` gate that
returns a 402 — is computed from a guessed rate. The fallback is deliberate and stops
cost reading as zero, but it is a guess, and the budget guard is a spending control.
This is upkeep, not a defect in today's behaviour.

### Remediation

Point the default at the current model:

```diff
-    anthropic_model: str = "claude-opus-4-8"
+    anthropic_model: str = "claude-opus-5"
```

and price it, keeping the older entries so existing `aiUsage` rows still cost out:

```diff
   // Anthropic
+  'claude-opus-5': { in: ?, out: ? },
   'claude-opus-4-8': { in: 5, out: 25 },
   'claude-opus-4-7': { in: 5, out: 25 },
```

**Do not guess the rates.** Confirm current per-1M-token list prices against
Anthropic's pricing page before filling them in — `AI_PRICES` can override in the
meantime without a deploy. Re-check `gemini_model: "gemini-3.6-flash"` in the same
pass; it is also unpriced in `aiCost.js`.

Changing the default model changes cost and latency in production. Treat it as a
deliberate ops decision, not a silent bump — that is why it is listed last.

**Difficulty:** 🟢 Easy once the prices are confirmed.

---

<a id="reproductions"></a>
## Reproductions

BUG-01 and BUG-02 were executed against the app with a temporary Jest file (not
committed; the audit left no source changes). Both assertions below are what
*correct* behaviour would satisfy — both failed.

```
CHALLENGE -> /api/auth/me   status: 200      ← expected 401  (BUG-01)
CHALLENGE -> /api/tasks     status: 200      ← expected 401  (BUG-01)
REPLAY    -> /api/billing/verify status: 200 {"plan":"PAID"}  ← expected 4xx  (BUG-02)

● PROOF: 2FA challenge token is accepted as a full session token
  expect(received).toBe(expected)   Expected: 401   Received: 200
● PROOF: /billing/verify upgrades a user for someone else's subscription
  expect(received).not.toBe(expected)   Expected: not 200
```

BUG-01 setup: register → `/2fa/setup` → `/2fa/enable` with a valid TOTP → password
login returns `twoFactorRequired: true` + `challengeToken` → that token was sent as
`Authorization: Bearer` to ordinary routes.

BUG-02 setup: two registered accounts; `verifyPaymentSignature` stubbed true (it
verifies a real HMAC — the point is that the endpoint asks *only* that question); the
second account posted a subscription id it never opened.

The remaining findings are from code reading, plus measured evidence where cited
(BUG-03 the failing suite, BUG-05 the emitted `ERR_ERL_KEY_GEN_IPV6`, BUG-09 the
audit report, BUG-14 the 38 passing ai-service tests).

## Suggested slice order

One slice at a time, per `CLAUDE.md`. Each lands with its tests.

| Slice | Items | Rationale |
| --- | --- | --- |
| 1 | BUG-01, BUG-07 | Auth bypass. Both edits are in the same two auth functions. Ship first, alone. |
| 2 | BUG-02 | Billing integrity. Check production data before adding the unique constraint. |
| 3 | BUG-03, BUG-09 | Get CI honest: green client suite, clean prod audit. |
| 4 | BUG-04, BUG-05 | Rate limiting — one file, one coherent change. |
| 5 | BUG-06, BUG-11, BUG-12 | Quota + small hygiene. |
| 6 | BUG-08, BUG-10 | Email escaping and the webhook race. |
| 7 | BUG-13, BUG-14, BUG-15 | Perf, docs, model catalog. |

Verification gate for every slice (per `CLAUDE.md` → "Never commit failing code"):

```bash
cd server     && npm run lint && npm test          # 32 suites, 251 tests
cd client     && npm run lint && npm test && npm run build   # 24 files, 60 tests
cd ai-service && .venv/bin/python -m pytest        # 38 tests
```

## Status: awaiting approval

15 findings, none fixed. **Nothing in this repository was modified by this audit** —
the only new file is this one.

The recommendation is to approve **slice 1 (BUG-01 + BUG-07) immediately** and
independently of the rest: it is a live authentication bypass that makes the 2FA
feature ineffective for any account still on `tokenVersion` 0, the fix is three small
edits with no schema or client impact, and it does not depend on any other item here.

Slice 2 (BUG-02) is the other item worth treating as urgent; its controller fix is
equally small, but the optional unique constraint needs a look at production data
first, so it should not hold up slice 1.
