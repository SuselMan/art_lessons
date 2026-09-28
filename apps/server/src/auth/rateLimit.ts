import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance, FastifyRequest } from 'fastify'

/** Throttling for `/api/auth/*` (#237). Three things are being defended, and
 *  they want different keys:
 *
 *  - **The process.** `bcrypt` is deliberately slow (10 rounds ≈ 100 ms of
 *    pure CPU on the VPS's single vCPU), so an unauthenticated flood of
 *    sign-in attempts is a cheap way to starve every other request —
 *    including the socket traffic of a lesson in progress. Keyed by IP, per
 *    route.
 *  - **One account's code.** Guessing survives IP rotation, which a per-IP
 *    limit alone doesn't touch. Keyed by the email being tried, and only
 *    *failed* attempts count, so a teacher signing in from a school's shared
 *    address is never punished for someone else's typo. (The per-code ceiling
 *    in loginCodes.ts is the harder stop; this one bounds the number of codes
 *    an attacker can burn through.)
 *  - **Somebody else's mailbox** (#316). Requesting a code sends mail to an
 *    address chosen by the caller, who needs no account and no credentials —
 *    without a per-address ceiling that is a mail flood with our name in the
 *    From line, and our sending reputation pays for it.
 *
 *  In-memory store on purpose: one server process, no Redis (CLAUDE.md).
 *  The counters reset on deploy, which is the correct tradeoff here — a
 *  restart every few days is not an attack window worth a Redis dependency.
 *
 *  All of this runs on `onRequest`, i.e. *before* `identityHook` — a rejected
 *  request therefore doesn't reach the "mint a guest User row" branch, so
 *  hammering these endpoints can't inflate the `User` table either. */

/** Auth is answered in codes, never prose (#208) — this keeps 429 the same
 *  shape as `invalid_credentials` so `ApiError.code` on the client can carry
 *  it into a translated sentence like every other auth failure. */
function rateLimitedBody() {
  // The plugin *throws* whatever this returns, so it travels through
  // Fastify's error path — hence `statusCode`, without which a thrown plain
  // object is an unhandled 500.
  return { statusCode: 429, error: 'rate_limited', message: 'Too many requests' }
}

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    // Nothing is limited unless a route asks for it. A blanket default would
    // silently cover snapshot uploads and thumbnail writes, whose real-world
    // rates nobody has measured yet — see #324 for when that gets numbers.
    global: false,
    errorResponseBuilder: rateLimitedBody,
  })
}

/** Per-IP ceilings, one per auth route.
 *
 *  Requesting a code is the tightest: it is the only one that spends real
 *  money and someone else's attention (an email), and a legitimate person does
 *  it once per sign-in. The cost of the limit lands on many people signing in
 *  from one address in one hour — a classroom on shared NAT. That's an
 *  accepted miss: the product is remote-first (students join from home over
 *  the internet, see CLAUDE.md), so shared-address bursts are the exception,
 *  and the fix if it ever bites is a number here.
 *
 *  `logout` looks harmless but writes a fresh guest `User` row per call
 *  (authRoutes.ts), so it needs a ceiling of its own or it's a table-growth
 *  endpoint that requires no credentials at all. */
export const CODE_REQUEST_IP_LIMIT = { max: 15, timeWindow: '1 hour' } as const
export const CODE_VERIFY_IP_LIMIT = { max: 20, timeWindow: '5 minutes' } as const
export const LOGOUT_IP_LIMIT = { max: 30, timeWindow: '5 minutes' } as const

/** Failed code entries for one email address, across every IP. */
const FAILED_CODE_EMAIL_LIMIT = { max: 10, timeWindow: '15 minutes' } as const
/** Codes *mailed* to one address, across every IP. Deliberately small and
 *  measured in hours: five sign-in mails an hour is already generous for a
 *  person, and the sixth is what a flood looks like. */
const CODE_REQUEST_EMAIL_LIMIT = { max: 5, timeWindow: '1 hour' } as const

function loginEmailKey(request: FastifyRequest): string {
  const body: unknown = request.body
  const email = body && typeof body === 'object' && 'email' in body && typeof body.email === 'string'
    ? body.email.trim().toLowerCase()
    : ''
  return `login-email:${email}`
}

export interface FailedLoginLimiter {
  /** Reads the counter without spending an attempt. */
  isExhausted(request: FastifyRequest): Promise<boolean>
  /** Spends one attempt. Called only after a sign-in actually fails. */
  countFailure(request: FastifyRequest): Promise<void>
}

/** Codes mailed to one address. Unlike the failure counter, *every* call
 *  spends one — the mail goes out whether or not the address has an account,
 *  so there is no "success" that should be free. */
export function createCodeRequestLimiter(app: FastifyInstance): FailedLoginLimiter {
  const check = app.createRateLimit({ ...CODE_REQUEST_EMAIL_LIMIT, keyGenerator: loginEmailKey })
  return {
    async isExhausted(request) {
      const status = await check(request, { increment: false })
      return !status.isAllowed && status.remaining <= 0
    },
    async countFailure(request) {
      await check(request)
    },
  }
}

/** Built once per app instance — the returned pair shares one counter.
 *
 *  This one can't be a route config like the others: the key is in the
 *  request *body*, which isn't parsed yet at `onRequest`, and it must count
 *  outcomes rather than requests. `createRateLimit` exists for exactly that. */
export function createFailedLoginLimiter(app: FastifyInstance): FailedLoginLimiter {
  const check = app.createRateLimit({ ...FAILED_CODE_EMAIL_LIMIT, keyGenerator: loginEmailKey })
  return {
    async isExhausted(request) {
      const status = await check(request, { increment: false })
      // `remaining`, not `isExceeded` — the latter is `current > max`, which
      // on a peek (nothing spent yet) still reads false at exactly `max` and
      // would hand out one attempt past the budget.
      return !status.isAllowed && status.remaining <= 0
    },
    async countFailure(request) {
      await check(request)
    },
  }
}
