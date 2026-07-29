import type { FastifyInstance } from 'fastify'

import { prisma } from './prisma.js'
import { IDENTITY_COOKIE, identityCookieOptions, signIdentityToken } from './identity.js'
import { sendEmail } from './email.js'
import { buildLoginCodeEmail, isEmailLocale } from './loginCodeEmail.js'
import {
  CODE_TTL_MS,
  isValidEmail,
  issueCode,
  normalizeEmail,
  redeemCode,
} from './loginCodes.js'
import {
  createCodeRequestLimiter,
  createFailedLoginLimiter,
  CODE_REQUEST_IP_LIMIT,
  CODE_VERIFY_IP_LIMIT,
  LOGOUT_IP_LIMIT,
} from './rateLimit.js'

/** Sign-in (#316), plus `/api/me` so the client can tell "am I logged in"
 *  apart from "am I just an anonymous guest with a cookie" (both have a valid
 *  identity cookie; only one has an email).
 *
 *  There is no password anywhere in here, and no separate registration: a
 *  code is mailed to an address, and entering it either signs into the account
 *  that address already has or creates one. Recovery isn't a second flow that
 *  needs building — it *is* this flow, which is the reason the password went
 *  away (see #314 §2 for the decision).
 *
 *  Signing in doesn't mint a *new* identity when it can avoid it: it fills in
 *  `email` on whichever `User` row `request.userId` already resolves to (see
 *  identityHook), so a room you created anonymously in this browser is still
 *  yours the moment you sign in. */

/** Short-lived cookie tying a code to the browser that asked for it. Same
 *  attributes as the identity cookie (see identityCookieOptions) except the
 *  lifetime, which is the code's. */
const LOGIN_NONCE_COOKIE = 'al_login_nonce'

function loginNonceCookieOptions() {
  return { ...identityCookieOptions(), maxAge: Math.floor(CODE_TTL_MS / 1000) }
}

export function registerAuthRoutes(app: FastifyInstance): void {
  const failedCodes = createFailedLoginLimiter(app)
  const codeRequests = createCodeRequestLimiter(app)

  // Unthrottled on purpose: a plain read, and every page load makes exactly
  // one of them (main.tsx) — a limit here would fire on people, not attackers.
  app.get('/api/me', async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: { id: true, email: true, name: true },
    })
    return { userId: request.userId, email: user?.email ?? null, name: user?.name ?? null }
  })

  app.post<{ Body: { email: string; locale?: string } }>('/api/auth/code/request', {
    config: { rateLimit: CODE_REQUEST_IP_LIMIT },
  }, async (request, reply) => {
    const { email, locale } = request.body ?? {}
    if (!email || !isValidEmail(email)) return reply.code(400).send({ error: 'invalid_email' })

    // Checked before anything is written or mailed, and keyed by address:
    // this endpoint puts mail in a mailbox nobody had to prove they own.
    if (await codeRequests.isExhausted(request)) {
      return reply.code(429).send({ error: 'rate_limited' })
    }

    const issued = await issueCode(email)
    if ('retryAfterMs' in issued) {
      return reply
        .code(429)
        .send({ error: 'code_cooldown', retryAfterSeconds: Math.ceil(issued.retryAfterMs / 1000) })
    }
    await codeRequests.countFailure(request)

    try {
      await sendEmail({
        to: normalizeEmail(email),
        ...buildLoginCodeEmail({
          code: issued.code,
          confirmation: issued.confirmation,
          ttlMinutes: Math.round(CODE_TTL_MS / 60_000),
          locale: isEmailLocale(locale) ? locale : 'en',
        }),
      })
    } catch (err) {
      // Said out loud rather than swallowed: the person is looking at an empty
      // inbox either way, and "we couldn't send it" is the difference between
      // retrying and concluding they typed the address wrong.
      request.log.error({ err }, 'failed to send login code')
      return reply.code(502).send({ error: 'email_failed' })
    }

    reply.setCookie(LOGIN_NONCE_COOKIE, issued.nonce, loginNonceCookieOptions())
    // No hint about whether this address has an account: not to hide it (a
    // code is mailed either way, so there is nothing to hide), but because the
    // client has no use for the distinction — the next screen is the same one.
    return {
      confirmation: issued.confirmation,
      expiresAt: issued.expiresAt.toISOString(),
    }
  })

  app.post<{ Body: { email: string; code: string } }>('/api/auth/code/verify', {
    config: { rateLimit: CODE_VERIFY_IP_LIMIT },
  }, async (request, reply) => {
    const { email, code } = request.body ?? {}
    if (!email || !code) return reply.code(400).send({ error: 'invalid_code' })

    // Read before the bcrypt comparison, so an exhausted address also stops
    // costing CPU; spent only on a genuine failure, so a correct code is never
    // refused for attempts that weren't the owner's (#237).
    if (await failedCodes.isExhausted(request)) {
      return reply.code(429).send({ error: 'rate_limited' })
    }

    const result = await redeemCode(email, code, request.cookies[LOGIN_NONCE_COOKIE])
    if (!result.ok) {
      await failedCodes.countFailure(request)
      const status = result.reason === 'attempts_exhausted' ? 429 : 401
      return reply.code(status).send({ error: result.reason })
    }

    const user = await claimIdentity(request.userId, normalizeEmail(email))

    // The nonce is spent with the code — leaving it would let a second tab
    // that never asked for anything look like the browser that did.
    reply.clearCookie(LOGIN_NONCE_COOKIE, loginNonceCookieOptions())
    reply.setCookie(IDENTITY_COOKIE, signIdentityToken(user.id), identityCookieOptions())
    return { userId: user.id, email: user.email, name: user.name }
  })

  app.post('/api/auth/logout', {
    config: { rateLimit: LOGOUT_IP_LIMIT },
  }, async (request, reply) => {
    // Logging out drops back to a *fresh* anonymous guest identity rather
    // than clearing the cookie outright — every future request still needs
    // some User row to attribute new rooms/operations to (see identityHook).
    const guest = await prisma.user.create({ data: {} })
    reply.setCookie(IDENTITY_COOKIE, signIdentityToken(guest.id), identityCookieOptions())
    return { userId: guest.id, email: null, name: null }
  })
}

interface ClaimedUser {
  id: string
  email: string | null
  name: string | null
}

/** Decides which `User` row a proven address belongs to. Three cases, and the
 *  difference between them is who keeps which rooms:
 *
 *  1. **The address already has an account** — sign in as it. The guest row
 *     this browser was using is abandoned where it sits, rooms and all: they
 *     stay owned by that now-orphaned id, unreachable from any account. Same
 *     tradeoff as the identity cookie generally — it's device/browser-scoped,
 *     not something a sign-in retroactively merges (see the #41 discussion).
 *  2. **New address, and this browser is an anonymous guest** — fill the
 *     address in on that same row. This is the case worth having: rooms drawn
 *     before signing up stay with the person who drew them.
 *  3. **New address, but this browser is already signed in as someone else** —
 *     a fresh row. Upgrading in place here would rename an existing account
 *     and hand its rooms to whoever proved the *new* address. */
async function claimIdentity(currentUserId: string, email: string): Promise<ClaimedUser> {
  const select = { id: true, email: true, name: true } as const

  const existing = await prisma.user.findUnique({ where: { email }, select })
  if (existing) return existing

  const current = await prisma.user.findUnique({ where: { id: currentUserId }, select })
  if (current && current.email === null) {
    return prisma.user.update({ where: { id: currentUserId }, data: { email }, select })
  }

  return prisma.user.create({ data: { email }, select })
}
