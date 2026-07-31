import { describe, expect, it } from 'vitest'

import { syncStatus } from './syncStatus'

describe('syncStatus', () => {
  it('is saved when the socket is up and the queue is empty', () => {
    expect(syncStatus({ connected: true, pending: 0 })).toBe('saved')
  })

  it('is syncing while anything is still queued', () => {
    expect(syncStatus({ connected: true, pending: 1 })).toBe('syncing')
  })

  it('is offline while the socket is down, even with an empty queue', () => {
    // The queue being empty *now* says nothing about the next stroke, and a
    // green "Saved" beside a dead socket is the one lie this indicator must
    // never tell. ConnectionBanner is what explains the reason.
    expect(syncStatus({ connected: false, pending: 0 })).toBe('offline')
  })

  it('reports the connection rather than the queue when both are bad', () => {
    // "Syncing…" would be the more optimistic of the two and also the false
    // one: nothing is going anywhere until the socket is back.
    expect(syncStatus({ connected: false, pending: 4 })).toBe('offline')
  })
})
