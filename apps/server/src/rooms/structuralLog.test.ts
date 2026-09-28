import { describe, expect, it } from 'vitest'

import { IMPLICIT_LAYER_IDS, type Operation } from '@grafetto/shared'

import { advanceStructuralLog, buildStructuralLog, deriveLayerIds, type StructuralEntry } from './structuralLog.js'

/** (#612) The server's structural log on its own — the fold that has to stay a
 *  transcription of the client's OperationLog state machine, because the
 *  failure it exists for (#368) was two folds of the same log drifting apart.
 *  Until it left rooms.ts it was reachable only through a room record. */

let n = 0
const base = (userId: string) => ({ id: `op${++n}`, userId, timestamp: 0 })

const add = (userId: string, layerId: string): Operation => ({ ...base(userId), type: 'layer_add', layerId, name: 'L' })
const del = (userId: string, ...layerIds: string[]): Operation => ({ ...base(userId), type: 'layer_delete', layerIds })
const merge = (userId: string, layerId: string, ...sources: string[]): Operation => ({
  ...base(userId), type: 'layer_merge', layerId, name: 'M', sources: sources.map(id => ({ id, opacity: 1 })),
  parentId: null, index: 0,
})
const dup = (userId: string, layerId: string, sourceId: string): Operation => ({
  ...base(userId), type: 'layer_duplicate', layerId, sourceId, name: 'D',
  sourceOpacity: 1, sourceVisible: true, parentId: null, index: 0,
})
const undo = (userId: string, target: Operation): Operation => ({ ...base(userId), type: 'operation_undo', targetOpId: target.id })
const redo = (userId: string, target: Operation): Operation => ({ ...base(userId), type: 'operation_redo', targetOpId: target.id })
const revoke = (userId: string, target: Operation): Operation => ({ ...base(userId), type: 'operation_revoke', targetOpId: target.id })
const stroke = (userId: string): Operation => ({
  ...base(userId), type: 'stroke', layerId: 'layer-1', tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [],
})

const alive = (ops: Operation[]) => [...deriveLayerIds(buildStructuralLog(ops)).aliveIds].sort()

describe('deriveLayerIds', () => {
  it('starts from the implicit layers', () => {
    expect(alive([])).toEqual([...IMPLICIT_LAYER_IDS].sort())
  })

  it('a delete kills its ids, a merge kills its sources and creates its result', () => {
    const ops = [add('a', 'X'), add('a', 'Y'), merge('a', 'M', 'X', 'Y'), add('a', 'Z'), del('a', 'Z')]
    const { aliveIds, deletedIds } = deriveLayerIds(buildStructuralLog(ops))
    expect(aliveIds.has('M')).toBe(true)
    expect([...deletedIds].sort()).toEqual(['X', 'Y', 'Z'])
  })

  // (#449) The source survives being copied — the difference from a merge.
  it('a duplicate creates its copy and destroys nothing', () => {
    const { aliveIds, deletedIds } = deriveLayerIds(buildStructuralLog([add('a', 'X'), dup('a', 'X2', 'X')]))
    expect(aliveIds.has('X') && aliveIds.has('X2')).toBe(true)
    expect(deletedIds.size).toBe(0)
  })
})

describe('advanceStructuralLog', () => {
  it('undo and redo move only the author’s own entry', () => {
    const x = add('a', 'X')
    const entries: StructuralEntry[] = buildStructuralLog([x])
    expect(advanceStructuralLog(entries, undo('b', x))).toBe(false)
    expect(advanceStructuralLog(entries, undo('a', x))).toBe(true)
    expect(entries[0].state).toBe('undone')
    expect(advanceStructuralLog(entries, redo('b', x))).toBe(false)
    expect(advanceStructuralLog(entries, redo('a', x))).toBe(true)
    expect(entries[0].state).toBe('done')
  })

  // A linear log cannot branch: acting after an undo puts it out of reach,
  // and a late redo must not revive a layer every client has written off.
  it('any ordinary operation by the author makes their undone entries gone', () => {
    const x = add('a', 'X')
    const entries = buildStructuralLog([x, undo('a', x), stroke('a')])
    expect(entries[0].state).toBe('gone')
    expect(advanceStructuralLog(entries, redo('a', x))).toBe(false)
    expect(alive([x, undo('a', x), stroke('a'), redo('a', x)])).not.toContain('X')
  })

  it('another author acting leaves the undone entry redoable', () => {
    const x = add('a', 'X')
    const entries = buildStructuralLog([x, undo('a', x), stroke('b')])
    expect(entries[0].state).toBe('undone')
  })

  // A revoke is a teacher's, not the author's: it may target anyone's entry,
  // and it reports a change only if the entry had been done.
  it('a revoke takes any live entry out for good, and says whether that changed anything', () => {
    const x = add('a', 'X')
    const entries = buildStructuralLog([x])
    expect(advanceStructuralLog(entries, revoke('teacher', x))).toBe(true)
    expect(entries[0].state).toBe('gone')
    expect(advanceStructuralLog(entries, revoke('teacher', x))).toBe(false)

    const y = add('a', 'Y')
    const undoneEntries = buildStructuralLog([y, undo('a', y)])
    expect(advanceStructuralLog(undoneEntries, revoke('teacher', y))).toBe(false)
    expect(undoneEntries[0].state).toBe('gone')
  })

  it('records only structural operations, and reports no change for anything else', () => {
    const entries: StructuralEntry[] = []
    expect(advanceStructuralLog(entries, stroke('a'))).toBe(false)
    expect(entries).toHaveLength(0)
    expect(advanceStructuralLog(entries, add('a', 'X'))).toBe(true)
    expect(entries).toHaveLength(1)
  })
})
