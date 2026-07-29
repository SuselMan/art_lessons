import { describe, expect, it } from 'vitest'

import { connectionNotice, type ConnectionNoticeInput } from './connectionNotice'

// The four fields default to the ordinary steady state — a connected socket
// with an empty queue — so each test names only what it is actually about.
const state = (over: Partial<ConnectionNoticeInput> = {}): ConnectionNoticeInput => ({
  connected: true, everConnected: true, pending: 0, stalled: 0, ...over,
})

describe('connectionNotice', () => {
  it('says nothing while connected with an empty queue', () => {
    expect(connectionNotice(state())).toBeNull()
  })

  it('stays silent through a room\'s first handshake', () => {
    // The regression this exists for: `connected` is false on every room
    // mount until the socket completes, and reporting that as a lost
    // connection put "No connection — reconnecting…" on screen during the
    // loading preloader, every single time a room was opened.
    expect(connectionNotice(state({ connected: false, everConnected: false }))).toBeNull()
  })

  it('reports queued work during that first handshake anyway', () => {
    // Hydrated from IndexedDB before any connection exists (#313) — this
    // message is about the work, not about the socket.
    expect(connectionNotice(state({ connected: false, everConnected: false, pending: 3 })))
      .toEqual({ key: 'room.connection.offlineWithPending', n: 3 })
  })

  it('reports a drop after the socket had been up, even with nothing queued', () => {
    expect(connectionNotice(state({ connected: false })))
      .toEqual({ key: 'room.connection.offline', n: 0 })
  })

  it('counts unsent work while offline', () => {
    expect(connectionNotice(state({ connected: false, pending: 2 })))
      .toEqual({ key: 'room.connection.offlineWithPending', n: 2 })
  })

  it('stays up through the post-reconnect drain', () => {
    expect(connectionNotice(state({ pending: 5 })))
      .toEqual({ key: 'room.connection.syncing', n: 5 })
  })

  it('distinguishes work that has given up retrying from work still in flight', () => {
    expect(connectionNotice(state({ pending: 5, stalled: 2 })))
      .toEqual({ key: 'room.connection.stalled', n: 2 })
  })
})
