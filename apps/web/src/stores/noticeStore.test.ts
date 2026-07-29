import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearNotices,
  dismissNotice,
  notifyError,
  notifySuccess,
  pushNotice,
  updateNotice,
  useNoticeStore,
} from './noticeStore'

function notices() {
  return useNoticeStore.getState().notices
}

beforeEach(() => {
  vi.useFakeTimers()
  clearNotices()
})

afterEach(() => {
  clearNotices()
  vi.useRealTimers()
})

describe('pushNotice', () => {
  it('returns an id that identifies the notice it pushed', () => {
    const id = pushNotice({ variant: 'error', message: 'boom' })
    expect(notices()).toHaveLength(1)
    expect(notices()[0].id).toBe(id)
    expect(notices()[0].message).toBe('boom')
  })

  it('defaults to the bottom edge', () => {
    pushNotice({ variant: 'error', message: 'boom' })
    expect(notices()[0].position).toBe('bottom')
  })

  it('keeps pushes in arrival order', () => {
    pushNotice({ variant: 'error', message: 'first' })
    pushNotice({ variant: 'error', message: 'second' })
    expect(notices().map(n => n.message)).toEqual(['first', 'second'])
  })
})

describe('lifetime', () => {
  it('auto-dismisses a success after its default duration', () => {
    notifySuccess('saved')
    expect(notices()).toHaveLength(1)
    vi.advanceTimersByTime(4000)
    expect(notices()).toHaveLength(0)
  })

  it('leaves an error up indefinitely', () => {
    notifyError('could not delete')
    vi.advanceTimersByTime(60_000)
    expect(notices()).toHaveLength(1)
  })

  // The rule that makes a sticky notice safe: something that never leaves on
  // its own must always offer a way out.
  it('makes anything without a duration dismissible', () => {
    notifyError('could not delete')
    expect(notices()[0].dismissible).toBe(true)
  })

  it('honours an explicit duration over the variant default', () => {
    notifyError('transient', { durationMs: 1000 })
    vi.advanceTimersByTime(999)
    expect(notices()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(notices()).toHaveLength(0)
  })

  it('honours an explicit null duration over the variant default', () => {
    notifySuccess('stays', { durationMs: null })
    vi.advanceTimersByTime(60_000)
    expect(notices()).toHaveLength(1)
  })

  it('does not fire a dismissed notice\'s timer afterwards', () => {
    const id = notifySuccess('saved')
    dismissNotice(id)
    expect(notices()).toHaveLength(0)
    // A stale timer firing here would be harmless today but would remove
    // whatever notice reused the id later; the timer must be cancelled, not
    // merely ignored.
    pushNotice({ variant: 'error', message: 'later' })
    vi.advanceTimersByTime(60_000)
    expect(notices().map(n => n.message)).toEqual(['later'])
  })
})

describe('collapsing by key', () => {
  it('replaces in place instead of stacking a duplicate', () => {
    const first = pushNotice({ variant: 'error', message: 'attempt failed', key: 'delete-room' })
    const second = pushNotice({ variant: 'error', message: 'attempt failed again', key: 'delete-room' })
    expect(second).toBe(first)
    expect(notices()).toHaveLength(1)
    expect(notices()[0].message).toBe('attempt failed again')
  })

  it('keeps the collapsed notice in its original slot', () => {
    pushNotice({ variant: 'error', message: 'keyed', key: 'k' })
    pushNotice({ variant: 'error', message: 'other' })
    pushNotice({ variant: 'error', message: 'keyed again', key: 'k' })
    expect(notices().map(n => n.message)).toEqual(['keyed again', 'other'])
  })

  it('restarts the timer of the notice it collapsed onto', () => {
    pushNotice({ variant: 'success', message: 'first', key: 'k', durationMs: 1000 })
    vi.advanceTimersByTime(900)
    pushNotice({ variant: 'success', message: 'second', key: 'k', durationMs: 1000 })
    vi.advanceTimersByTime(900)
    expect(notices()).toHaveLength(1)
    vi.advanceTimersByTime(100)
    expect(notices()).toHaveLength(0)
  })

  it('frees the key once dismissed, so the next push is a fresh notice', () => {
    const first = pushNotice({ variant: 'error', message: 'a', key: 'k' })
    dismissNotice(first)
    const second = pushNotice({ variant: 'error', message: 'b', key: 'k' })
    expect(second).not.toBe(first)
    expect(notices()).toHaveLength(1)
  })

  it('does not collapse unkeyed pushes together', () => {
    pushNotice({ variant: 'error', message: 'a' })
    pushNotice({ variant: 'error', message: 'a' })
    expect(notices()).toHaveLength(2)
  })
})

describe('updateNotice', () => {
  it('changes a notice already on screen without replacing it', () => {
    const id = pushNotice({ variant: 'warning', message: '1 pending' })
    updateNotice(id, { message: '2 pending' })
    expect(notices()).toHaveLength(1)
    expect(notices()[0].id).toBe(id)
    expect(notices()[0].message).toBe('2 pending')
  })

  it('ignores an id that is no longer up', () => {
    const id = pushNotice({ variant: 'warning', message: 'gone' })
    dismissNotice(id)
    updateNotice(id, { message: 'back?' })
    expect(notices()).toHaveLength(0)
  })
})
