import { describe, expect, it } from 'vitest'
import type { Dab } from '@grafetto/shared'
import { RibbonStrokePainter, type RibbonStrokePainterContext } from './RibbonStrokePainter'
import { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import { ribbonProfileFor } from './ribbonProfile'
import { presetForTool } from '../presets/resolvePreset'
import { dabWorldHalfExtents } from './StampPainter'
import { brushDragContacts } from '../watercolor/brushDrag'

function metadata(water: number, priorWet: number, enabled: boolean, retiredHalo = false) {
  const name = `normal:${water}:100:PB29:round`
  const profile = ribbonProfileFor('watercolor', name, priorWet)
  const scratch = new RibbonStrokeScratch({} as RibbonScratchPool, true, true)
  const reaches: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = []
  const ctx = {
    minmaxExt: () => ({ MAX_EXT: 1 }), infinite: () => false,
    pageSize: () => ({ w: 3000, h: 2000 }), dabWorldHalfExtents,
    wcSheetClamp: (r: typeof reaches[number]) => r,
    resolveWithinSheet: (_target: ILayerBuffer, r: typeof reaches[number]) => { reaches.push(r); return [] },
    dabPool: () => new WeakMap<Dab, number>(),
    markerSegmentLength: (d: Dab, prev: Dab | undefined, radius: number) => {
      if (!prev) return radius * .5
      const distance = Math.hypot(d.x - prev.x, d.y - prev.y)
      return distance > .01 ? distance : radius * .12
    },
  } as unknown as RibbonStrokePainterContext
  const painter = new RibbonStrokePainter(ctx)
  painter.diagnosticSegmentDelivery = 'combined'
  painter.diagnosticSharedFluid = true
  painter.diagnosticForeignSolvent = false
  painter.diagnosticWaterPolicy = 'bottomless'
  painter.diagnosticLandingPolicy = 'fluid'
  painter.diagnosticFluidBrushContacts = enabled
  painter.diagnosticRetiredHaloBounds = retiredHalo
  const dabs: Dab[] = Array.from({ length: 20 }, (_, i) => ({
    x: 400 + i * 12, y: 500, size: 120, opacity: 1, aspectRatio: 1,
    angle: 0, pressure: 1, tiltX: 0, tiltY: 0, t: i * 16, speed: .5,
  }))
  const original = structuredClone(dabs)
  for (const _ of painter.paint({} as ILayerBuffer, dabs, presetForTool('watercolor', name), name,
    profile, [.22, 0, .6], scratch, undefined, (priorWet ? 'f' : '0').repeat(20))) void _
  return {
    contacts: brushDragContacts(scratch.brushTravel, { x: 0, y: 0, w: 3000, h: 2000 }),
    standing: [...scratch.standing.values()], travel: scratch.brushTravel,
    waterUsed: scratch.waterUsed, pigmentUsed: scratch.pigmentUsed, reaches, dabs, original,
  }
}

describe('default-off fluid brush contact experiment', () => {
  it('restores the same exposure geometry in foreign fluid without changing delivery clocks or dab records', () => {
    const own = metadata(100, 0, false), prior = metadata(0, 1, false), candidate = metadata(0, 1, true)
    expect(own.contacts).toHaveLength(7)
    expect(prior.contacts).toHaveLength(0)
    expect(candidate.contacts).toEqual(own.contacts)
    expect(candidate.waterUsed).toBe(prior.waterUsed)
    expect(candidate.pigmentUsed).toBe(prior.pigmentUsed)
    expect(candidate.standing).toEqual(prior.standing)
    expect(candidate.reaches).toEqual(prior.reaches)
    expect(candidate.dabs).toEqual(candidate.original)
  })
  it('preserves both the wet-own baseline and dry-on-dry no-flow control', () => {
    expect(metadata(100, 0, true)).toEqual(metadata(100, 0, false))
    const off = metadata(0, 0, false), on = metadata(0, 0, true)
    expect(on.contacts).toHaveLength(0)
    expect(on).toEqual(off)
  })
})

 describe('default-off retired halo bound experiment', () => {
  it('removes the inactive halo wet-label reach while leaving delivery and contacts intact', () => {
    const wetOff = metadata(100, 1, false), wetOn = metadata(100, 1, false, true), dry = metadata(100, 0, false)
    expect(wetOn.reaches).toEqual(dry.reaches)
    expect(wetOff.reaches).not.toEqual(wetOn.reaches)
    expect(wetOn.contacts).toEqual(wetOff.contacts)
    expect(wetOn.standing).toEqual(wetOff.standing)
    expect(wetOn.waterUsed).toBe(wetOff.waterUsed)
    expect(wetOn.pigmentUsed).toBe(wetOff.pigmentUsed)
    expect(wetOn.dabs).toEqual(wetOn.original)
    expect(metadata(100, 0, false, true)).toEqual(dry)
  })
 })
