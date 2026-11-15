import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SnapshotRestoreOutcome } from '../net/snapshotRestore'

const sentry = vi.hoisted(() => ({ addBreadcrumb: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@sentry/react', () => sentry)
const { reportSnapshotRestore } = await import('./reportRestore')
const GPU = { renderer: 'Test GPU', maxTextureSize: 4096, contextLost: false }
const failed = (error: unknown): SnapshotRestoreOutcome => ({ status: 'failed', stage: 'blobs', error, plan: [], appliedLayerIds: [] })

beforeEach(() => vi.clearAllMocks())

describe('#534 restore failure details', () => {
  it.each([
    [new TypeError('Failed to fetch'), 'TypeError', 'Failed to fetch'],
    [new Error('snapshot blob: 503'), 'Error', 'snapshot blob: 503'],
    [new RangeError('Invalid typed array length'), 'RangeError', 'Invalid typed array length'],
  ])('reports the error class and reason: %s', (error, name, message) => {
    reportSnapshotRestore('room', failed(error), [], GPU)
    expect(sentry.captureMessage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      contexts: { snapshot_restore: expect.objectContaining({ errorName: name, errorMessage: message }) },
    }))
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorName: name, errorMessage: message }) }))
  })

  it('redacts addresses and keeps the stack, cause and body out of the event', () => {
    const error = new TypeError('Failed to fetch https://example.test/api/rooms/private/snapshots?token=secret\nresponse body: private-pixels')
    error.stack = 'private-stack'
    Object.assign(error, { cause: { responseBody: 'private-cause' } })
    reportSnapshotRestore('room', failed(error), [], GPU)
    const payload = JSON.stringify([sentry.captureMessage.mock.calls, sentry.addBreadcrumb.mock.calls])
    for (const forbidden of ['https://', 'example.test', '?token', 'secret', 'private-pixels', 'private-stack', 'private-cause']) expect(payload).not.toContain(forbidden)
    expect(sentry.captureMessage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ contexts: { snapshot_restore: expect.objectContaining({ errorName: 'TypeError', errorMessage: 'Failed to fetch [url]' }) } }))
  })

  it('does not leak a response excerpt from a JSON parser error', () => {
    reportSnapshotRestore('room', failed(new SyntaxError('Unexpected token s, "secret-response-body" is not valid JSON')), [], GPU)
    const payload = JSON.stringify(sentry.captureMessage.mock.calls)
    expect(payload).not.toContain('secret-response-body')
    expect(sentry.captureMessage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ contexts: { snapshot_restore: expect.objectContaining({ errorName: 'SyntaxError', errorMessage: 'Syntax error during snapshot restore' }) } }))
  })

  it.each([null, undefined, { message: 'private-response-body', response: 'private-pixels' }, 'private-response-body'])('handles non-Error throws without serializing payload: %s', error => {
    expect(() => reportSnapshotRestore('room', failed(error), [], GPU)).not.toThrow()
    const payload = JSON.stringify(sentry.captureMessage.mock.calls)
    expect(payload).not.toContain('private-')
    expect(sentry.captureMessage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ contexts: { snapshot_restore: expect.objectContaining({ errorMessage: expect.stringContaining('Non-Error') }) } }))
  })

  it('does not change failure grouping or attach a failure to a missing snapshot', () => {
    reportSnapshotRestore('room', failed(new Error('first')), [], GPU)
    reportSnapshotRestore('room', failed(new TypeError('second')), [], GPU)
    expect(sentry.captureMessage.mock.calls[0][1].fingerprint).toEqual(sentry.captureMessage.mock.calls[1][1].fingerprint)
    vi.clearAllMocks()
    expect(reportSnapshotRestore('room', { status: 'none' }, [], GPU)).toBeNull()
    expect(sentry.captureMessage).not.toHaveBeenCalled()
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled()
  })
})


it.each([
  'Failed to fetch "/api/rooms/private/snapshots?token=secret"',
  'Failed to decode blob:https://example.test/private-id',
  'Failed to decode data:image/png;base64,private-pixels',
  '["private-response-body"]',
])('#534 excludes relative/blob/data addresses and raw payloads: %s', message => {
  reportSnapshotRestore('room', failed(new Error(message)), [], GPU)
  const payload = JSON.stringify(sentry.captureMessage.mock.calls)
  for (const forbidden of ['/api/', 'blob:', 'https://', 'data:', 'private-', 'token=']) expect(payload).not.toContain(forbidden)
})

it('#534 bounds the error message', () => {
  reportSnapshotRestore('room', failed(new Error('x'.repeat(2000))), [], GPU)
  expect(sentry.captureMessage.mock.calls[0][1].contexts.snapshot_restore.errorMessage).toHaveLength(240)
})
