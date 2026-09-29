import { describe, expect, it } from 'vitest'

import { notOpenScreen } from './notOpenScreen'

const loading = {
  roomContentReady: false, connected: true, offlineGraceElapsed: false, paperFailed: false, restoreFailure: null,
} as const

describe('notOpenScreen', () => {
  it('is nothing once the room is open, whatever else is wrong', () => {
    expect(notOpenScreen({ ...loading, roomContentReady: true, connected: false, offlineGraceElapsed: true })).toBeNull()
  })

  it('is the preloader while nothing has failed', () => {
    expect(notOpenScreen(loading)).toBe('loading')
  })

  it('reports offline only after the grace period', () => {
    expect(notOpenScreen({ ...loading, connected: false })).toBe('loading')
    expect(notOpenScreen({ ...loading, connected: false, offlineGraceElapsed: true })).toBe('offline')
  })

  it('lets offline win over a paper failure it explains', () => {
    expect(notOpenScreen({ ...loading, connected: false, offlineGraceElapsed: true, paperFailed: true })).toBe('offline')
    expect(notOpenScreen({ ...loading, paperFailed: true })).toBe('paperFailed')
  })

  it('puts a failed restore behind both', () => {
    expect(notOpenScreen({ ...loading, paperFailed: true, restoreFailure: 'transfer' })).toBe('paperFailed')
    expect(notOpenScreen({ ...loading, restoreFailure: 'transfer' })).toBe('restoreFailed')
  })
})
