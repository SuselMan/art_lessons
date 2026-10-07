import { describe, expect, it } from 'vitest'

import { SnapshotLedger } from './snapshotLedger'

/** (#494) A layer's standing with the stored snapshot, on its own. The
 *  engine-level list of paths that must mark a layer dirty is held complete
 *  by index.snapshotDirty.test.ts; this is the bookkeeping underneath it. */

describe('anything new to publish (#373)', () => {
  it('is nothing for a layer nobody has painted', () => {
    expect(new SnapshotLedger().isDirty('background')).toBe(false)
  })

  it('is something after a change, and nothing once published', () => {
    const l = new SnapshotLedger()
    l.markDirty('L')
    expect(l.isDirty('L')).toBe(true)
    l.markPublished('L')
    expect(l.isDirty('L')).toBe(false)
    l.markDirty('L')
    expect(l.isDirty('L')).toBe(true)
  })

  // A restore is marked changed and published in one go: those pixels are
  // exactly what the server already holds, so nobody re-uploads them.
  it('treats restored pixels as already published', () => {
    const l = new SnapshotLedger()
    l.markDirty('L')
    l.markPublished('L')
    expect(l.isDirty('L')).toBe(false)
  })
})

describe('what restored pixels already contain (#374)', () => {
  it('covers operations up to and including the snapshot’s seq, and nothing without a seq', () => {
    const l = new SnapshotLedger()
    l.setCoverage('L', 20)
    expect(l.isCovered('L', 19)).toBe(true)
    expect(l.isCovered('L', 20)).toBe(true)
    expect(l.isCovered('L', 21)).toBe(false)
    expect(l.isCovered('L', undefined)).toBe(false)
    expect(l.isCovered('M', 1)).toBe(false)
    expect(l.hasCoverage('L')).toBe(true)
    expect(l.hasCoverage('M')).toBe(false)
  })
})

describe('whether a layer may be published (#522)', () => {
  it('refuses until a restore makes it authoritative again', () => {
    const l = new SnapshotLedger()
    expect(l.mayPublish('L')).toBe(true)
    l.refusePublishing('L')
    expect(l.mayPublish('L')).toBe(false)
    l.allowPublishing('L')
    expect(l.mayPublish('L')).toBe(true)
  })

  it('drops every refusal when the buffers are gone', () => {
    const l = new SnapshotLedger()
    l.refusePublishing('L')
    l.refusePublishing('M')
    l.clearRefusals()
    expect(l.mayPublish('L') && l.mayPublish('M')).toBe(true)
  })
})

// Empty observations use this token, independently of server publication.
describe('pixel mutation revision', () => {
  it('changes for every write and stays stable across publication and guard changes', () => {
    const ledger = new SnapshotLedger()
    expect(ledger.pixelRevision('A')).toBe(0)
    ledger.markDirty('A')
    const first = ledger.pixelRevision('A')
    ledger.markPublished('A')
    ledger.refusePublishing('A')
    ledger.allowPublishing('A')
    ledger.setCoverage('A', 100)
    expect(ledger.pixelRevision('A')).toBe(first)
    ledger.markDirty('A')
    expect(ledger.pixelRevision('A')).toBe(first + 1)
    expect(ledger.pixelRevision('B')).toBe(0)
  })
})
