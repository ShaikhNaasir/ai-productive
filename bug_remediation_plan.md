# Bug Remediation Plan

**Generated:** 2026-08-24 · **Branch:** `claude/beautiful-einstein-3mcnb7` · **Base commit:** `7c1528b`

Automated audit of the AI-Powered Personal Productivity Assistant repository.

> ### ⛔ Nothing here has been fixed. This is a proposal awaiting approval.
>
> Per the audit routine, no code was modified. Two findings (**BUG-01**, **BUG-02**)
> are live authentication/payment bypasses and should be treated as hotfixes rather
> than queued behind the roadmap.

> **Scope note.** The previous audit (24 items, all fixed) is retained in git history at
> commit `68da712`. This file has been rewritten as a fresh audit against the current
> head. It covers the 18 commits that landed since that audit closed — Tier D
> (admin panel, billing), Tier E (email verification, 2FA), Tier F (rate limiting,
> auth hardening) and Tier G1 (persistent notifications) — plus a re-sweep of the
> pre-existing surface.

---

## Baseline health (at audit time)

| Check | Result |
| --- | --- |
| `server && npm test` (Jest) | ✅ 32 suites, 251 tests passing |
| `client && npm test` (Vitest) | ❌ **1 failed**, 59 passing (24 files) — see [BUG-03](#bug-03) |
| `ai-service && pytest` | ✅ 38 tests passing |
| `server && npm run lint` | ✅ clean |
| `client && npm run lint` | ✅ clean |
| `server && npm audit --omit=dev` | ✅ 0 vulnerabilities |
| `client && npm audit` | ✅ 0 vulnerabilities |
| Prisma schema | ✅ valid |

`ai-service` has no committed virtualenv; `python3 -m venv .venv && pip install -r
requirements.txt` was needed before pytest would run in a fresh container (see
[BUG-13](#bug-13)).

**One test is red on the current branch.** Everything else below is a latent defect
that the existing suites do not cover.

---

## Summary

| ID | Severity | Area | Issue | Difficulty |
| --- | --- | --- | --- | --- |
| [BUG-01](#bug-01) | 🔴 **Critical** | server/auth | 2FA challenge token is accepted as a full session token — second factor bypassable | 🟢 Easy |
| [BUG-02](#bug-02) | 🔴 High | server/billing | Payment signature is not bound to the account; replayable → permanent free upgrade | 🟡 Moderate |
| [BUG-03](#bug-03) | 🟠 Medium | client/tests | `billing.test.jsx` fails: arrow function used as a constructor | 🟢 Easy |
| [BUG-04](#bug-04) | 🟠 Medium | server/ratelimit | `apiLimiter` never keys by user id — all users behind one NAT share a bucket | 🟢 Easy |
| [BUG-05](#bug-05) | 🟠 Medium | server/db | No index on `emailVerifyTokenHash` / `razorpaySubscriptionId` → full table scans | 🟢 Easy |
| [BUG-06](#bug-06) | 🟠 Medium | server/notifications | `Notification` rows are never pruned — unbounded table growth | 🟢 Easy |
| [BUG-07](#bug-07) | 🟡 Low | server/admin | `enableUser` resurrects a soft-deleted account | 🟢 Easy |
| [BUG-08](#bug-08) | 🟡 Low | server/auth | TOTP secrets keyed off `JWT_SECRET` — rotating it locks out every 2FA user | 🟡 Moderate |
| [BUG-09](#bug-09) | 🟡 Low | server/auth | `tfaFailures` Map is never swept — unbounded memory | 🟢 Easy |
| [BUG-10](#bug-10) | 🟡 Low | server/auth | `tokenVersion` read-modify-write race can drop a revocation | 🟡 Moderate |
| [BUG-11](#bug-11) | 🟡 Low | server/documents | FREE user can force a 10 MB in-memory buffer before the 402 | 🟢 Easy |
| [BUG-12](#bug-12) | 🟡 Low | server/quota | `assertWithinQuota` TOCTOU lets concurrent creates exceed the plan cap | 🟡 Moderate |
| [BUG-13](#bug-13) | 🟡 Low | ai-service/dx | No bootstrap for the Python test env — pytest unrunnable on a clean checkout | 🟢 Easy |

---

## 🔴 Critical

### BUG-01

#### The 2FA challenge token authenticates as a full session token

**Severity:** 🔴 Critical · **Difficulty:** 🟢 Easy · **Files:** `server/middleware/auth.js`, `server/controllers/auth.controller.js`, `server/utils/jwt.js`

**Root cause.** When a 2FA-enabled user logs in with the correct password,
`login()` returns a *challenge* token that is supposed to be exchangeable only at
`POST /auth/2fa/login`:

```js
// server/controllers/auth.controller.js:151
const challengeToken = signToken({ sub: account.id, purpose: '2fa' }, { expiresIn: CHALLENGE_TTL });
return res.json({ twoFactorRequired: true, challengeToken });
```

But it is signed with the same secret as a session token, and `requireAuth` never
inspects `purpose`. It only checks the subject and the token version:

```js
// server/middleware/auth.js:27
if (!user || (payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
  return next(ApiError.unauthorized('Session expired. Please sign in again.'));
}
```

The challenge token carries no `ver` claim, so `payload.ver ?? 0` evaluates to `0`.
Any account whose `tokenVersion` is still `0` — i.e. one that has never logged out,
changed its password, or been force-logged-out, which is the common case — matches.
**The challenge token is therefore a valid bearer token for the entire API, and the
second factor is decorative.**

**Verified empirically.** A probe registered a user, enrolled in 2FA, logged in with
the password only, and replayed the returned `challengeToken` as a `Bearer` token:

```
PROBE /auth/me status = 200 {"user":{...,"twoFactorEnabled":true}}
PROBE /tasks  status = 200 {"tasks":[]}
```

Both should have been `401`. The client is not at fault — `AuthContext` correctly
keeps the challenge out of `localStorage` — but the token is returned in the login
response body, so exploiting this needs nothing more than reading the HTTP response.

**Remediation.** Two layers; apply both.

*1 — Reject non-session tokens in `requireAuth` (zero-downtime hotfix).* A negative
check does not invalidate tokens already in the wild:

```js
// server/middleware/auth.js — after `payload = verifyToken(token)`
// A scoped token (e.g. the 2FA login challenge) is not a session. Reject it here so
// it can only ever be spent at the endpoint that issued it.
if (payload.purpose) {
  return next(ApiError.unauthorized('Invalid or expired token'));
}
```

*2 — Make session tokens positively identifiable (durable fix).* Stamp and require an
explicit type claim, so any future scoped token is rejected by default rather than by
remembering to name it:

```js
// server/controllers/auth.controller.js
function issueToken(user) {
  return signToken({ sub: user.id, email: user.email, ver: user.tokenVersion ?? 0, typ: 'session' });
}

// server/middleware/auth.js
if (payload.typ !== 'session') {
  return next(ApiError.unauthorized('Invalid or expired token'));
}
```

> ⚠️ **Deploy note:** step 2 alone invalidates every token currently issued (they have
> no `typ`), forcing all users to sign in again. Ship step 1 immediately, then step 2
> at a convenient window — or accept the forced re-login and ship both at once.

*3 — Bind the challenge to the token version* so a logout also kills an in-flight
challenge, and assert it on exchange:

```js
// login()
const challengeToken = signToken(
  { sub: account.id, purpose: '2fa', ver: account.tokenVersion ?? 0 },
  { expiresIn: CHALLENGE_TTL }
);

// loginTwoFactor(), after loading `user`
if ((payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
  throw ApiError.unauthorized('Your login session expired. Please sign in again.');
}
```

**Tests to add** (`server/tests/twoFactor.test.js`):

- a challenge token is rejected (401) on `GET /api/auth/me` and `GET /api/tasks`;
- the token returned by a *successful* `POST /auth/2fa/login` is still accepted;
- a challenge issued before a logout is rejected at `/auth/2fa/login`.

---

## 🟠 High

### BUG-02

#### Payment verification is not bound to the account, and is replayable

**Severity:** 🔴 High · **Difficulty:** 🟡 Moderate · **Files:** `server/controllers/billing.controller.js`

**Root cause.** `POST /api/billing/verify` grants `PAID` on the strength of a valid
Razorpay signature alone:

```js
// server/controllers/billing.controller.js:70
if (!razorpay.verifyPaymentSignature({ paymentId, subscriptionId, signature })) {
  throw ApiError.badRequest('Payment verification failed');
}
const updated = await prisma.user.update({
  where: { id: req.user.id },
  data: { plan: 'PAID', subscriptionStatus: 'active', razorpaySubscriptionId: subscriptionId },
});
```

The signature is an HMAC over `paymentId|subscriptionId` keyed by the shared account
secret. It proves *a* payment happened — not that **this** user made it. Three gaps:

1. **No ownership binding.** `subscriptionId` is never compared to the
   `razorpaySubscriptionId` stored on the caller at checkout. A valid triple from any
   real payment upgrades whichever account presents it, so one paid subscription can
   upgrade unlimited accounts.
2. **No replay protection.** The triple never expires and is not recorded as spent. A
   user who pays once, then cancels, can replay their old triple to restore `PAID`.
3. **No expiry is set.** `verify` writes `plan: 'PAID'` but never `planRenewsAt`, and
   `isPaid()` treats a null renewal date as an open-ended grant
   (`config/plans.js:36`). A single replay therefore grants **permanent** paid access
   that no downgrade webhook will revoke.

**Remediation.** Bind the payment to the caller, record it as spent, and let the
webhook own the renewal date.

```js
// server/controllers/billing.controller.js — inside verify()
const user = await prisma.user.findUnique({ where: { id: req.user.id } });

// The subscription must be the one this user opened at checkout. Without this, a
// signature captured from any other payment upgrades whoever replays it.
if (!user.razorpaySubscriptionId || user.razorpaySubscriptionId !== subscriptionId) {
  throw ApiError.badRequest('Payment verification failed');
}

if (!razorpay.verifyPaymentSignature({ paymentId, subscriptionId, signature })) {
  throw ApiError.badRequest('Payment verification failed');
}

// Single-use: BillingEvent.providerEventId is @unique, so a replayed payment id
// collides here instead of re-granting access.
try {
  await prisma.billingEvent.create({
    data: { providerEventId: `payment:${paymentId}`, type: 'payment.verified', userId: user.id, payload: { subscriptionId } },
  });
} catch {
  throw ApiError.badRequest('This payment has already been applied.');
}

const updated = await prisma.user.update({
  where: { id: user.id },
  data: { plan: 'PAID', subscriptionStatus: 'active' },
});
```

Leave `planRenewsAt` to `applySubscriptionEvent`, which already reads
`entity.current_end` from the webhook — that remains the source of truth for the
period end, exactly as the existing comment promises.

**Tests to add** (`server/tests/billing.test.js`):

- verify with a `subscriptionId` that does not match the caller's → 400, plan unchanged;
- the same `paymentId` submitted twice → second call 400, and no second `BillingEvent` row;
- the happy path still upgrades and leaves `planRenewsAt` for the webhook to set.

---

## 🟠 Medium

### BUG-03

#### `billing.test.jsx` fails — an arrow function cannot be a constructor

**Severity:** 🟠 Medium · **Difficulty:** 🟢 Easy · **Files:** `client/src/test/billing.test.jsx`

**Root cause.** The client suite is red on this branch. The test mocks Razorpay's
global with an arrow function:

```js
// client/src/test/billing.test.jsx:45
window.Razorpay = vi.fn(() => ({ open }));
```

Arrow functions have no `[[Construct]]` internal method, so the production call
`new Razorpay({...})` (`Settings.jsx:160`) throws
`() => ({ open }) is not a constructor`. The error is swallowed by the surrounding
`try/catch`, the component renders "Could not start checkout", and `open` is never
called — which is exactly what the assertion at line 51 reports.

**This is a defect in the test, not in the application.** In a browser the real
Razorpay script defines a genuine constructor, so the upgrade flow works; only the
mock is malformed. It has been failing since D5 landed, which means the suite has
been red on `main` for five days and CI signal is currently untrustworthy.

**Remediation.** Use a `function` expression so the mock is constructible:

```js
const open = vi.fn();
// A `function` (not an arrow) — the component calls `new Razorpay(...)`, and arrows
// have no [[Construct]].
window.Razorpay = vi.fn(function () {
  return { open };
});
```

Also add `afterEach(() => { delete window.Razorpay; })`, since the global currently
leaks into the third test in the file.

**Verified.** Applying this change to a scratch copy of the file turns the suite
green: `Test Files 1 passed (1) · Tests 3 passed (3)`.

---

### BUG-04

#### The global API limiter never keys by user id, only by IP

**Severity:** 🟠 Medium · **Difficulty:** 🟢 Easy · **Files:** `server/app.js`, `server/middleware/rateLimit.js`

**Root cause.** `apiLimiter` intends to bucket per authenticated user and fall back to
IP only for anonymous traffic:

```js
// server/middleware/rateLimit.js:26
keyGenerator: (req) => (req.user && req.user.id ? req.user.id : req.ip),
```

But it is mounted at `server/app.js:49`, while the router that runs `requireAuth` is
not mounted until line 63:

```js
app.use('/api', apiLimiter);          // ← line 49: req.user is always undefined here
...
app.use('/api', requestContext, routes);   // ← line 63: requireAuth runs inside here
```

Middleware runs in registration order, so `req.user` is *never* populated when the
key is computed. Every request falls through to `req.ip`, and the comment in
`rateLimit.js` ("Keyed by user id once authenticated") is not true of the deployed
behaviour.

**Impact.** All users sharing an egress IP — a corporate NAT, a university network,
mobile carrier CGNAT — share one 200-req/min bucket and throttle each other. The
per-user isolation the limiter was added for (F1) is absent.

**Remediation.** Move the limiter behind authentication so the intended key is
available, keeping a separate IP-keyed cap on the unauthenticated auth routes:

```js
// server/app.js — replace the line-49 mount
app.use('/api/auth', authLimiter);            // IP-keyed; auth routes are anonymous
app.use('/api', requestContext, apiLimiter, routes);
```

That still leaves `apiLimiter` ahead of the per-router `requireAuth`. To key by user
id it must run *after* it — the cleanest form is a small wrapper mounted inside each
authenticated router, or a global `requireAuth`-then-limit chain:

```js
// server/routes/index.js — after the auth routes are mounted
router.use(requireAuth, apiLimiter);
```

Whichever shape is chosen, add an assertion that two different users on the *same*
IP get independent buckets — the current `apiLimiter.test.js` does not distinguish
the two cases, which is why this passed unnoticed.

---

### BUG-05

#### Verification and webhook lookups run unindexed full table scans

**Severity:** 🟠 Medium · **Difficulty:** 🟢 Easy · **Files:** `server/prisma/schema.prisma`

**Root cause.** Two hot lookups filter on unindexed `User` columns:

```js
// server/services/emailVerification.js:53 — every verification-link click
const user = await prisma.user.findFirst({ where: { emailVerifyTokenHash: hashToken(rawToken) } });

// server/controllers/billing.controller.js:110 — every Razorpay webhook delivery
const user = await prisma.user.findFirst({ where: { razorpaySubscriptionId: entity.id } });
```

Neither `emailVerifyTokenHash` nor `razorpaySubscriptionId` carries an `@@index` or
`@unique` in `schema.prisma`, so Postgres sequentially scans `users` for both. Cost
grows linearly with the user table on paths that are latency-sensitive (a webhook
that times out is retried by Razorpay).

**Remediation.** Add indexes to the `User` model:

```prisma
model User {
  // ... existing fields
  @@index([emailVerifyTokenHash])
  @@index([razorpaySubscriptionId])
  @@map("users")
}
```

`razorpaySubscriptionId` is arguably `@unique` (one subscription belongs to one
user), which would also make BUG-02's ownership binding enforceable at the database
level. Confirm no historical duplicates exist before adding the constraint; ship the
plain index if that cannot be established.

**Deploy note:** Render applies schema changes with `prisma db push` per the existing
convention in `ROADMAP.md` — no migration files needed.

---

### BUG-06

#### Persisted notifications are never pruned

**Severity:** 🟠 Medium · **Difficulty:** 🟢 Easy · **Files:** `server/services/reminderScheduler.js`

**Root cause.** G1 made reminders durable by writing a `Notification` row on every
fire (`reminderScheduler.js:57`). Nothing ever deletes them. The read path only
*queries* a 30-day window:

```js
// server/controllers/notification.controller.js:13
const since = new Date(Date.now() - 30 * DAY);
```

so rows older than 30 days are invisible but still stored, indexed, and backed up
forever. A user with a daily recurring reminder accumulates ~365 dead rows a year,
and the table only ever grows.

**Remediation.** Add a retention sweep to the scheduler tick, cheap because
`Notification` already has `@@index([userId, createdAt])`. Run it on a low duty cycle
rather than every 30-second tick:

```js
// server/services/reminderScheduler.js
const RETENTION_DAYS = 90;
let lastSweep = 0;

async function sweepOldNotifications(now) {
  // Once an hour is plenty for a retention job; the read path only shows 30 days.
  if (now.getTime() - lastSweep < 60 * 60 * 1000) return;
  lastSweep = now.getTime();
  try {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff } } });
    if (count > 0) console.log(`[scheduler] pruned ${count} notification(s) older than ${RETENTION_DAYS}d`);
  } catch (err) {
    console.warn(`[scheduler] notification sweep failed: ${err.message}`);
  }
}
```

Call it at the top of `tick()`. Retention is deliberately longer (90d) than the read
window (30d) so the sweep can never race a visible row.

---

## 🟡 Low

### BUG-07

#### `enableUser` silently resurrects a soft-deleted account

**Severity:** 🟡 Low · **Difficulty:** 🟢 Easy · **Files:** `server/controllers/admin.controller.js`

**Root cause.** `deleteUser` soft-deletes by setting `status: 'DELETED'`
(`admin.controller.js:286`). `enableUser` flips *any* status back to `ACTIVE` with no
check on what it was:

```js
// server/controllers/admin.controller.js:219
const updated = await prisma.user.update({ where: { id: target.id }, data: { status: 'ACTIVE' } });
```

So "enable" — a routine un-suspend action, audited as `user.enable` — also undoes a
deletion. An admin restoring a suspended account from a list can restore a deleted
one by mis-click, and the audit trail records it as an enable rather than a
restoration.

**Remediation.** Require the transition to be an explicit un-delete:

```js
async function enableUser(req, res) {
  const target = await loadTarget(req.params.id);
  // Undeleting is a distinct, louder action than un-suspending — don't let one
  // silently perform the other.
  if (target.status === 'DELETED' && req.body?.restoreDeleted !== true) {
    throw ApiError.badRequest('This account was deleted. Pass restoreDeleted to restore it.');
  }
  const updated = await prisma.user.update({ where: { id: target.id }, data: { status: 'ACTIVE' } });
  await writeAudit(req.user.id, target.status === 'DELETED' ? 'user.restore' : 'user.enable', target.id, {
    email: target.email,
  });
  res.json({ user: pubUser(updated) });
}
```

---

### BUG-08

#### TOTP secrets are keyed off `JWT_SECRET`, so rotating it locks out every 2FA user

**Severity:** 🟡 Low (🔴 High if `JWT_SECRET` is ever rotated) · **Difficulty:** 🟡 Moderate · **Files:** `server/services/secretCrypto.js`

**Root cause.** The at-rest encryption key for TOTP secrets is derived from the JWT
signing secret when no dedicated key is set:

```js
// server/services/secretCrypto.js:12
const material = process.env.TWO_FACTOR_ENC_KEY || config.jwt.secret;
return crypto.createHash('sha256').update(`${material}:totp`).digest();
```

This couples two secrets with completely different rotation lifetimes. Rotating
`JWT_SECRET` — the standard response to a suspected token leak, and otherwise a safe
operation that just forces re-login — changes the derived key, so every stored
`twoFactorSecret` becomes undecryptable. AES-GCM then fails its auth tag and
`decrypt()` **throws**, surfacing as a 500 on `/auth/2fa/login`: every 2FA user is
hard-locked out of their account, mid-incident, with no self-service path back.

**Remediation.** Two parts.

*1 — Fail soft, not with a 500.* `decrypt` should signal "unusable secret" rather than
throw into the request:

```js
function decrypt(payload) {
  if (typeof payload !== 'string' || !payload.startsWith(`${PREFIX}:`)) return payload;
  try {
    const [, ivb, tagb, ctb] = payload.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivb, 'base64'));
    decipher.setAuthTag(Buffer.from(tagb, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctb, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key (e.g. JWT_SECRET rotated) or tampered value. Returning null lets the
    // caller fall back to backup codes instead of 500-ing the login.
    return null;
  }
}
```

`totp.verify(null, code)` must then return `false` rather than throw — confirm and
add a unit test.

*2 — Decouple the key.* Make `TWO_FACTOR_ENC_KEY` the documented requirement for any
deployment with 2FA enabled: warn loudly at boot when it is absent and `JWT_SECRET`
is being used as fallback, and add it to `server/.env.example` with a note that
rotating `JWT_SECRET` without it invalidates all enrolled authenticators.

---

### BUG-09

#### The 2FA failure map is never swept

**Severity:** 🟡 Low · **Difficulty:** 🟢 Easy · **Files:** `server/controllers/auth.controller.js`

**Root cause.** `tfaFailures` (`auth.controller.js:33`) accumulates one entry per user
id that fails a 2FA code. Entries are removed only on a successful login
(`tfaReset`) or lazily when that same user id is checked again after the window
expires (`tfaLocked`). A user who fails once and never returns leaves a permanent
entry, and an attacker spraying codes against many user ids grows the map without
bound for the life of the process.

**Remediation.** Sweep expired entries opportunistically:

```js
let lastTfaSweep = 0;

function tfaSweep() {
  const now = Date.now();
  if (now - lastTfaSweep < TFA_WINDOW_MS) return;
  lastTfaSweep = now;
  for (const [id, rec] of tfaFailures) {
    if (now - rec.firstAt > TFA_WINDOW_MS) tfaFailures.delete(id);
  }
}
```

Call `tfaSweep()` at the top of `tfaRecordFailure`. Entries are bounded by the number
of distinct ids seen in one 15-minute window rather than by process uptime.

---

### BUG-10

#### `tokenVersion` is bumped with a read-modify-write, so a revocation can be lost

**Severity:** 🟡 Low · **Difficulty:** 🟡 Moderate · **Files:** `server/controllers/auth.controller.js`, `server/controllers/admin.controller.js`

**Root cause.** Every revocation path reads the row, computes `+ 1` in JavaScript, and
writes the result back:

```js
// auth.controller.js:171 (logout), :234 (changePassword)
data: { tokenVersion: (user.tokenVersion ?? 0) + 1 }
// admin.controller.js:210 (disable), :228 (forceLogout), :286 (soft delete)
data: { tokenVersion: (target.tokenVersion ?? 0) + 1 }
```

Two concurrent revocations that read the same value both write the same result, so
one bump is lost. Where that matters: an admin force-logout racing the user's own
logout, or a password change racing an admin disable, can leave a token that both
operations intended to kill still valid.

**Remediation.** Use an atomic increment so the database does the arithmetic:

```js
data: { tokenVersion: { increment: 1 } }
```

Applies to all five call sites. Where the updated value is needed afterwards (e.g.
`changePassword` reissues a token from `updated`), Prisma's `update` already returns
the post-increment row, so `issueToken(updated)` stays correct.

> **Test-helper note:** `server/tests/helpers/fakePrisma.js` must learn the
> `{ increment: n }` update form, or these paths will silently no-op in tests.

---

### BUG-11

#### A FREE user can force a 10 MB in-memory buffer before the 402

**Severity:** 🟡 Low · **Difficulty:** 🟢 Easy · **Files:** `server/routes/document.routes.js`, `server/controllers/document.controller.js`

**Root cause.** Multer's hard ceiling is set to the most permissive plan, and the
per-plan cap is enforced afterwards in the controller:

```js
// server/routes/document.routes.js:15
const MAX_FILE_BYTES = PLAN_LIMITS.PAID.docSizeBytes;   // 10 MB
// server/controllers/document.controller.js — after multer has fully buffered the file
if (req.file.size > maxBytes) { throw ApiError.paymentRequired(...); }
```

The design intent is sound (a 402 upgrade prompt reads better than a 400), but
`multer.memoryStorage()` has already buffered the whole upload into RAM by the time
the plan check runs. A FREE user entitled to 1 MB can force a 10 MB allocation per
request, ten times their entitlement, and concurrent requests multiply it.

**Remediation.** Resolve the ceiling per request instead of globally. `limits` can be
computed inside a per-request multer instance, so the connection is torn down at the
user's own cap:

```js
function uploadSingle(req, res, next) {
  const maxBytes = limitsFor(effectivePlan(req.user)).docSizeBytes;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1 }, fileFilter });
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    // Over the plan's cap — keep the 402 upgrade prompt rather than a bare 400.
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(ApiError.paymentRequired(
        `This file exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB upload limit on your plan. Upgrade to upload larger files.`,
        { limit: maxBytes, plan: effectivePlan(req.user), upgrade: true }
      ));
    }
    return next(ApiError.badRequest(err.message || 'Upload failed'));
  });
}
```

`requireAuth` already runs before this (`router.use(requireAuth)`), so `req.user` is
available. The controller's size check then becomes redundant and can go.

---

### BUG-12

#### `assertWithinQuota` is check-then-act, so concurrent creates exceed the cap

**Severity:** 🟡 Low · **Difficulty:** 🟡 Moderate · **Files:** `server/services/quota.js`

**Root cause.** The guard counts, compares, and returns; the caller then creates the
row in a separate statement:

```js
// server/services/quota.js:23
const used = await prisma[meta.model].count({ where: { userId: user.id } });
if (used >= cap) { throw ApiError.paymentRequired(...); }
```

Nothing holds between the count and the insert. N concurrent creates at the boundary
all observe `used === cap - 1` and all succeed, overshooting the plan cap by up to
N - 1 rows.

**Remediation.** This is a revenue-shaped rather than a correctness-shaped bug, and
the practical overshoot is small. Two options, in ascending cost:

- **Accept and document** the soft edge — a handful of rows over a 100-task cap is
  not worth a transaction on the create path. Record the decision in a comment so it
  is not re-discovered as a bug.
- **Make it atomic** — wrap the count and the create in a single
  `prisma.$transaction` with `Serializable` isolation, and translate a serialization
  failure into the same 402. Correct, but it puts a transaction on every task/note
  create for a bound users rarely approach.

Recommended: the first, unless plan caps become a real monetisation lever.

---

### BUG-13

#### The Python test environment has no bootstrap

**Severity:** 🟡 Low · **Difficulty:** 🟢 Easy · **Files:** `ai-service/`, `CLAUDE.md`

**Root cause.** `CLAUDE.md` documents the AI-service test command as
`.venv/Scripts/python -m pytest`, which is a Windows path and assumes a `.venv` that
is not in the repository and has no creation step. On a clean checkout — including
every CI container and this audit's — pytest simply does not run until someone
manually discovers the incantation. The suite is healthy (38 passing) but effectively
invisible, which is how BUG-03 stayed red for five days without anyone noticing the
broader test story.

**Remediation.** Add a documented, platform-neutral bootstrap:

```bash
# ai-service/README or a Makefile target
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest
```

Update `CLAUDE.md`'s command list to the POSIX path (`.venv/bin/python -m pytest`),
noting the Windows equivalent, and confirm `.venv/` is in `.gitignore`. If a
SessionStart hook is in use for web sessions, add the bootstrap there so the suite is
runnable on first contact.

---

## Suggested sequencing

| Slice | Contents | Rationale |
| --- | --- | --- |
| **1 — Hotfix** | BUG-01, BUG-02 | Live auth + payment bypasses. Ship alone, ahead of everything else. |
| **2 — Green CI** | BUG-03, BUG-13 | Restores trustworthy test signal before further changes land on top of it. |
| **3 — Correctness** | BUG-04, BUG-07, BUG-09, BUG-10 | Small, independent, well-covered by new unit tests. |
| **4 — Data/scale** | BUG-05, BUG-06, BUG-11 | One schema push (BUG-05) plus two bounded-growth fixes. |
| **5 — Hardening** | BUG-08, BUG-12 | Operational resilience; BUG-12 may close as "accepted". |

Slices 1 and 2 are each under an hour. Slices 3–5 are a day's work in total,
including tests.

## Verification checklist for each slice

```
cd server     && npm run lint && npm test
cd client     && npm run lint && npm test && npm run build
cd ai-service && .venv/bin/python -m pytest
npx prisma validate --schema server/prisma/schema.prisma
```

Per `CLAUDE.md`: tests ship with the feature, and nothing is committed red.

---

## Status: awaiting approval

No source files were modified by this audit. The only change on this branch is this
document. Reply with the slices to proceed with — or `all` — and the fixes will be
implemented one slice at a time, each with its tests, in roadmap order.
