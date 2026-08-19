import { describe, expect, it } from 'vitest'
import type { LayerState } from '@grafetto/shared'
import { GL_OUT_OF_MEMORY, type SnapshotRestoreAudit } from '../../engine/src/snapshotAudit'
import { buildRestoreReport, reportProblems, restoreReportTitle } from './restoreReport'
import type { SnapshotRestoreOutcome } from './snapshotRestore'

// (#474) These tests encode the production incident this file was written for:
// room 2xKybCLI restored two live layers, the first came back partial and the
// second blank, `restoreLatestSnapshot` returned success, and nothing anywhere
// noticed. Every case below is a shape that must not be judged 'ok'.

const LAYER_STATE: LayerState = {
  items: {
    'live-a': { kind: 'layer', id: 'live-a', name: 'Layer 2', opacity: 1, visible: true },
    'live-b': { kind: 'layer', id: 'live-b', name: 'Layer 3', opacity: 1, visible: true },
  },
  rootOrder: ['live-b', 'live-a'],
  activeId: 'live-b',
  selectedIds: [],
}

const GPU = { renderer: 'Test GPU', maxTextureSize: 4096, contextLost: false }

function restored(plan: Array<{ layerId: string; seq: number; bytes: number }>): SnapshotRestoreOutcome {
  return { status: 'restored', head: { seq: 4300, layerState: LAYER_STATE }, plan }
}

function audit(over: Partial<SnapshotRestoreAudit> & { layerId: string }): SnapshotRestoreAudit {
  return {
    known: true, tilesIn: 4, tilesUploaded: 4, bytes: 1000, glError: 0,
    residentAfter: 4, withContentAfter: 4, ...over,
  }
}

describe('buildRestoreReport', () => {
  it('says nothing at all when the room has never been baked', () => {
    expect(buildRestoreReport('r', { status: 'none' }, [], GPU)).toBeNull()
  })

  it('judges a restore where every live layer landed as ok', () => {
    const report = buildRestoreReport(
      'r',
      restored([{ layerId: 'live-a', seq: 2200, bytes: 800 }, { layerId: 'live-b', seq: 4300, bytes: 500 }]),
      [audit({ layerId: 'live-a' }), audit({ layerId: 'live-b' })],
      GPU,
    )
    expect(report?.verdict).toBe('ok')
    expect(report?.outOfMemory).toBe(false)
  })

  // The incident itself: GL ran out of memory part way through, so the layer is
  // resident but holds nothing. Before this, that returned success.
  it('catches a layer that reported GL_OUT_OF_MEMORY', () => {
    const report = buildRestoreReport(
      'r',
      restored([{ layerId: 'live-a', seq: 2200, bytes: 800 }]),
      [audit({ layerId: 'live-a', glError: GL_OUT_OF_MEMORY, withContentAfter: 1 })],
      GPU,
    )
    expect(report?.verdict).toBe('incomplete')
    expect(report?.outOfMemory).toBe(true)
    expect(report?.layers[0].problem).toBe('gl-error')
  })

  it('catches a layer that came back blank after a non-empty upload', () => {
    const report = buildRestoreReport(
      'r',
      restored([{ layerId: 'live-b', seq: 4300, bytes: 500 }]),
      [audit({ layerId: 'live-b', withContentAfter: 0 })],
      GPU,
    )
    expect(report?.verdict).toBe('incomplete')
    expect(report?.layers[0].problem).toBe('blank-after-restore')
  })

  it('catches a live layer the loop never applied at all', () => {
    const report = buildRestoreReport(
      'r', restored([{ layerId: 'live-a', seq: 2200, bytes: 800 }]), [], GPU,
    )
    expect(report?.verdict).toBe('incomplete')
    expect(report?.layers[0].problem).toBe('not-applied')
  })

  it('catches a live layer the engine had no buffer for', () => {
    const report = buildRestoreReport(
      'r',
      restored([{ layerId: 'live-a', seq: 2200, bytes: 800 }]),
      [audit({ layerId: 'live-a', known: false, tilesUploaded: 0, residentAfter: 0, withContentAfter: 0 })],
      GPU,
    )
    expect(report?.layers[0].problem).toBe('no-buffer')
  })

  it('catches tiles that were uploaded and are no longer resident', () => {
    const report = buildRestoreReport(
      'r',
      restored([{ layerId: 'live-a', seq: 2200, bytes: 800 }]),
      [audit({ layerId: 'live-a', tilesUploaded: 4, residentAfter: 2, withContentAfter: 2 })],
      GPU,
    )
    expect(report?.layers[0].problem).toBe('tiles-missing')
  })

  // A layer with no stored pixels arrives as operations instead (#369). Judging
  // its emptiness would make every room with an uncovered layer cry wolf.
  it('does not fault a live layer that carried no tiles', () => {
    const report = buildRestoreReport(
      'r',
      restored([{ layerId: 'live-a', seq: 2200, bytes: 0 }]),
      [audit({ layerId: 'live-a', tilesIn: 0, tilesUploaded: 0, residentAfter: 0, withContentAfter: 0 })],
      GPU,
    )
    expect(report?.verdict).toBe('ok')
  })

  // The index lists every layer ever baked, deleted ones included, and the
  // engine drops those on purpose. Counting them is useful; faulting them would
  // make every room that ever deleted a layer report itself broken.
  it('counts a deleted layer as waste, never as a fault', () => {
    const report = buildRestoreReport(
      'r',
      restored([{ layerId: 'live-b', seq: 4300, bytes: 500 }, { layerId: 'deleted', seq: 500, bytes: 935 }]),
      [audit({ layerId: 'live-b' }), audit({ layerId: 'deleted', known: false, tilesUploaded: 0, residentAfter: 0, withContentAfter: 0 })],
      GPU,
    )
    expect(report?.verdict).toBe('ok')
    expect(report?.deadLayers).toBe(1)
    expect(report?.deadBytes).toBe(935)
    expect(report?.layers[1].problem).toBeUndefined()
  })

  // The window restoreLatestSnapshot's own doc comment has always admitted:
  // a blob that inflates badly does so after earlier layers are already in.
  it('reports how many layers were already applied when a restore failed', () => {
    const report = buildRestoreReport('r', {
      status: 'failed',
      stage: 'apply',
      plan: [{ layerId: 'live-b', seq: 4300, bytes: 500 }, { layerId: 'live-a', seq: 2200, bytes: 800 }],
      appliedLayerIds: ['live-b'],
      error: new Error('inflate'),
    }, [audit({ layerId: 'live-b' })], GPU)
    expect(report?.verdict).toBe('failed')
    expect(report?.appliedBeforeFailure).toBe(1)
    expect(report?.stage).toBe('apply')
  })

  it('names a GPU that refuses to identify itself rather than omitting it', () => {
    const report = buildRestoreReport(
      'r', restored([]), [], { renderer: null, maxTextureSize: 2048, contextLost: true },
    )
    expect(report?.gpu.renderer).toBeNull()
    expect(report?.gpu.contextLost).toBe(true)
  })
})

describe('restoreReportTitle', () => {
  // Grouping is the whole reason the title is built by hand: a title carrying a
  // room id would open a fresh Sentry issue per lesson.
  it('names the failure mode and nothing that varies per room', () => {
    const report = buildRestoreReport(
      'room-2xKybCLI',
      restored([{ layerId: 'live-a', seq: 2200, bytes: 800 }]),
      [audit({ layerId: 'live-a', withContentAfter: 0 })],
      GPU,
    )!
    const title = restoreReportTitle(report)
    expect(title).toBe('Snapshot restore incomplete: blank-after-restore')
    expect(title).not.toContain('2xKybCLI')
    expect(title).not.toContain('2200')
  })

  it('sorts problems so one failure mode cannot split across issues', () => {
    const report = buildRestoreReport(
      'r',
      restored([{ layerId: 'live-b', seq: 4300, bytes: 500 }, { layerId: 'live-a', seq: 2200, bytes: 800 }]),
      [audit({ layerId: 'live-b', withContentAfter: 0 }), audit({ layerId: 'live-a', glError: GL_OUT_OF_MEMORY })],
      GPU,
    )!
    expect(reportProblems(report)).toEqual(['blank-after-restore', 'gl-error'])
  })
})
