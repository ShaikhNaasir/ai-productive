# Bug Remediation Plan

**Generated:** 2026-08-31 · **Branch:** `claude/beautiful-einstein-g2t30k` · **Base commit:** `7c1528b`

Automated audit of the AI-Powered Personal Productivity Assistant repository.

> ### ⏸ Awaiting approval — no code has been changed
>
> This is an audit only. Nothing in this plan has been implemented. The one file
> written by this run is this document. Approve the items you want and they can be
> implemented in the slices proposed at the end.

> ### Note on the previous audit
>
> The earlier 24-item audit (2026-08-17, base `fe64219`) is **complete** — all items
> shipped via PR #1 and are recorded in `CHANGELOG.md` and `ROADMAP.md`. This file
> has been replaced with the current audit rather than appended to. None of the
> issues below is a regression of a previously fixed item; they are new findings in
> code that landed after that audit (`E1`, `E2`, `D1`–`D5`, `F1`–`F3`, `G1`).

## Baseline health (at audit time)

| Check | Result |
| --- | --- |
| `server && npm test` (Jest) | ✅ 32 suites, 251 tests passing |
| `client && npm test` (Vitest) | ❌ **1 failed**, 59 passed (24 files) — see [BUG-03](#bug-03) |
| `ai-service && pytest` | ✅ 38 passed |
| `server && npm run lint` | ✅ clean |
| `client && npm run lint` | ✅ clean |
| `server && npm ci` audit | ✅ 0 vulnerabilities |
| `client && npm ci` audit | ✅ 0 vulnerabilities |

Note: the server suite passes but prints a `ValidationError` from `express-rate-limit`
on every boot — that is [BUG-04](#bug-04), not test noise.

Unlike the previous audit, this run found **one genuinely failing test** and **one
confirmed, exploitable authentication bypass** (reproduced end-to-end, see BUG-01).

## Summary

| ID | Severity | Area | Issue |
| --- | --- | --- | --- |
| [BUG-01](#bug-01) | 🔴 **Critical** | server/auth | 2FA challenge token is accepted as a full session token — complete 2FA bypass |
| [BUG-02](#bug-02) | 🔴 High | server/billing | `POST /billing/verify` never binds the subscription to the caller — one payment upgrades unlimited accounts |
| [BUG-03](#bug-03) | 🟠 Medium | client/tests | `billing.test.jsx` fails: Vitest 4 rejects an arrow-function mock used with `new` |
| [BUG-04](#bug-04) | 🟠 Medium | server/ratelimit | Custom `keyGenerator` uses `req.ip` raw → IPv6 clients bypass the global API limit |
| [BUG-05](#bug-05) | 🟠 Medium | server/ratelimit | `apiLimiter` is mounted before `requireAuth`, so its per-user keying branch is dead |
| [BUG-06](#bug-06) | 🟠 Medium | server/auth | TOTP codes are replayable for their whole ±1 validity window |
| [BUG-07](#bug-07) | 🟠 Medium | server/auth | Backup-code consumption is a read-modify-write race |
| [BUG-08](#bug-08) | 🟡 Low | server/auth | `secretCrypto.decrypt` throws on a rotated key → 500 instead of a clean auth error |
| [BUG-09](#bug-09) | 🟡 Low | server/scheduler | Reminder mark-sent is not atomic → duplicate sends on a multi-instance deploy |
| [BUG-10](#bug-10) | 🟡 Low | server/auth | Backup codes stored as unsalted SHA-256 of a 40-bit secret |
| [BUG-11](#bug-11) | 🟡 Low | server/db | `emailVerifyTokenHash` is unindexed → full table scan per verification |
| [BUG-12](#bug-12) | 🟡 Low | server/db | `notifications` grows unbounded — no retention policy |
| [BUG-13](#bug-13) | 🟡 Low | server/quota | `assertWithinQuota` count-then-create race lets a plan cap be exceeded |
| [BUG-14](#bug-14) | 🟡 Low | client/realtime | Socket reconnect does not re-run the notification catch-up fetch |
| [BUG-15](#bug-15) | ⚪ Trivial | client | `clear()` and the `PATCH /notifications/:id/read` endpoint are unused dead code |

---

<a id="bug-01"></a>
## BUG-01 — 🔴 Critical — 2FA challenge token works as a session token

**Files:** `server/middleware/auth.js:27` · `server/controllers/auth.controller.js:81,151`

### Root cause

When a user has 2FA enabled, `login` deliberately withholds a session token and
returns a short-lived *challenge* instead (`auth.controller.js:151`):

```js
const challengeToken = signToken({ sub: account.id, purpose: '2fa' }, { expiresIn: CHALLENGE_TTL });
return res.json({ twoFactorRequired: true, challengeToken });
```

That challenge is signed with the **same key and the same `signToken` helper** as a
real session token. It differs only in carrying `purpose: '2fa'` and omitting the
`ver` claim.

`requireAuth` never looks at `purpose`, and its only other gate is the token-version
check (`middleware/auth.js:27`):

```js
if (!user || (payload.ver ?? 0) !== (user.tokenVersion ?? 0)) { ... }
```

The challenge has no `ver`, so `payload.ver ?? 0` evaluates to `0`. `User.tokenVersion`
is `@default(0)` and is only ever bumped by logout or a password change. **For any
account that has never logged out or changed its password, `0 !== 0` is false and the
challenge token authenticates as a full session.**

An attacker who knows only the password gets the challenge from `POST /api/auth/login`
and uses it directly as `Authorization: Bearer <challengeToken>`. The second factor is
never presented. The window is the 5-minute `CHALLENGE_TTL` — ample to read or exfiltrate
everything, and renewable by simply logging in again with the password.

### Verified

Reproduced end-to-end against the real app (registered a user, enabled TOTP, logged in
with password only, then used the returned `challengeToken` as a Bearer token):

```
GET /api/auth/me  -> 200 {"user":{"id":"...","email":"poc@b.com", ...
GET /api/tasks    -> 200
```

Both should have been `401`.

### Remediation

Make the token's purpose explicit and enforce it. Two small edits:

**1. `server/controllers/auth.controller.js:81` — stamp session tokens.**

```js
function issueToken(user) {
  return signToken({ sub: user.id, email: user.email, ver: user.tokenVersion ?? 0, purpose: 'session' });
}
```

**2. `server/middleware/auth.js` — reject anything that is not a session token.**
Add immediately after the `verifyToken` try/catch (around line 24):

```js
  // A token minted for another purpose (e.g. the 2FA login challenge) is not a
  // session. Tokens issued before `purpose` was stamped have no claim and are
  // still honoured, so existing sessions survive the deploy.
  if (payload.purpose && payload.purpose !== 'session') {
    return next(ApiError.unauthorized('Invalid or expired token'));
  }
```

Treating a *missing* `purpose` as valid keeps already-issued session tokens working
across the deploy. The challenge token carries `purpose: '2fa'` explicitly, so it is
rejected from day one — the bypass closes immediately without logging everyone out.

**Defence in depth (recommended, same slice):** give the challenge a claim that cannot
collide with a session at all, and check it in `loginTwoFactor`:

```js
// auth.controller.js:151
const challengeToken = signToken(
  { sub: account.id, purpose: '2fa', ver: account.tokenVersion ?? 0 },
  { expiresIn: CHALLENGE_TTL }
);
```

Adding `ver` also means a logout or password change invalidates an outstanding
challenge, which it currently does not.

### Regression test

Add to `server/tests/twoFactor.test.js`:

```js
test('the 2FA challenge token cannot be used as a session token', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'tfa@b.com', password: 'password123' });
  expect(login.body.twoFactorRequired).toBe(true);

  const challenge = login.body.challengeToken;
  expect((await request(app).get('/api/auth/me').set(bearer(challenge))).status).toBe(401);
  expect((await request(app).get('/api/tasks').set(bearer(challenge))).status).toBe(401);
});
```

**Difficulty:** 🟢 Easy (~20 min incl. tests). **Priority: fix first — this is live on `main`.**

---

<a id="bug-02"></a>
## BUG-02 — 🔴 High — `POST /billing/verify` does not bind the subscription to the caller

**File:** `server/controllers/billing.controller.js:61-78`

### Root cause

`verify` takes `razorpay_subscription_id` straight from the request body, checks the
HMAC, and upgrades **whoever is authenticated** (`billing.controller.js:70-76`):

```js
if (!razorpay.verifyPaymentSignature({ paymentId, subscriptionId, signature })) {
  throw ApiError.badRequest('Payment verification failed');
}
const updated = await prisma.user.update({
  where: { id: req.user.id },
  data: { plan: 'PAID', subscriptionStatus: 'active', razorpaySubscriptionId: subscriptionId },
});
```

The signature is `HMAC(paymentId|subscriptionId)` keyed by the **shared account secret**.
It proves *a payment happened* — not *this user made it*. Anyone who has completed one
real payment holds a permanently valid `(paymentId, subscriptionId, signature)` triple
and can POST it from any number of other accounts, each of which is upgraded to `PAID`.

Two things make it worse:

- `checkout` already stored the correct `razorpaySubscriptionId` on the calling user
  (line 52), so the data needed to bind the payment is present and simply unused.
- `verify` sets `plan: 'PAID'` but leaves `planRenewsAt` untouched (`null`), and
  `config/plans.js:isPaid` treats a null renewal date as **an open-ended grant**. A
  replayed signature therefore yields *permanent* paid access, not a period-limited one.

The knock-on: `applySubscriptionEvent` resolves the owner with
`findFirst({ where: { razorpaySubscriptionId } })`, so once several users share a
subscription id, webhook events are applied to an arbitrary one of them.

### Remediation

**`server/controllers/billing.controller.js`** — replace the body of `verify` between
the signature check and the update:

```js
  if (!razorpay.verifyPaymentSignature({ paymentId, subscriptionId, signature })) {
    throw ApiError.badRequest('Payment verification failed');
  }

  // The signature proves a payment happened, not that it belongs to this account.
  // Bind it to the subscription this user actually opened in `checkout`.
  const caller = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (caller.razorpaySubscriptionId !== subscriptionId) {
    throw ApiError.badRequest('This payment does not belong to your account.');
  }

  // Never let one subscription grant paid access to two accounts.
  const claimed = await prisma.user.findFirst({
    where: { razorpaySubscriptionId: subscriptionId, id: { not: req.user.id } },
  });
  if (claimed) {
    throw ApiError.badRequest('This subscription is already linked to another account.');
  }

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { plan: 'PAID', subscriptionStatus: 'active' },
  });
```

`razorpaySubscriptionId` is dropped from the update — it was already set by `checkout`
and re-writing it from user input is what allowed the takeover.

**Also close the open-ended-grant gap.** Either set a provisional renewal date here so
an unconfirmed upgrade cannot outlive its period:

```js
  // Provisional: the webhook is the source of truth and will correct this.
  data: { plan: 'PAID', subscriptionStatus: 'active', planRenewsAt: new Date(Date.now() + 32 * 864e5) },
```

…or reserve `planRenewsAt: null` strictly for admin grants and have `isPaid` require a
date whenever `subscriptionStatus` is set. The first is the smaller change.

### Regression test

Add to `server/tests/billing.test.js`:

```js
test('a valid signature cannot upgrade an account that did not open the subscription', async () => {
  // userA opens the subscription; userB replays A's signature.
  const res = await request(app)
    .post('/api/billing/verify')
    .set(bearer(userBToken))
    .send({
      razorpay_payment_id: 'pay_1',
      razorpay_subscription_id: 'sub_of_user_a',
      razorpay_signature: validSignatureForUserA,
    });
  expect(res.status).toBe(400);
  const b = await prisma.user.findUnique({ where: { id: userBId } });
  expect(b.plan).toBe('FREE');
});
```

**Difficulty:** 🟢 Easy (~40 min incl. tests).

---

<a id="bug-03"></a>
## BUG-03 — 🟠 Medium — failing client test: Vitest 4 rejects an arrow-function mock used as a constructor

**File:** `client/src/test/billing.test.jsx:47`

### Root cause

**This is the one red test in the repo.** The product code is correct; the test's mock is not.

`client/src/pages/Settings.jsx:160` calls the Razorpay checkout as a constructor:

```js
const Razorpay = await loadRazorpayCheckout();
const rzp = new Razorpay({ ... });
rzp.open();
```

The test mocks it with an **arrow function**:

```js
window.Razorpay = vi.fn(() => ({ open }));
```

The `vitest 2 → 4` upgrade (commit `4a28cbd`, the previous audit's BUG-12 fix) changed
mock semantics: a `vi.fn()` whose implementation is an arrow function can no longer be
invoked with `new`. Confirmed directly:

```
ARROW    new -> THREW: () => ({ open }) is not a constructor
FUNCTION new -> ok
```

Vitest even warns about it in the run output (`The vi.fn() mock did not use 'function'
or 'class' in its implementation`).

So `new Razorpay(...)` throws inside `upgrade()`, the `catch (err)` at
`Settings.jsx:181` swallows it into an error toast, and `open` is never called —
`expect(open).toHaveBeenCalled()` fails after a 1s `waitFor` timeout.

### Remediation

**`client/src/test/billing.test.jsx:47`** — use a real function (or a class) so the mock
is constructible:

```js
    const open = vi.fn();
    // Must be a `function`, not an arrow: Vitest 4 will not call an arrow-function
    // mock implementation with `new`, and Settings does `new Razorpay(...)`.
    window.Razorpay = vi.fn(function RazorpayMock() {
      return { open };
    });
```

The existing assertions then pass unchanged.

**Worth fixing alongside (not required):** the `catch` in `Settings.jsx:181` turns a
genuine programming error into a generic "Could not start checkout" toast, which is why
this surfaced as a silent assertion timeout rather than a visible error. Logging the
underlying error would make the next such failure obvious:

```js
    } catch (err) {
      if (import.meta.env.DEV) console.error('checkout failed', err);
      setMsg({ ok: false, text: apiError(err, 'Could not start checkout') });
    }
```

**Difficulty:** 🟢 Easy (~10 min).

---

<a id="bug-04"></a>
## BUG-04 — 🟠 Medium — IPv6 clients bypass the global API rate limit

**File:** `server/middleware/rateLimit.js:26`

### Root cause

```js
keyGenerator: (req) => (req.user && req.user.id ? req.user.id : req.ip),
```

`express-rate-limit` v8 rejects this at construction and logs on every boot:

```
ValidationError: Custom keyGenerator appears to use request IP without calling the
ipKeyGenerator helper function for IPv6 addresses. This could allow IPv6 users to
bypass limits.  (ERR_ERL_KEY_GEN_IPV6)
```

A single IPv6 host is routinely allocated a whole `/64`. Keying on the full address
gives each of ~1.8×10¹⁹ addresses in that prefix its own 200-req/min bucket, so the
global cap is trivially defeated by address rotation. The library's `ipKeyGenerator`
helper exists precisely to collapse an IPv6 address to its `/64` prefix.

### Remediation

**`server/middleware/rateLimit.js`** — import the helper and use it on the IP branch:

```js
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
```

```js
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
  // ipKeyGenerator collapses an IPv6 address to its /64 prefix, so a client cannot
  // rotate through its allocation to get a fresh bucket per address.
  keyGenerator: (req) => (req.user && req.user.id ? req.user.id : ipKeyGenerator(req.ip)),
  message: { error: { message: 'Too many requests. Please slow down and try again shortly.' } },
});
```

`authLimiter` uses the default key generator and is unaffected. `aiLimiter` falls back
to the constant `'anonymous'` rather than an IP, so it is also unaffected.

This silences the boot-time `ValidationError` as a side effect.

### Regression test

Extend `server/tests/apiLimiter.test.js` to assert two addresses in one `/64` share a
bucket:

```js
test('IPv6 addresses in the same /64 share one bucket', async () => {
  const a = '2001:db8:1:2::1';
  const b = '2001:db8:1:2::dead';
  expect((await request(app).get('/ping').set('X-Forwarded-For', a)).status).toBe(200);
  expect((await request(app).get('/ping').set('X-Forwarded-For', b)).status).toBe(200);
  expect((await request(app).get('/ping').set('X-Forwarded-For', b)).status).toBe(429);
});
```

**Difficulty:** 🟢 Easy (~20 min).

---

<a id="bug-05"></a>
## BUG-05 — 🟠 Medium — `apiLimiter`'s per-user keying branch never executes

**Files:** `server/app.js:49,63` · `server/middleware/rateLimit.js:26`

### Root cause

The limiter is documented as *"Keyed by user id once authenticated, otherwise by IP."*
It never is. Express runs middleware in registration order, and in `app.js`:

```js
app.use('/api', apiLimiter);            // line 49  — runs first
...
app.use('/api', requestContext, routes); // line 63  — requireAuth lives in here
```

`requireAuth` is mounted inside `routes`, so at the moment `apiLimiter` computes its
key, `req.user` is always `undefined`. **Every request is keyed by IP**, and the
`req.user.id` branch is unreachable in production.

Consequences:

- Users behind one shared egress IP — office NAT, university, mobile CGNAT, or a
  corporate VPN — share a single 200 req/min bucket and throttle each other. With a
  chatty SPA this is a realistic false-positive 429 for legitimate users.
- The intended per-account fairness (and its abuse-limiting value against a stolen
  token) does not exist.
- `tests/apiLimiter.test.js` mounts the limiter standalone with no auth, so it only
  ever exercises the IP path — which is why the dead branch was not caught.

### Remediation

Move the limiter behind authentication resolution, so an authenticated request is
keyed by user id and only anonymous traffic falls back to IP. The smallest correct
change is to mount it inside `routes` after `requireAuth` — but `requireAuth` is
applied per-router, so the cleanest option that preserves current coverage is a
lightweight identity pre-pass in `app.js`:

**`server/app.js`** — replace line 49:

```js
    // Resolve the caller's identity (best-effort, non-blocking) *before* the limiter
    // so it can key by user id; requireAuth still does the real enforcement later.
    app.use('/api', attachUserIfPresent, apiLimiter);
```

**`server/middleware/auth.js`** — add and export:

```js
// Best-effort identity for middleware that runs before requireAuth (the rate
// limiter). Never rejects: a missing or bad token simply leaves req.user unset and
// requireAuth produces the real 401 further down the stack.
async function attachUserIfPresent(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    if (payload.purpose && payload.purpose !== 'session') return next(); // see BUG-01
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (user && (payload.ver ?? 0) === (user.tokenVersion ?? 0)) {
      req.user = { id: user.id };
    }
  } catch {
    /* anonymous — the limiter falls back to IP */
  }
  return next();
}
```

**Trade-off to weigh before approving:** this adds one `findUnique` per API request
ahead of the limiter, and `requireAuth` then repeats it. If that cost is unwelcome,
the alternative is to accept IP-only keying and **delete the dead branch plus the
misleading comment** so the code states what it actually does. Either is defensible;
the second is free. Recommend the first only if shared-NAT false positives are a real
concern for the user base.

**Difficulty:** 🟡 Moderate (~1 h) for the keying fix; 🟢 Easy (~5 min) to just remove
the dead branch.

---

<a id="bug-06"></a>
## BUG-06 — 🟠 Medium — TOTP codes are replayable within their validity window

**File:** `server/controllers/auth.controller.js:382` · `server/services/totp.js:74`

### Root cause

`loginTwoFactor` verifies the code and issues a session, but nothing records that the
code was used:

```js
if (totp.verify(secretCrypto.decrypt(user.twoFactorSecret), code)) {
  tfaReset(user.id);
  return res.json({ user: serializeUser(user), token: issueToken(user) });
}
```

`totp.verify` accepts a ±1 step window around a 30 s period, so **each 6-digit code
stays valid for up to 90 seconds and can be redeemed an unlimited number of times**
in that window. RFC 6238 §5.2 requires the verifier to reject a previously accepted
code.

Realistic exploit: an attacker who has the password and observes one code — phishing
proxy, shoulder-surf, a code pasted into the wrong window, malware reading the
notification shade — can redeem it in parallel with the legitimate login. The
per-account throttle (`tfaLocked`) only counts *failures*, so it does not help.

### Remediation

Persist the last accepted time-step and refuse anything at or below it. Add a column:

**`server/prisma/schema.prisma`** (on `model User`, near the other 2FA fields):

```prisma
  twoFactorLastStep       Int?
```

**`server/services/totp.js`** — return which step matched instead of just a boolean:

```js
// Verify a code against the secret, allowing ±`window` steps for clock skew.
// Returns the matching counter (time step) so the caller can reject a replay, or
// null when no step matches.
function verifyStep(secretBase32, code, window = 1) {
  if (!secretBase32 || !code) return null;
  const clean = String(code).replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const counter = currentCounter();
  for (let w = -window; w <= window; w += 1) {
    if (hotp(secretBase32, counter + w) === clean) return counter + w;
  }
  return null;
}

// Kept for callers that only need a yes/no (enrolment, disable).
function verify(secretBase32, code, window = 1) {
  return verifyStep(secretBase32, code, window) !== null;
}
```

Export `verifyStep` alongside `verify`.

**`server/controllers/auth.controller.js:382`** — reject a reused step:

```js
  const step = totp.verifyStep(secretCrypto.decrypt(user.twoFactorSecret), code);
  if (step !== null) {
    // RFC 6238 §5.2: a code is single-use. Without this a code stays redeemable for
    // its whole ±1-step (~90 s) window.
    if (user.twoFactorLastStep !== null && step <= user.twoFactorLastStep) {
      tfaRecordFailure(user.id);
      throw ApiError.unauthorized('That code has already been used. Wait for the next one.');
    }
    tfaReset(user.id);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorLastStep: step },
    });
    return res.json({ user: serializeUser(updated), token: issueToken(updated) });
  }
```

**Deploy note:** the new column is applied by Render's `prisma db push`, consistent with
the existing convention in `ROADMAP.md` — no migration file needed.

### Regression test

```js
test('a TOTP code cannot be redeemed twice', async () => {
  const code = codeFor(secret);
  const first = await request(app).post('/api/auth/2fa/login').send({ challengeToken, code });
  expect(first.status).toBe(200);

  const { body } = await login('tfa@b.com');
  const second = await request(app)
    .post('/api/auth/2fa/login')
    .send({ challengeToken: body.challengeToken, code });
  expect(second.status).toBe(401);
});
```

**Difficulty:** 🟡 Moderate (~1.5 h incl. schema + tests).

---

<a id="bug-07"></a>
## BUG-07 — 🟠 Medium — backup-code consumption is a read-modify-write race

**Files:** `server/controllers/auth.controller.js:386-392` · `server/services/twoFactor.js:31`

### Root cause

Consuming a one-time backup code reads the array, filters in JS, and writes the
remainder back — three separate steps with no atomicity:

```js
const remaining = twoFactor.consumeBackupCode(user.twoFactorBackupCodes, code);
if (remaining) {
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorBackupCodes: remaining },
  });
```

`user` was loaded earlier in the request. Two failure modes:

1. **Same code, concurrently.** Both requests read an array still containing the code,
   both match, both issue a session. A "one-time" code is redeemed twice.
2. **Different codes, concurrently.** Both read the same original array; the later
   write wins and **restores the code the other request just consumed**.

This is the same shape as the previously fixed habit check-in race (BUG-15 in the
prior audit), which was resolved with a conditional write.

### Remediation

Make the write conditional on the code still being present, and treat "no row updated"
as a failed attempt.

**`server/controllers/auth.controller.js`** — replace the backup-code branch:

```js
  const remaining = twoFactor.consumeBackupCode(user.twoFactorBackupCodes, code);
  if (remaining) {
    // Conditional write: only consume if the code is still unused. A concurrent
    // request that already consumed it leaves count === 0, so this attempt fails
    // rather than redeeming a one-time code twice.
    const { count } = await prisma.user.updateMany({
      where: { id: user.id, twoFactorBackupCodes: { has: twoFactor.hashCode(code) } },
      data: { twoFactorBackupCodes: remaining },
    });
    if (count === 1) {
      tfaReset(user.id);
      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      return res.json({ user: serializeUser(updated), token: issueToken(updated) });
    }
  }
  tfaRecordFailure(user.id);
  throw ApiError.unauthorized('That code is incorrect.');
```

`has` is Prisma's scalar-list containment filter and maps to a single guarded `UPDATE`,
so the check and the write happen in one statement. `twoFactor.hashCode` is already
exported.

Apply the same conditional-write shape to `disableTwoFactor` (`auth.controller.js:338`),
which consumes a backup code through the same unguarded path.

**Note:** `fakePrisma` will need `updateMany` support for `{ has: ... }` on a scalar
list to test this — check `server/tests/helpers/fakePrisma.js` before starting.

**Difficulty:** 🟡 Moderate (~1 h, mostly test-harness work).

---

<a id="bug-08"></a>
## BUG-08 — 🟡 Low — `secretCrypto.decrypt` throws on a rotated key, surfacing as a 500

**File:** `server/services/secretCrypto.js:26-33` · callers at `auth.controller.js:311,338,382`

### Root cause

The TOTP secret is encrypted with a key derived from `TWO_FACTOR_ENC_KEY` **or, by
default, `JWT_SECRET`**:

```js
const material = process.env.TWO_FACTOR_ENC_KEY || config.jwt.secret;
```

`decrypt` has no error handling — an AES-GCM auth-tag mismatch throws out of
`decipher.final()`. Every caller invokes it inline inside an expression:

```js
if (totp.verify(secretCrypto.decrypt(user.twoFactorSecret), code)) {
```

So rotating `JWT_SECRET` — a routine, well-intentioned security action, and the exact
thing an operator does after a suspected leak — makes every 2FA login return **500
Internal Server Error** instead of a comprehensible failure. The user is locked out
with no signal about what went wrong, and the logs show an opaque crypto error.

Note the coupling is undocumented outside a code comment: nothing warns that
`JWT_SECRET` rotation destroys stored TOTP secrets.

### Remediation

**`server/services/secretCrypto.js`** — fail closed and legibly:

```js
// Decrypt a value produced by encrypt(). A value not in the v1 envelope is returned
// as-is, so a secret written before encryption was added (legacy plaintext) still
// works. A value that fails to decrypt — almost always because the derived key
// changed (JWT_SECRET rotated without TWO_FACTOR_ENC_KEY pinned) — returns null so
// callers surface a clean auth failure instead of a 500.
function decrypt(payload) {
  if (typeof payload !== 'string' || !payload.startsWith(`${PREFIX}:`)) return payload;
  try {
    const [, ivb, tagb, ctb] = payload.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivb, 'base64'));
    decipher.setAuthTag(Buffer.from(tagb, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctb, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // eslint-disable-next-line no-console
    console.warn('[secretCrypto] could not decrypt a stored secret — has JWT_SECRET or TWO_FACTOR_ENC_KEY changed?');
    return null;
  }
}
```

`totp.verify(null, code)` already returns `false` (its first guard is `if (!secretBase32
|| !code) return false`), so all three call sites degrade to a clean
`401 That code is incorrect.` with no further change.

**Also document the coupling** — add to `.env.docker.example` and the ops notes in
`ROADMAP.md`:

> `TWO_FACTOR_ENC_KEY` — optional. If unset, the TOTP-secret encryption key is derived
> from `JWT_SECRET`, so **rotating `JWT_SECRET` invalidates every stored 2FA secret**
> and enrolled users must re-enrol. Set `TWO_FACTOR_ENC_KEY` explicitly to decouple them.

**Difficulty:** 🟢 Easy (~30 min).

---

<a id="bug-09"></a>
## BUG-09 — 🟡 Low — reminder mark-sent is not atomic across instances

**File:** `server/services/reminderScheduler.js:47`

### Root cause

The scheduler reads due rows, then marks each sent by primary key:

```js
due = await prisma.reminder.findMany({ where: { sent: false, remindAt: { lte: now } }, take: 100 });
...
await prisma.reminder.update({ where: { id: reminder.id }, data: { sent: true } });
```

The update is unconditional. `guardedTick`'s `running` flag prevents *overlap within one
process* (the prior audit's BUG-07 fix) but does nothing across processes. If the API is
ever scaled past one instance — or during a rolling deploy, when old and new instances
briefly overlap — two schedulers read the same unsent rows and both emit, delivering
duplicate notifications and creating duplicate `Notification` rows and duplicate chained
recurrences.

Currently latent: Render runs a single instance. It becomes a live bug the moment the
service is scaled or a zero-downtime deploy is configured.

### Remediation

**`server/services/reminderScheduler.js:47`** — claim the row with a guarded write and
skip it if another instance won:

```js
    // Claim the reminder atomically: the `sent: false` predicate means exactly one
    // instance can win the row, so scaling past one process (or a rolling deploy)
    // cannot double-send.
    let claimed;
    try {
      claimed = await prisma.reminder.updateMany({
        where: { id: reminder.id, sent: false },
        data: { sent: true },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[scheduler] mark-sent failed for ${reminder.id}: ${err.message}`);
      continue;
    }
    if (claimed.count === 0) continue; // another instance already took it
```

Ordering is unchanged — the claim still precedes the emit, preserving the deliberate
"drop rather than double-send" trade-off documented in the existing comment.

**Difficulty:** 🟢 Easy (~30 min).

---

<a id="bug-10"></a>
## BUG-10 — 🟡 Low — backup codes are unsalted SHA-256 over a 40-bit secret

**File:** `server/services/twoFactor.js:14,22`

### Root cause

```js
const raw = crypto.randomBytes(5).toString('hex'); // 10 hex chars → 40 bits
...
function hashCode(code) {
  return crypto.createHash('sha256').update(normalize(code)).digest('hex');
}
```

40 bits of entropy behind a single unsalted SHA-256. That is fine against online
guessing (the `tfaLocked` throttle covers it) but weak against an offline attack: an
attacker holding a database dump can exhaust the whole 2⁴⁰ keyspace on commodity GPU
hardware in hours, and because the hash is unsalted, one pass recovers the codes for
**every user at once**. Each recovered code is a complete second factor.

Consistent with the threat model already accepted elsewhere in the codebase — the TOTP
secret is encrypted at rest (F2) precisely because a DB leak is in scope — so the
backup codes should get comparable treatment.

### Remediation

Two independent improvements; the first is the cheap one.

**1. Raise the entropy** — `server/services/twoFactor.js:22`:

```js
    const raw = crypto.randomBytes(8).toString('hex'); // 16 hex chars → 64 bits
    plain.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`);
```

64 bits puts an offline exhaustive search out of reach. `normalize()` already strips
hyphens, so the existing comparison path and any codes users have written down in the
old format continue to work.

**2. Salt the hash.** A per-code random salt stored with the digest
(`salt:hash`) removes the shared-work advantage. This changes the stored format, so
`consumeBackupCode` must compare by iterating rather than by `includes`, and existing
users' codes would need regenerating (or a dual-format read path). Given (1) already
defeats the practical attack, **recommend (1) alone** unless the user wants the
stronger guarantee.

Either way, existing enrolled users keep their old 40-bit codes until they regenerate.
If that matters, add a "regenerate backup codes" prompt for users enrolled before the
change.

**Difficulty:** 🟢 Easy (~20 min) for (1); 🟡 Moderate (~2 h) for (1)+(2).

---

<a id="bug-11"></a>
## BUG-11 — 🟡 Low — `emailVerifyTokenHash` lookup is a full table scan

**Files:** `server/services/emailVerification.js:56` · `server/prisma/schema.prisma`

### Root cause

```js
const user = await prisma.user.findFirst({ where: { emailVerifyTokenHash: hashToken(rawToken) } });
```

`emailVerifyTokenHash` carries no index (confirmed against every `@@index`/`@@unique`
in the schema), so each verification click sequentially scans `users`. Harmless at
current scale, linearly worse as the table grows, and it sits on an unauthenticated,
publicly reachable endpoint — a cheap way to generate load.

The value is a SHA-256 hex digest of 32 random bytes and is `null` for most rows, so a
unique index is both correct and cheap (Postgres does not index NULLs in a way that
would collide).

### Remediation

**`server/prisma/schema.prisma`** — on `model User`:

```prisma
  @@unique([emailVerifyTokenHash])
```

Then switch the lookup to the indexed unique path — **`server/services/emailVerification.js:56`**:

```js
  const user = await prisma.user.findUnique({ where: { emailVerifyTokenHash: hashToken(rawToken) } });
```

**Deploy note:** applied by `prisma db push`, per the existing convention. Verify no
duplicate non-null values exist before adding the unique constraint — with a
32-byte random source a collision is not realistic, but the constraint will refuse to
build if some other path wrote a duplicate.

**Difficulty:** 🟢 Easy (~20 min).

---

<a id="bug-12"></a>
## BUG-12 — 🟡 Low — the `notifications` table grows without bound

**Files:** `server/services/reminderScheduler.js:59` · `server/controllers/notification.controller.js:16`

### Root cause

G1 persists a `Notification` row for every reminder that fires, and nothing ever
deletes them. The read side only *queries* a 30-day window:

```js
const since = new Date(Date.now() - 30 * DAY);
```

so rows older than 30 days are permanently unreachable but permanently stored. A user
with several daily recurring reminders accumulates thousands of dead rows a year,
inflating the table and its `(userId, createdAt)` index for no benefit. Cascade delete
on the user relation is the only cleanup that ever happens.

### Remediation

Prune alongside the existing scheduler sweep rather than adding new infrastructure.

**`server/services/reminderScheduler.js`** — add a retention pass and call it from
`tick()`:

```js
const RETENTION_DAYS = 90;
let lastPrune = 0;

// Notifications are only ever read back over a 30-day window (see
// notification.controller.list), so anything past the retention horizon is dead
// weight. Pruned at most once an hour, best-effort — never blocks reminder delivery.
async function pruneNotifications(now) {
  if (now.getTime() - lastPrune < 60 * 60 * 1000) return;
  lastPrune = now.getTime();
  try {
    await prisma.notification.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 864e5) } },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[scheduler] notification prune failed: ${err.message}`);
  }
}
```

Call it at the end of `tick()`. 90 days is deliberately wider than the 30-day read
window so the retention change is invisible to users.

**Difficulty:** 🟢 Easy (~30 min).

---

<a id="bug-13"></a>
## BUG-13 — 🟡 Low — plan caps can be exceeded under concurrency

**File:** `server/services/quota.js:24`

### Root cause

```js
const used = await prisma[meta.model].count({ where: { userId: user.id } });
if (used >= cap) { throw ApiError.paymentRequired(...); }
```

Count and create are separate operations with no transaction or constraint behind them.
A user at 99/100 tasks who fires several creates concurrently — trivially done by the
SPA, or deliberately — has every request read `99` and pass the gate, ending above the
cap.

Low impact: this is a soft commercial limit, not a security boundary, and the overshoot
is bounded by request concurrency. Listed for completeness.

### Remediation

Accept it, or close it in a transaction. The pragmatic middle ground is to make the
check strict at the boundary and re-verify after the write, which needs no schema
change:

```js
// Soft cap: count-then-create is not atomic, so concurrent creates can overshoot by
// the request concurrency. Acceptable for a commercial limit; tighten with a
// transaction if it ever needs to be exact.
```

Simply documenting the known limitation is a legitimate resolution here — recommend
that over adding transaction overhead to every task/note create.

**Difficulty:** 🟢 Easy (~10 min to document) / 🟡 Moderate (~2 h to make exact).

---

<a id="bug-14"></a>
## BUG-14 — 🟡 Low — socket reconnect does not re-run the catch-up fetch

**File:** `client/src/context/NotificationContext.jsx:34-36`

### Root cause

The catch-up fetch runs only when `user` changes:

```js
useEffect(() => {
  if (!user) return;
  load();
}, [user, load]);
```

Reminders that fire while the socket is down are persisted server-side, but the client
only learns about them on a full remount. Socket.IO reconnects automatically after a
network blip, laptop sleep, or a server restart — and on reconnect the bell silently
stays stale until the user reloads the page. This partially undermines the offline
catch-up G1 was built to provide.

### Remediation

**`client/src/context/NotificationContext.jsx`** — re-run catch-up whenever the socket
(re)connects, and add `load` to the effect's dependencies:

```js
    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });

    // Anything that fired while the socket was down was persisted but not pushed.
    // Re-run catch-up on every (re)connect, not just on mount.
    socket.on('connect', () => { load(); });

    socket.on('reminder', (payload) => { /* unchanged */ });

    return () => socket.disconnect();
  }, [user, load]);
```

`load` is already wrapped in `useCallback` with a stable `[]` dependency list, so adding
it does not re-create the socket. The existing de-dupe inside the `reminder` handler
(`prev.some((n) => n.id === payload.id)`) already prevents doubles, and `load` replaces
state wholesale, so no extra guard is needed.

**Difficulty:** 🟢 Easy (~20 min).

---

<a id="bug-15"></a>
## BUG-15 — ⚪ Trivial — dead notification code

**Files:** `client/src/context/NotificationContext.jsx:70` · `server/routes/notification.routes.js:15`

### Root cause

Two loose ends from G1:

1. `clear()` is created and exposed on the context but no component consumes it
   (`Layout.jsx` destructures only `notifications`, `unread`, `markAllRead`). It is also
   local-only — it never calls the server, so anything it cleared would reappear on the
   next `load()`. Shipping it as-is would be a visible bug; right now it is merely dead.
2. `PATCH /api/notifications/:id/read` and its `markRead` controller are implemented and
   tested but never called by the client, which only ever uses `markAllRead`.

Neither is a defect today. Both are latent traps: the next person to wire `clear()` into
a button inherits a bug that looks like a backend failure.

### Remediation

Either delete `clear` from the context, or make it real by adding a server-side clear.
If it is being kept for imminent use, mark the gap explicitly:

```js
  // NOTE: local-only — does not clear server-side, so cleared items return on the
  // next load(). Add a DELETE /notifications endpoint before wiring this to any UI.
  const clear = useCallback(() => setNotifications([]), []);
```

Leave the `markRead` endpoint in place — per-item read is the obvious next UI increment
and it is already tested.

**Difficulty:** 🟢 Easy (~10 min).

---

## Proposed slices

Ordered by severity, grouped so each slice is independently shippable with its own tests.

| # | Slice | Items | Difficulty |
| --- | --- | --- | --- |
| 1 | **Auth bypass — ship first, alone** | BUG-01 | 🟢 Easy |
| 2 | Billing authorization | BUG-02 | 🟢 Easy |
| 3 | Green the suite | BUG-03 | 🟢 Easy |
| 4 | Rate-limiter correctness | BUG-04, BUG-05 | 🟡 Moderate |
| 5 | 2FA hardening | BUG-06, BUG-07, BUG-08, BUG-10 | 🟡 Moderate |
| 6 | Scheduler + storage | BUG-09, BUG-11, BUG-12 | 🟢 Easy |
| 7 | Client + cleanup | BUG-13, BUG-14, BUG-15 | 🟢 Easy |

Slice 1 is deliberately isolated: it is a live authentication bypass and should go out
on its own, without waiting on anything else in this plan.

Slices 5 and 6 add schema fields (`twoFactorLastStep`, `@@unique` on
`emailVerifyTokenHash`). Render applies these via `prisma db push` per the standing
convention in `ROADMAP.md` — no migration files.

## Verification

Run after every slice:

```bash
cd server     && npm run lint && npm test                     # 32 suites, 251 tests
cd client     && npm run lint && npm test && npm run build     # 24 files, 60 tests
cd ai-service && .venv/bin/python -m pytest                    # 38 tests
```

Note the venv path differs from `CLAUDE.md`, which documents the Windows
`.venv/Scripts/python`; on Linux it is `.venv/bin/python`.

BUG-01 and BUG-02 should additionally be confirmed by the exploit reproductions given in
their sections failing to reproduce after the fix — not by the unit tests alone.

---

## Status: awaiting approval

15 items identified; **0 implemented**. No source file has been modified by this audit.
Reply with which slices to proceed with.
