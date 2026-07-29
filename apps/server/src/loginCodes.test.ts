import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ATTEMPT_LIMIT,
  CODE_TTL_MS,
  confirmationPhrase,
  generateCode,
  issueCode,
  normalizeEmail,
  redeemCode,
  RESEND_COOLDOWN_MS,
} from './loginCodes.js'

// The rules a one-time code has to obey (#316), tested where they live. The
// route tests mock this module out precisely so these can be exhaustive here
// instead of re-derived through HTTP.
const mockPrisma = vi.hoisted(() => ({
  loginCode: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
}))
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))

// Real bcrypt is ~100 ms per call by design; these tests make dozens.
// `hash` returns a marker the fake `compare` can check, so the "is the stored
// hash the one this code produces" property still holds.
const mockBcrypt = vi.hoisted(() => ({
  hash: vi.fn((value: string) => Promise.resolve(`hashed:${value}`)),
  compare: vi.fn((value: string, hash: string) => Promise.resolve(hash === `hashed:${value}`)),
}))
vi.mock('bcryptjs', () => ({ default: mockBcrypt }))

const NOW = new Date('2026-07-29T12:00:00Z')

function liveCode(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'code-1',
    email: 'teacher@example.com',
    codeHash: 'hashed:123456',
    requestNonce: 'nonce-abc',
    attempts: 0,
    expiresAt: new Date(NOW.getTime() + CODE_TTL_MS),
    consumedAt: null,
    createdAt: NOW,
    ...overrides,
  }
}

beforeEach(() => {
  mockPrisma.loginCode.findFirst.mockReset()
  mockPrisma.loginCode.create.mockReset()
  mockPrisma.loginCode.update.mockReset()
  mockPrisma.loginCode.deleteMany.mockReset()
  mockPrisma.loginCode.findFirst.mockResolvedValue(null)
  mockPrisma.loginCode.create.mockResolvedValue({})
  mockPrisma.loginCode.update.mockResolvedValue({})
  mockPrisma.loginCode.deleteMany.mockResolvedValue({ count: 0 })
})

describe('generating a code', () => {
  it('is always six digits, leading zeros included', () => {
    // A code that sometimes renders as five characters would be rejected by
    // an input that (correctly) expects six.
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^\d{6}$/)
    }
  })

  it('derives the confirmation phrase from the nonce, deterministically', () => {
    const phrase = confirmationPhrase('nonce-abc')

    expect(phrase).toBe(confirmationPhrase('nonce-abc'))
    expect(phrase).not.toBe(confirmationPhrase('nonce-xyz'))
    // No 0/O/1/I — the phrase is compared across two screens by eye.
    expect(phrase).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/)
  })

  it('treats an address as the mailbox it is, not as the string it was typed as', () => {
    expect(normalizeEmail('  Teacher@Example.COM ')).toBe('teacher@example.com')
  })
})

describe('issuing a code', () => {
  it('stores it hashed, with a ten-minute life', async () => {
    const issued = await issueCode('Teacher@example.com', NOW)

    expect('code' in issued && issued.code).toMatch(/^\d{6}$/)
    const row = mockPrisma.loginCode.create.mock.calls[0][0].data
    expect(row.email).toBe('teacher@example.com')
    // The plaintext must not be what's written down: this table is exactly
    // what a database dump hands over. Asserted as "the column holds what
    // bcrypt returned", since the stand-in hash in these tests is readable by
    // design and a substring check would prove nothing either way.
    const code = ('code' in issued && issued.code) as string
    expect(mockBcrypt.hash).toHaveBeenCalledWith(code, expect.any(Number))
    expect(row.codeHash).not.toBe(code)
    expect(row.codeHash).toBe(await mockBcrypt.hash(code))
    expect(row.expiresAt.getTime() - NOW.getTime()).toBe(CODE_TTL_MS)
  })

  it('kills every earlier code for the address', async () => {
    await issueCode('teacher@example.com', NOW)

    // Two live codes double the guessing surface and make "the older mail
    // still works" a rule someone has to know.
    expect(mockPrisma.loginCode.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'teacher@example.com' } }),
    )
  })

  it('refuses to send a second one within the cooldown', async () => {
    mockPrisma.loginCode.findFirst.mockResolvedValue(liveCode({ createdAt: new Date(NOW.getTime() - 20_000) }))

    const result = await issueCode('teacher@example.com', NOW)

    expect(result).toEqual({ retryAfterMs: RESEND_COOLDOWN_MS - 20_000 })
    expect(mockPrisma.loginCode.create).not.toHaveBeenCalled()
  })

  it('allows a new one once the cooldown has passed', async () => {
    mockPrisma.loginCode.findFirst.mockResolvedValue(
      liveCode({ createdAt: new Date(NOW.getTime() - RESEND_COOLDOWN_MS - 1) }),
    )

    expect(await issueCode('teacher@example.com', NOW)).toHaveProperty('code')
  })

  it('does not make someone wait on a code they already used', async () => {
    // Signed in, signed out, signing back in — the cooldown protects a
    // mailbox from repeat mail, and a consumed code sent no new mail.
    mockPrisma.loginCode.findFirst.mockResolvedValue(
      liveCode({ createdAt: new Date(NOW.getTime() - 5_000), consumedAt: new Date(NOW.getTime() - 4_000) }),
    )

    expect(await issueCode('teacher@example.com', NOW)).toHaveProperty('code')
  })
})

describe('redeeming a code', () => {
  it('accepts the right code from the browser that asked for it, once', async () => {
    mockPrisma.loginCode.findFirst.mockResolvedValue(liveCode())

    expect(await redeemCode('Teacher@example.com', '123456', 'nonce-abc', NOW)).toEqual({ ok: true })
    // Consumed before the caller can act on the result, so nothing that
    // happens next is replayable with the same code.
    expect(mockPrisma.loginCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'code-1' }, data: { consumedAt: NOW } }),
    )
  })

  it('refuses a code that was already used', async () => {
    mockPrisma.loginCode.findFirst.mockResolvedValue(liveCode({ consumedAt: NOW }))

    expect(await redeemCode('teacher@example.com', '123456', 'nonce-abc', NOW))
      .toEqual({ ok: false, reason: 'invalid_code' })
  })

  it('says out loud when a code has expired', async () => {
    mockPrisma.loginCode.findFirst.mockResolvedValue(
      liveCode({ expiresAt: new Date(NOW.getTime() - 1) }),
    )

    // Not folded into `invalid_code`: someone who took eleven minutes should
    // be told to ask for a new code, not that they typed it wrong.
    expect(await redeemCode('teacher@example.com', '123456', 'nonce-abc', NOW))
      .toEqual({ ok: false, reason: 'code_expired' })
  })

  it('spends an attempt on a wrong guess', async () => {
    mockPrisma.loginCode.findFirst.mockResolvedValue(liveCode({ attempts: 1 }))

    expect(await redeemCode('teacher@example.com', '000000', 'nonce-abc', NOW))
      .toEqual({ ok: false, reason: 'invalid_code' })
    expect(mockPrisma.loginCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: 2 } }),
    )
  })

  it('burns the code after enough wrong guesses', async () => {
    mockPrisma.loginCode.findFirst.mockResolvedValue(liveCode({ attempts: ATTEMPT_LIMIT - 1 }))

    // This is what makes six digits safe: a million possibilities matter only
    // if you're allowed to walk them.
    expect(await redeemCode('teacher@example.com', '000000', 'nonce-abc', NOW))
      .toEqual({ ok: false, reason: 'attempts_exhausted' })
  })

  it('refuses further guesses once burnt, without touching bcrypt', async () => {
    mockPrisma.loginCode.findFirst.mockResolvedValue(liveCode({ attempts: ATTEMPT_LIMIT }))
    mockBcrypt.compare.mockClear()

    expect(await redeemCode('teacher@example.com', '123456', 'nonce-abc', NOW))
      .toEqual({ ok: false, reason: 'attempts_exhausted' })
    expect(mockBcrypt.compare).not.toHaveBeenCalled()
  })

  it('refuses the right code in the wrong browser, and spends an attempt doing it', async () => {
    mockPrisma.loginCode.findFirst.mockResolvedValue(liveCode())

    // The attack this flow is actually exposed to: someone is talked into
    // reading their code out over the phone. The attacker's browser never had
    // the nonce cookie — and the attempt they spend burns the code towards
    // its ceiling, so the owner's next try fails and they ask for a new one.
    expect(await redeemCode('teacher@example.com', '123456', 'attacker-nonce', NOW))
      .toEqual({ ok: false, reason: 'wrong_browser' })
    expect(mockPrisma.loginCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: 1 } }),
    )
  })

  it('refuses the right code with no nonce at all', async () => {
    mockPrisma.loginCode.findFirst.mockResolvedValue(liveCode())

    expect(await redeemCode('teacher@example.com', '123456', undefined, NOW))
      .toEqual({ ok: false, reason: 'wrong_browser' })
  })

  it('refuses when there is no code for the address', async () => {
    mockPrisma.loginCode.findFirst.mockResolvedValue(null)

    expect(await redeemCode('nobody@example.com', '123456', 'nonce-abc', NOW))
      .toEqual({ ok: false, reason: 'invalid_code' })
  })
})
