import { describe, expect, it } from 'vitest'

import { syncStatus } from './syncStatus'

describe('syncStatus', () => {
  it('is saved when the socket is up and the queue is empty', () => {
    expect(syncStatus({ connected: true, pending: 0 })).toBe('saved')
  })

  it('is syncing while anything is still queued', () => {
    expect(syncStatus({ connected: true, pending: 1 })).toBe('syncing')
  })

  it('is not saved while the socket is down, even with an empty queue', () => {
    // The queue being empty *now* says nothing about the next stroke, and a
    // green "Saved" beside a dead socket is the one lie this indicator must
    // never tell. ConnectionBanner is what explains the reason.
    expect(syncStatus({ connected: false, pending: 0 })).toBe('syncing')
  })
})
