import { createHash, randomBytes, randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'

import { prisma } from './prisma.js'

/** Issuing and redeeming one-time sign-in codes (#316).
 *
 *  Kept out of authRoutes.ts because the rules here are the security model,
 *  and they are easier to hold in one piece: a code is six digits, lives ten
 *  minutes, survives five wrong guesses, works once, and only in the browser
 *  that asked for it.
 *
 *  Why six digits and not a long random string: the code is typed by hand,
 *  often from a phone's lock screen onto a tablet. Length is paid for by the
 *  person every single sign-in; the security it would buy is already bought by
 *  the attempt ceiling, which is what makes a small search space unusable. */

export const CODE_TTL_MS = 10 * 60 * 1000
export const ATTEMPT_LIMIT = 5
/** Minimum spacing between two codes for one address. Enforced here, not just
 *  by a disabled button, because the cost of ignoring it lands on someone
 *  else's mailbox. */
export const RESEND_COOLDOWN_MS = 60 * 1000

const BCRYPT_ROUNDS = 10
const NONCE_BYTES = 24
/** No 0/O/1/I: the phrase is read off a screen and compared to a mail on
 *  another device, so shapes that look alike would make it useless. */
const PHRASE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PHRASE_LENGTH = 4

/** Lowercased and trimmed everywhere — a mailbox is not case-sensitive in
 *  practice, and "the code went to Teacher@x.com but I asked as teacher@x.com"
 *  is an unexplainable failure. Applied on both write and read paths. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** `randomInt` rather than `Math.random()` or a modulo of random bytes: it is
 *  CSPRNG-backed and rejection-samples, so every code is equally likely. A
 *  skewed distribution here would quietly shrink the search space. */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function generateNonce(): string {
  return randomBytes(NONCE_BYTES).toString('base64url')
}

/** Four characters derived from the nonce, shown on the page that requested
 *  the code and repeated in the mail.
 *
 *  It defends the half the nonce cookie can't: the cookie proves to *us* which
 *  browser is redeeming, but the person still has to know that the mail in
 *  their inbox belongs to the page in front of them and not to someone else's
 *  sign-in attempt that they were talked into completing. Derived rather than
 *  stored so it cannot drift from the nonce it describes. */
export function confirmationPhrase(nonce: string): string {
  const digest = createHash('sha256').update(nonce).digest()
  let phrase = ''
  for (let i = 0; i < PHRASE_LENGTH; i++) {
    phrase += PHRASE_ALPHABET[digest[i] % PHRASE_ALPHABET.length]
  }
  return phrase
}

export interface IssuedCode {
  code: string
  nonce: string
  confirmation: string
  expiresAt: Date
}

export interface CooldownResult {
  retryAfterMs: number
}

/** Global sweep is opportunistic — see `sweepExpired`. */
let lastSweepAt = 0
const SWEEP_INTERVAL_MS = 60 * 60 * 1000

/** Rows outlive their usefulness by definition (a code is dead the moment it
 *  is used or expires), and the endpoint that creates them needs no
 *  credentials — so without this the table is an unbounded write target.
 *  Done opportunistically on issue rather than on a timer: one server process,
 *  and a timer would keep a handle alive in tests for no benefit. */
async function sweepExpired(now: Date): Promise<void> {
  if (now.getTime() - lastSweepAt < SWEEP_INTERVAL_MS) return
  lastSweepAt = now.getTime()
  await prisma.loginCode.deleteMany({ where: { expiresAt: { lt: now } } })
}

/** Issues a fresh code for `email`, killing any earlier live ones.
 *
 *  Returns the cooldown instead of a code when asked again too soon. That is
 *  not rate limiting in the #237 sense (which counts requests per IP and per
 *  address); it is the floor under how often *anyone* can put a mail in this
 *  particular mailbox. */
export async function issueCode(email: string, now = new Date()): Promise<IssuedCode | CooldownResult> {
  const normalized = normalizeEmail(email)

  const newest = await prisma.loginCode.findFirst({
    where: { email: normalized },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, consumedAt: true },
  })
  if (newest && !newest.consumedAt) {
    const elapsed = now.getTime() - newest.createdAt.getTime()
    if (elapsed < RESEND_COOLDOWN_MS) return { retryAfterMs: RESEND_COOLDOWN_MS - elapsed }
  }

  // Every earlier code for this address dies now, used or not: two live codes
  // double the guessing surface for no gain, and "the older mail still works"
  // is the kind of surprise that outlives the person who wrote it.
  await prisma.loginCode.deleteMany({ where: { email: normalized } })
  await sweepExpired(now)

  const code = generateCode()
  const nonce = generateNonce()
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS)

  await prisma.loginCode.create({
    data: {
      email: normalized,
      codeHash: await bcrypt.hash(code, BCRYPT_ROUNDS),
      requestNonce: nonce,
      expiresAt,
    },
  })

  return { code, nonce, confirmation: confirmationPhrase(nonce), expiresAt }
}

export type RedeemFailure =
  | 'invalid_code'
  | 'code_expired'
  | 'attempts_exhausted'
  /** Right code, wrong browser — the phishing path, and also what a person
   *  sees if they open the app somewhere else after asking for the code. */
  | 'wrong_browser'

export type RedeemResult = { ok: true } | { ok: false; reason: RedeemFailure }

/** Spends one attempt against the newest code for `email`.
 *
 *  A wrong-browser attempt costs an attempt like any other. That is the point:
 *  an attacker who has talked the code out of someone should burn it, so the
 *  owner's own next attempt fails and they ask for a new one — a failed
 *  sign-in is a much better outcome than a stolen one. */
export async function redeemCode(
  email: string,
  code: string,
  nonce: string | undefined,
  now = new Date(),
): Promise<RedeemResult> {
  const normalized = normalizeEmail(email)
  const record = await prisma.loginCode.findFirst({
    where: { email: normalized },
    orderBy: { createdAt: 'desc' },
  })

  // No code, already used, or expired all read as the same thing to the
  // caller's UI ("ask for a new one"), but they are separated here because
  // "it expired" is worth saying out loud — otherwise a person who took eleven
  // minutes concludes the product is broken.
  if (!record || record.consumedAt) return { ok: false, reason: 'invalid_code' }
  if (record.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'code_expired' }
  if (record.attempts >= ATTEMPT_LIMIT) return { ok: false, reason: 'attempts_exhausted' }

  const matches = await bcrypt.compare(code, record.codeHash)
  const sameBrowser = Boolean(nonce) && nonce === record.requestNonce

  if (!matches || !sameBrowser) {
    const attempts = record.attempts + 1
    await prisma.loginCode.update({ where: { id: record.id }, data: { attempts } })
    if (attempts >= ATTEMPT_LIMIT) return { ok: false, reason: 'attempts_exhausted' }
    return { ok: false, reason: matches ? 'wrong_browser' : 'invalid_code' }
  }

  // Consumed before the caller does anything with the result: whatever happens
  // next (creating a user, setting a cookie) must not be replayable with the
  // same code.
  await prisma.loginCode.update({ where: { id: record.id }, data: { consumedAt: now } })
  return { ok: true }
}
