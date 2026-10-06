import type { WatercolorPasses } from './WatercolorPasses'
import type { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import type { RibbonStrokeScratch } from '../buffers/RibbonStrokeScratch'
import { WATERCOLOR_BRISTLE_BUNDLE_PX } from '../dabs/ribbonProfile'

import { WET_DIFFUSE_SCHEDULE, WET_DIFFUSE_PUDDLE_SCHEDULE, WET_DIFFUSE_REACH, WET_DIFFUSE_MOBILE, watercolorPuddleSettleWeights, WET_SETTLE_SMOOTH, WET_SETTLE_FIBRE_FROM, type WetDiffuseStep } from '../watercolor/wetDiffusion'
import { brushDragContacts } from '../watercolor/brushDrag'
import { foreignWaterStencil } from '../watercolor/foreignWater'
import { pigmentAbsorption } from '../watercolor/pigmentOptics'
import { watercolorDampOver, watercolorPuddleMerge, watercolorRimShare, WC_BLOOM_SHARE, WC_TIDE_STANDING_FULL, WC_TIDE_RIM, WC_RIM_BAND_PX, WC_REMOB_DOME, watercolorSpreadBudget, watercolorCarryStrides, watercolorFrontSteps, WC_CARRY_RATE, WC_CARRY_POW, WC_CARRY_TRAVEL, watercolorDwellWater, WC_POOL_STREAK, WC_FRONT_CLIMB, WC_FRONT_FLOOR, WC_FRONT_CLIMB_IN, WC_FRONT_FLOOR_IN, WC_FRONT_DRY_COST, WC_FRONT_DRY_SHARE } from '../presets/watercolorPresets'
import type { PaintTarget } from '../buffers/ILayerBuffer'
import type { SettleField } from '../buffers/SettleField'
import { WC_HALF_RES_RADIUS_PX, WC_HALF_RES_SPAN_PX } from '../watercolor/settleResolution'

export type WatercolorSettlePreview = (tile: PaintTarget, pigment: AccumulationBuffer, color: AccumulationBuffer | null, coverage: AccumulationBuffer) => void

export interface WatercolorSettlePlanContext {
  gl(): WebGLRenderingContext
  fieldFor(w: number, h: number): SettleField
  paperWorldSize(): { w: number; h: number }
  pool(): RibbonScratchPool
  minmaxExt(): { MAX_EXT: number } | null
  ab(): { noDiffuse: boolean; noCarry: boolean; opDry: boolean }
  passes(): WatercolorPasses
}

/** Builds the ordered GPU steps and the final tile copy-back of one settle.
 * Working fields and frame scheduling remain separate owners. */
export class WatercolorSettlePlan {
  private readonly ctx: WatercolorSettlePlanContext
  constructor(ctx: WatercolorSettlePlanContext) { this.ctx = ctx }
  private get gl(): WebGLRenderingContext { return this.ctx.gl() }

  /** Upload caches for recorded brush travel and preceding wet contacts. */
  private _brushFlowTex: WebGLTexture | null = null

  private _foreignWaterTex: WebGLTexture | null = null
  /** Checked-out captured inputs survive asynchronous settle steps until landing or abort. */
  private readonly _ownedInputs = new Set<AccumulationBuffer>()

  /** (#536, ADR 011 §17.11, §17.17) The wet diffusion: what THIS operation
   *  laid (the deposit less what was settled before it) is split into a
   *  fixed and a mobile share (WET_DIFFUSE_MOBILE); the mobile share runs
   *  WET_DIFFUSE_RADII steps of WC_DIFFUSE_FRAG, ping-ponged; and the sum —
   *  settled + fixed + moved — goes back to the tiles and becomes the new
   *  settled deposit.
   *
   *  Only this operation's paint, deliberately. The first version moved the
   *  whole wash at every settle, so the first stroke of a wash was diffused
   *  again by every later stroke in it — thinner each time — while the
   *  latest sat where it was laid: "пигмента в луже катастрофически мало, а
   *  повторный штрих ложится слишком сильно". Paint moves once, at the
   *  settle that laid it, then it is fixed; lifting fixed paint with clean
   *  water is the remobilization round (§17.9). The flux is linear in the
   *  concentration for a given gate, so moving the mobile share of the new
   *  paint alone is exact, and each part is conserved on its own.
   *
   *  Over ONE field, not per tile. Per tile, everything off the tile was dry
   *  paper, so a puddle across x = 1024 kept its paint on each side — a
   *  straight seam, visible the moment the reveal let go ("при высыхании я
   *  вижу линии склейки тайлов"). The wash's tiles are stitched into a rect —
   *  the settle bounds padded by the schedule's whole reach, so no texel with
   *  paint can ever see the rect's edge — and copied back. The paper's height
   *  is sampled at the WORLD position, so where the rect starts (a live
   *  gesture's bounds and a replay's differ by a batch's padding) cannot move
   *  a pit. Nothing here reads a clock; the schedule is a constant of the
   *  tool, and the eight-bit write between steps is the one measured leak. */
  /** (#536, ADR 011 §17.11, §17.22) The wet diffusion over this wash's
   *  tiles stitched into one field, as a list of GPU steps plus the copy-back
   *  — a list so that the author's pen-up can spread it over frames under
   *  the reveal (see _startSettle) while a replay runs it in one go. Null
   *  when the wash holds no deposit here. */
  prepare(
    scratch: RibbonStrokeScratch, targets: PaintTarget[],
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    /** (#536, §17.23) How strongly this operation blooms the wash under it,
     *  0..1 — watercolorBloomStrength of the paper wetness it recorded. */
    bloom = 0,
    /** The mark's radius, px: sets the rim's share and the reach of the
     *  gathering kernel — the whole interior feeds the rim, not just its
     *  neighbourhood. */
    radiusPx = 16,
    /** (§17.24) The brush's water and the wetness the mark landed in — how
     *  far its water runs past the footprint (watercolorSpreadBudget) — and
     *  the standing water the extended domain records. */
    water = 1, landedWet = 0, standing = 1,
    /** (§17.25) The wettest paper the mark ran over: how far its water
     *  joined an earlier mark's puddle (watercolorPuddleMerge). */
    wetPeak = 0,
    /** (§17.37) How long the brush stood on landing, ms: the strength of
     *  the line where its landing puddle's front met the film. */
    dwellMs = 0,
    preview?: WatercolorSettlePreview,
  ): { ops: Array<() => void>; finish: () => void; dispose: () => void; compositeDomain: { minX: number; minY: number; maxX: number; maxY: number } } | null {
    const { gl } = this
    const tiles = targets.filter(t => scratch.peek(t.buffer)?.inkLoad)
    if (!tiles.length) return null
    // The rect: the settle's bounds plus the reach, clipped to the tiles that
    // actually hold this wash. Capped — a wash wider than the cap diffuses
    // in a window around its centre and sees a wall at the window's edge.
    // (#536, §17.22) 1536, from 2048: seven buffers of 2048² are 117 MB, which
    // a tablet does not have to spare; at 1536 the field is 66 MB and a 400 px
    // brush's whole gesture still fits it with its reach.
    // (§17.44) A big brush settles at HALF resolution: every pass of the
    // settle over a field a quarter the size, and a window twice as wide in
    // the world. The field holds cells of S px; what goes back to the tiles
    // is the field's change, brought up and added to the full-resolution
    // record (_wcResample), so the grain and the brush's texture are the
    // tile's own and only the movement is coarse. On the tablet a 400 px
    // zigzag's settle was 70 ms an entry and ~40 entries a chunk.
    // ...and only a big mark over a big window: a drop into a puddle or a
    // patch of a few hundred pixels settles in a small field anyway, and at
    // half resolution its paint spread softer and paler than it does.
    let S = 1
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const t of tiles) {
      minX = Math.min(minX, t.originX); minY = Math.min(minY, t.originY)
      maxX = Math.max(maxX, t.originX + t.buffer.width); maxY = Math.max(maxY, t.originY + t.buffer.height)
    }
    // (§17.38) ...padded by the further of the diffusion's reach and the
    // water front's run: the front's budget is in cost units and a cell
    // costs at least WC_FRONT_FLOOR, so budget / floor px is the furthest
    // the domain can lie past the footprint. With the diffusion trimmed
    // to a few texels the pad shrank to six, a flooded landing's front
    // (budget up to 160) ran into the field's edge, and the domain - and
    // the coverage it extends - came out cut to the rect: a wash on the
    // rig turned into a lopsided polygon.
    // Mobility depends on available water, never on which gesture brought it.
    const effectiveWet = Math.max(landedWet, wetPeak, standing)
    const frontReachPx = Math.ceil(watercolorSpreadBudget(radiusPx, water, effectiveWet) / WC_FRONT_FLOOR)
    // (§17.42) ...plus, when the wash dries as one component, the margin
    // the group tide needs around what changed: its band is read off an
    // inward relaxation of `inSteps` cells from the coverage's edge and its
    // kernel gathers about a radius, so a texel closer than that to the
    // field's edge could be missing a contour that lies just outside the
    // field. The dry target is copied back over the field LESS this margin;
    // the wet state over all of it.
    const groupDry = !this.ctx.ab().opDry
    const dryMargin = groupDry ? Math.max(2, Math.min(WC_RIM_BAND_PX, Math.round(radiusPx / 5))) + 2 + Math.ceil(radiusPx) + 2 : 0
    const pad = Math.max(WET_DIFFUSE_REACH, frontReachPx) + 1 + dryMargin
    let x0 = Math.max(minX, Math.floor(bounds.minX) - pad), y0 = Math.max(minY, Math.floor(bounds.minY) - pad)
    let x1 = Math.min(maxX, Math.ceil(bounds.maxX) + pad), y1 = Math.min(maxY, Math.ceil(bounds.maxY) + pad)
    if (radiusPx >= WC_HALF_RES_RADIUS_PX && Math.max(x1 - x0, y1 - y0) > WC_HALF_RES_SPAN_PX) S = 2
    const CAP = 1536 * S
    if (x1 - x0 > CAP) { const c = (x0 + x1) * 0.5; x0 = Math.floor(c - CAP / 2); x1 = x0 + CAP }
    if (y1 - y0 > CAP) { const c = (y0 + y1) * 0.5; y0 = Math.floor(c - CAP / 2); y1 = y0 + CAP }
    if (S > 1) {
      // Cell-aligned: tile edges are multiples of 1024, so a rect on even
      // coordinates maps every tile overlap onto whole cells.
      x0 = Math.max(minX, Math.floor(x0 / S) * S); y0 = Math.max(minY, Math.floor(y0 / S) * S)
      x1 = Math.min(maxX, Math.ceil(x1 / S) * S); y1 = Math.min(maxY, Math.ceil(y1 / S) * S)
      // (§17.49) ...and back under the cap: the alignment could push a capped
      // window one field texel past it - 1537, which the field rounds up to
      // the next size, so a big wash's chunk settle (1536) and its pen-up
      // settle (1537) re-made the whole field in turn, every stroke.
      if (x1 - x0 > CAP) x1 = x0 + CAP
      if (y1 - y0 > CAP) y1 = y0 + CAP
    }
    const w = x1 - x0, h = y1 - y0
    if (w <= 0 || h <= 0) return null
    scratch.noteStorageBounds({ minX: x0, minY: y0, maxX: x1, maxY: y1 })
    const field = this.ctx.fieldFor(w / S, h / S)
    const { w: paperTexW, h: paperTexH } = this.ctx.paperWorldSize()
    // (§17.44) At half resolution what goes home is the SETTLED wash at full
    // resolution plus the field's result less its own settled part: the
    // wash already on the paper keeps its grain and texture to the pixel,
    // and the operation's own wet paint comes back from the field whole -
    // smoothed, as wet paint is. Returning the whole deposit plus the
    // field's change kept the new film's one-pixel edge, which the half-
    // resolution field cannot see, and every pass of a big brush left a
    // thin line where its edge had been. So: the settled part in the field
    // (b0, cb0) and at full resolution per tile (snapshots, taken at the
    // stitch - a running gesture's next batch refreshes the film's base).
    const owned = new Set<AccumulationBuffer>()
    let disposed = false
    const acquireInput = (width: number, height: number): AccumulationBuffer => {
      const buffer = this.ctx.pool().acquire(width, height)
      owned.add(buffer); this._ownedInputs.add(buffer)
      return buffer
    }
    const dispose = (): void => {
      if (disposed) return
      disposed = true
      // Forget/destroy clears the outer owner first: dead-context names must
      // never return to the pool through a subsequently cancelled callback.
      for (const buffer of owned) if (this._ownedInputs.delete(buffer)) this.ctx.pool().release(buffer)
      owned.clear()
    }
    const a0 = S > 1 ? acquireInput(field.w, field.h) : null
    const ca0 = S > 1 ? acquireInput(field.w, field.h) : null
    const snapshots = new Map<AccumulationBuffer, { ink: AccumulationBuffer; color: AccumulationBuffer | null }>()
    // The settle's rect in the field's GL cells, for the interpolation's clamp.
    const fieldRect: [number, number, number, number] = [0, field.h - h / S, w / S, field.h]
    // A world rect of a tile into the field (S = 1: a copy; else the 2x2 mean).
    const toField = (src: AccumulationBuffer, tile: PaintTarget, wx0: number, wy0: number, wx1: number, wy1: number, dst: AccumulationBuffer): void => {
      const tx = wx0 - tile.originX, ty = tile.buffer.height - (wy1 - tile.originY)
      const fx = (wx0 - x0) / S, fy = field.h - (wy1 - y0) / S
      if (S === 1) src.copyRegionInto(dst, tx, ty, fx, fy, wx1 - wx0, wy1 - wy0)
      else this.ctx.passes().wcResample(dst, fx, fy, (wx1 - wx0) / S, (wy1 - wy0) / S, src, tx, ty, S, 0)
    }
    // ...and back: S = 1, the field's value; else base + up(new - old). The
    // target may be the base: the draw goes through a pooled temporary.
    const fromField = (fNew: AccumulationBuffer, fOld: AccumulationBuffer | null, tile: PaintTarget, wx0: number, wy0: number, wx1: number, wy1: number, target: AccumulationBuffer, base: AccumulationBuffer): void => {
      const tx = wx0 - tile.originX, ty = tile.buffer.height - (wy1 - tile.originY)
      const fx = (wx0 - x0) / S, fy = field.h - (wy1 - y0) / S
      if (S === 1 || !fOld) { fNew.copyRegionInto(target, fx, fy, tx, ty, wx1 - wx0, wy1 - wy0); return }
      const tmp = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height)
      this.ctx.passes().wcResample(tmp, tx, ty, wx1 - wx0, wy1 - wy0, fNew, fx, fy, 1 / S, 1, fOld, base, fieldRect)
      tmp.copyRegionInto(target, tx, ty, tx, ty, wx1 - wx0, wy1 - wy0)
      this.ctx.pool().release(tmp)
    }

    // Every tile's overlap with the rect, and the settled records the tiles
    // still lack — acquired now so the steps below can assume them.
    const overlaps: Array<{ tile: PaintTarget; ox0: number; oy0: number; ox1: number; oy1: number }> = []
    for (const tile of tiles) {
      const entry = scratch.peek(tile.buffer)
      if (!entry?.inkLoad) continue
      // (§17.44) The settled records are only needed without the film: with
      // it, the film's base (inkBase/colorBase, refreshed on the gesture's
      // first batch) IS the wash as it stood before the operation, and a
      // second pair of tile-sized textures per tile holding the same thing
      // was a quarter of the gigabyte of scratch the tablet carried.
      if (!this.ctx.minmaxExt() && !entry.inkSettled) {
        entry.inkSettled = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height)
        entry.inkSettled.clear()
      }
      if (!this.ctx.minmaxExt() && entry.inkColor && !entry.colorSettled) {
        entry.colorSettled = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height)
        entry.colorSettled.clear()
      }
      const ox0 = Math.max(x0, tile.originX), oy0 = Math.max(y0, tile.originY)
      const ox1 = Math.min(x1, tile.originX + tile.buffer.width), oy1 = Math.min(y1, tile.originY + tile.buffer.height)
      if (ox1 <= ox0 || oy1 <= oy0) continue
      overlaps.push({ tile, ox0, oy0, ox1, oy1 })
    }
    if (!overlaps.length) { dispose(); return null }
    const solvent = tiles.some(t => scratch.peek(t.buffer)?.solventLoad || scratch.peek(t.buffer)?.foreignSolventLoad)
      ? acquireInput(field.w, field.h) : null

    const foreign = foreignWaterStencil(scratch.foreignSources ?? [], scratch.wetContacts,
      { x: x0, y: y0, w: field.w * S, h: field.h * S })
    const contacts = brushDragContacts(scratch.brushTravel, { x: x0, y: y0, w: field.w * S, h: field.h * S })
    const flow = contacts[0]?.field
    let flowTexture: WebGLTexture | null = null
    let foreignTexture: WebGLTexture | null = null
    const ops: Array<() => void> = []
    const captureInputs: Array<() => void> = []
    if (flow) captureInputs.push(() => {
      this._brushFlowTex ??= gl.createTexture()
      flowTexture = this._brushFlowTex
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, flowTexture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, flow.width, flow.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, flow.pixels)
    })
    if (foreign) captureInputs.push(() => {
      this._foreignWaterTex ??= gl.createTexture()
      foreignTexture = this._foreignWaterTex
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, foreignTexture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, foreign.width, foreign.height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, foreign.pixels)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    })
    // (§17.44) The gesture whose film this settle consumes, fixed now: a
    // chunk's settle may land after the next chunk's film has begun.
    const gesture = scratch.gesture
    // Stitch: every tile's overlap with the rect, top-down world → bottom-up
    // GL on both sides, exactly as SmudgePainter.gatherPatch does it. `a` takes the
    // deposit, `b` what was settled, `coverage` the silhouette.
    captureInputs.push(() => {
      field.a.clear()
      field.b.clear()
      field.coverage.clear()
      field.ca.clear()
      field.cb.clear()
      solvent?.clear()
      for (const { tile, ox0, oy0, ox1, oy1 } of overlaps) {
        const entry = scratch.peek(tile.buffer)
        if (!entry?.inkLoad) continue
        // The settled wash: the film's base where this operation's gesture
        // laid paint on the tile, the deposit itself where it did not (no new
        // paint there, nothing mobile), the old record without a film.
        const settledInk = (entry.filmGesture === gesture ? entry.inkBase : null) ?? entry.inkSettled ?? entry.inkLoad
        toField(entry.inkLoad, tile, ox0, oy0, ox1, oy1, field.a)
        toField(settledInk, tile, ox0, oy0, ox1, oy1, field.b)
        if (S > 1) {
          const tx = ox0 - tile.originX, ty = tile.buffer.height - (oy1 - tile.originY)
          const ink = acquireInput(tile.buffer.width, tile.buffer.height)
          settledInk.copyRegionInto(ink, tx, ty, tx, ty, ox1 - ox0, oy1 - oy0)
          let color: AccumulationBuffer | null = null
          if (entry.inkColor) {
            const sc = (entry.filmGesture === gesture ? entry.colorBase : null) ?? entry.colorSettled ?? entry.inkColor
            color = acquireInput(tile.buffer.width, tile.buffer.height)
            sc.copyRegionInto(color, tx, ty, tx, ty, ox1 - ox0, oy1 - oy0)
          }
          snapshots.set(tile.buffer, { ink, color })
        }
        toField(entry.coverage, tile, ox0, oy0, ox1, oy1, field.coverage)
        if (solvent && (entry.solventLoad || entry.foreignSolventLoad)) {
          if (entry.solventLoad && entry.foreignSolventLoad) {
            const temp = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height)
            try {
              this.ctx.passes().fieldOp(temp, entry.solventLoad, entry.foreignSolventLoad, 1, 1)
              toField(temp, tile, ox0, oy0, ox1, oy1, solvent)
            } finally { this.ctx.pool().release(temp) }
          } else toField((entry.solventLoad ?? entry.foreignSolventLoad)!, tile, ox0, oy0, ox1, oy1, solvent)
        }
        if (entry.inkColor) {
          const settledColor = (entry.filmGesture === gesture ? entry.colorBase : null) ?? entry.colorSettled ?? entry.inkColor
          toField(entry.inkColor, tile, ox0, oy0, ox1, oy1, field.ca)
          toField(settledColor, tile, ox0, oy0, ox1, oy1, field.cb)
        }
      }
      if (a0) field.b.copyTo(a0)
      if (ca0) field.cb.copyTo(ca0)
    })
    // Queue.start executes the first entry at the chunk boundary. Uploads
    // belong to that same entry: putting them ahead of the stitch lets the
    // next film overwrite its inputs before a later animation frame reads
    // them. Only capture is immediate; transport still runs over frames.
    ops.push(() => { for (const capture of captureInputs) capture() })

    const fieldOp = (out: AccumulationBuffer, a: AccumulationBuffer, b: AccumulationBuffer, mode: 0 | 1, k: number): void =>
      this.ctx.passes().fieldOp(out, a, b, mode, k)
    const diffuseStep = (src: AccumulationBuffer, dst: AccumulationBuffer, radius: number, knight: boolean, gate: AccumulationBuffer = field.coverage, density: AccumulationBuffer = src): void => {
      this.ctx.passes().diffuseStep(field, x0, y0, S, paperTexW, paperTexH, src, dst, radius, knight, gate, density, solvent)
    }
    // (§17.23) The operation's footprint — where its own deposit lies, which
    // is the mobile field before anything moves — and the dome over it: the
    // mask blurred at falling strides, 1 deep inside, 0.5 on the edge, 0
    // outside. Then the band just inside the edge, blurred by the rim's
    // kernel, kept in `mask` for both rims below. Once per settle.
    // (§17.24) The water front, once per settle: the operation's footprint
    // (its mobile deposit before anything moves) seeds a cost field, the
    // relaxation runs it out over the paper, and the texels within the
    // budget are the domain the water wets. From the cost: the band texture
    // (r the last `width` cells inside the front, g the domain), and the
    // stitched coverage extended over the domain, so the silhouette and the
    // diffusion's gate reach as far as the water did. Then the band
    // gathered by the rim's kernel, kept in `mask`.
    // (§17.29) ...by the WETTEST paper the mark ran over, not where it
    // landed: Ilya's series 5 lays the second stroke from dry paper into
    // the first, and its front has to run where the first stroke is.
    const runWet = effectiveWet
    // (§17.44) In the field's cells from here on: budget and radius over S.
    const budgetPx = watercolorSpreadBudget(radiusPx, water, runWet) / S
    const radiusC = radiusPx / S
    const costMax = budgetPx + 4
    // (§17.27) …plus the mark's radius: the puddle's front starts inside
    // the footprint and has to cross it before it runs its budget into the
    // film. At nine steps for a 6 px budget it stopped a third of the way
    // across a 20 px puddle and the backrun never reached the film.
    const frontSteps = watercolorFrontSteps(budgetPx, radiusC, runWet)
    // A fifth of the radius (the photo's ring: FWHM 0.2 R_front), capped:
    // the mass sits at the front, the tail behind it is what the valleys
    // carry, so the band's depth is what survives a blur, not its darkness.
    // (§17.44) The band's width is a WORLD width (a fifth of the radius, at
    // most WC_RIM_BAND_PX px), in cells: capped in cells, a half-resolution
    // band was twice as wide, the tide took twice the share, and every big
    // mark dried paler with a heavier rim.
    const width = Math.max(1, Math.round(Math.max(2, Math.min(WC_RIM_BAND_PX, Math.round(radiusPx / 5))) / S))
    // The band is the last `width` cells inside the front, measured by a
    // second relaxation run INWARD from everything past the budget, over the
    // same paper: a band from the outward cost alone cannot reach into the
    // footprint, whose cost is zero throughout. Its own scale, so the 8 bits
    // resolve a cell.
    const costMaxIn = width + 3
    const inSteps = width + 2
    const merge = watercolorPuddleMerge(effectiveWet)
    // (§17.26) A mark laid over an earlier mark that was still damp has no
    // dry paper to stop at there: its own tideline stands down over it (the
    // bloom ring is the edge), fully on wet.
    const damp = watercolorDampOver(effectiveWet)
    // …and a rim wants free water to dry out of: none from a brush that
    // carried none.
    const tideWater = Math.min(1, standing / WC_TIDE_STANDING_FULL)
    // (§17.27) Dyadic strides, 1, 2, 4, 8… up to the mark's radius: a 3x3
    // binomial at each is the à-trous B-spline, a smooth kernel of reach
    // ~radius. The old r/2, r/4, r/8, 1 was the same reach with a bumpy
    // kernel, and on a band one or two texels wide the bumps of the
    // gathered band divided the moved paint into DOTS along the line.
    const gather: Array<[number, number]> = []
    for (let st = 1; st <= Math.max(1, radiusC / 2) && gather.length < 6; st *= 2) gather.push([st, st])
    // (s17.40) The dry cost never less than a share of the budget: a stroke
    // that lands in a puddle carries the puddle's budget (up to 160) out
    // onto dry paper, and at a flat 24 a cell its front ran four cells past
    // the brush there - Ilya's "рваный край вне лужи". At half the budget
    // a cell, the run on dry paper is two cells whatever the budget.
    const dryCost = Math.max(WC_FRONT_DRY_COST, budgetPx * WC_FRONT_DRY_SHARE)
    const frontStep = (src: AccumulationBuffer, dst: AccumulationBuffer, max: number, climb = WC_FRONT_CLIMB, floor = WC_FRONT_FLOOR, stride = 1): void =>
      this.ctx.passes().waterFrontStep(field, x0, y0, dryCost, src, dst, max, climb, floor, stride, S, foreignTexture)
    // The front as entries of `ops`, a few relaxation steps per entry so no
    // frame runs the whole field thirty times: the outward cost from the
    // footprint into `pressure`, the inward cost from past-the-budget into
    // `mask`, then the band texture, the coverage extended over the domain,
    // and the band gathered into `mask` for the rims.
    const frontOps = (mobile: AccumulationBuffer, tmp: AccumulationBuffer): void => {
      const pp = { src: field.pressure, dst: tmp }
      const run = (steps: number, max: number, home: AccumulationBuffer, climb: number, floor: number, strides?: readonly number[]): void => {
        const list = strides ?? Array.from({ length: steps }, () => 1)
        for (let i = 0; i < list.length; i += 4) {
          const chunk = list.slice(i, i + 4)
          const last = i + chunk.length >= list.length
          ops.push(() => {
            for (const st of chunk) { frontStep(pp.src, pp.dst, max, climb, floor, st); const t = pp.src; pp.src = pp.dst; pp.dst = t }
            if (last && pp.src !== home) this.ctx.passes().fieldOp(home, pp.src, pp.src, 1, 0)
          })
        }
      }
      ops.push(() => { this.ctx.passes().fieldOp(field.pressure, mobile, field.coverage, 10, 0.003, { band: [1 / costMax, standing], size: [(budgetPx - 1) / costMax, 0] }); pp.src = field.pressure; pp.dst = tmp })
      // (§17.44) Jumps, then unit passes - see WC_WATER_FRONT_FRAG's u_stride.
      // (§17.44) Unit passes: the dyadic jumps (watercolorFrontStrides) were
      // six times cheaper and measurably wrong - a jump sums the climb along
      // its path but loses the per-cell floor, so the cost came out low, the
      // puddles ran wider and every drop dried paler (124 -> 133 of 255 on
      // Ilya's circles). The big sweeps get their speed from the
      // half-resolution field instead, exactly.
      run(frontSteps, costMax, field.pressure, WC_FRONT_CLIMB, WC_FRONT_FLOOR)
      ops.push(() => { this.ctx.passes().fieldOp(field.mask, field.pressure, field.pressure, 12, budgetPx / costMax, { d: field.band }); pp.src = field.mask; pp.dst = tmp })
      // Inward over a gentler relief: the band's inner edge follows the
      // valleys a few cells in (the photo's streaks pointing into the light
      // centre), not a third of the way to the middle.
      // The first two cells in from the front flat, so the sharp peak of
      // the deposition profile (mode 6) is a continuous line along the
      // front - with the relief from the first cell it broke into dots
      // (the photographs' tideline is a thin unbroken line); the tail
      // behind it takes the relief and its fingers.
      run(2, costMaxIn, field.mask, 0, 1)
      run(inSteps - 2, costMaxIn, field.mask, WC_FRONT_CLIMB_IN, WC_FRONT_FLOOR_IN)
      ops.push(() => {
        this.ctx.passes().fieldOp(tmp, field.coverage, field.coverage, 11, standing, { d: field.pressure, band: [budgetPx / costMax, 0], size: [1 / costMax, 1] })
        this.ctx.passes().fieldOp(field.coverage, tmp, tmp, 1, 0)
        this.ctx.passes().fieldOp(field.band, field.pressure, field.coverage, 6, merge, { c: field.mask, d: field.pressure, band: [budgetPx / costMax, width / costMaxIn], size: [1 / costMax, 1 / costMaxIn], origin: [standing, damp], dir: [1, 1], tau: [watercolorDwellWater(dwellMs), 0, 0], world: [x0 / S, -(y0 / S + field.h), S] })
        this.ctx.passes().fieldOp(tmp, field.band, field.band, 5, 0, { dir: gather[0] })
        let gs = tmp, gd = field.mask
        for (let i = 1; i < gather.length; i++) { this.ctx.passes().fieldOp(gd, gs, gs, 5, 0, { dir: gather[i] }); const t = gs; gs = gd; gd = t }
        if (gs !== field.mask) this.ctx.passes().fieldOp(field.mask, gs, gs, 1, 0)
      })
    }
    // (§17.23) The rim: `share` of `paint` inside the footprint goes to the
    // band. Two free buffers; the result lands in `t2`.
    const rim = (paint: AccumulationBuffer, share: number, t1: AccumulationBuffer, t2: AccumulationBuffer, tide = false): void => {
      // (s17.30) The bloom lifts the wash's paint by the DOME over the drop
      // (band .a: all of it under the centre, none at the front), the tide
      // the mark's own paint over the whole domain (band .g). A uniform lift
      // left a hard-edged hole the size of the drop's footprint - Ilya's
      // "слишком резко обеляет лужу в месте касания".
      this.ctx.passes().fieldOp(t1, paint, paint, tide ? 7 : 9, share, { d: field.band })
      let gs = t1, gd = t2
      for (let i = 0; i < gather.length; i++) { this.ctx.passes().fieldOp(gd, gs, gs, 5, 0, { dir: gather[i] }); const t = gs; gs = gd; gd = t }
      // The gathered paint is in gs; the sum lands in t2, so the other is
      // its scratch.
      if (gs === t2) { this.ctx.passes().fieldOp(t1, gs, gs, 1, 0); gs = t1 }
      this.ctx.passes().fieldOp(t2, paint, gs, tide ? 14 : 8, share, { c: field.mask, d: field.band })
    }
    // One record: c = mobile share of (laid − settled); b = laid − c, the part
    // that stays put (settled paint plus the fixed share of the new); the
    // schedule over c; the sum back into whichever of the pair is free.
    // Both records use coverage and one pre-step mobile pigment density,
    // so absorption cannot choose a different mobility from its carrier.
    const diffuseSteps: readonly WetDiffuseStep[] = this.ctx.ab().noDiffuse ? [] : WET_DIFFUSE_SCHEDULE
    // (§17.29) The colour record, when there is one (two paints or more),
    // is split and carried in LOCKSTEP with the deposit inside the
    // deposit's own settle: the carry's fractions depend on the deposit's
    // mobile and fixed amounts at every step, so the colour cannot be
    // carried on its own afterwards. Diffusion likewise runs colour first
    // and pigment second against the unchanged pre-step pigment field.
    const colour = scratch.paints.size > 1 ? { a: field.ca, b: field.cb, c: field.cc } : null
    const singlePaint = [...scratch.paints][0]
    const singleTau: [number, number, number] = !colour && singlePaint ? pigmentAbsorption(singlePaint.split(',').map(Number) as [number, number, number]) : [0, 0, 0]
    // (§17.42) The wash dries as ONE component: nothing of an operation is
    // fixed at its pen-up - the whole of its paint is mobile, the earlier
    // paint under the dome all of it too, and no tide is laid into the wet
    // state; the tide goes, once, along the outer contour of the wash's
    // whole coverage, into the PROVISIONAL dry target (inkDry) the
    // composite shows, recomputed at every pen-up (_groupTideOps below).
    // The design thread's diagnosis of the wet-on-wet pairs: each operation
    // dried to the end before the next arrived, and no re-mobilisation
    // turns "dry A, then dissolve A with B" into "wet A + wet B, dried
    // together". The r17 behaviour stays as the wcOpDry A/B.
    const mobileShare = groupDry ? 1 : WET_DIFFUSE_MOBILE
    // (#680, s17.84) The pool's paint combed along the travel by the hairs,
    // over the settled result (the settle erases it from the dose): through
    // `free` and back into `paint`. The factor comes from the coverage
    // alone, so the deposit and the colour record take the same one.
    const streakCombs = Math.max(1.5, Math.min(50, radiusPx / WATERCOLOR_BRISTLE_BUNDLE_PX))
    const poolStreaks = (paint: AccumulationBuffer, free: AccumulationBuffer): void => {
      if (!(WC_POOL_STREAK > 0)) return
      this.ctx.passes().fieldOp(free, paint, paint, 1, 1, { c: field.coverage, world: [x0 / S, -(y0 / S + field.h), S], size: [streakCombs, 0], origin: [WC_POOL_STREAK, 0], dir: [1, 1] })
      fieldOp(paint, free, free, 1, 0)
    }
    // Presentation copies only: never write the intermediate state into the
    // wash records. Reconstruct against the same captured base as finish().
    let previewAt = -Infinity
    const present = (mobile: AccumulationBuffer, fixed: AccumulationBuffer | null, mobileColor?: AccumulationBuffer, fixedColor?: AccumulationBuffer, afloat = 1): void => {
      if (!preview || performance.now() - previewAt < 150) return
      previewAt = performance.now()
      const pool = this.ctx.pool()
      const pigment = pool.acquire(field.w, field.h)
      const color = pool.acquire(field.w, field.h)
      try {
        if (fixed) fieldOp(pigment, fixed, mobile, 1, afloat)
        else mobile.copyTo(pigment)
        if (mobileColor) {
          if (fixedColor) fieldOp(color, fixedColor, mobileColor, 1, afloat)
          else mobileColor.copyTo(color)
        } else this.ctx.passes().pigmentColor(color, pigment, singleTau)
        for (const { tile, ox0, oy0, ox1, oy1 } of overlaps) {
          const entry = scratch.peek(tile.buffer)
          if (!entry?.inkLoad) continue
          const load = pool.acquire(tile.buffer.width, tile.buffer.height)
          const chroma = pool.acquire(tile.buffer.width, tile.buffer.height)
          const coverage = pool.acquire(tile.buffer.width, tile.buffer.height)
          try {
            entry.inkLoad.copyTo(load)
            if (entry.inkColor) entry.inkColor.copyTo(chroma)
            entry.coverage.copyTo(coverage)
            const snap = snapshots.get(tile.buffer)
            fromField(pigment, a0, tile, ox0, oy0, ox1, oy1, load, snap?.ink ?? entry.inkLoad)
            if (entry.inkColor) {
              if (S > 1 && !colour) this.ctx.passes().pigmentColor(chroma, load, singleTau)
              else fromField(color, ca0, tile, ox0, oy0, ox1, oy1, chroma, snap?.color ?? entry.inkColor)
            }
            const tx = ox0 - tile.originX, ty = tile.buffer.height - (oy1 - tile.originY)
            if (S === 1) field.coverage.copyRegionInto(coverage, ox0 - x0, field.h - (oy1 - y0), tx, ty, ox1 - ox0, oy1 - oy0)
            else this.ctx.passes().wcResample(coverage, tx, ty, ox1 - ox0, oy1 - oy0, field.coverage, (ox0 - x0) / S, field.h - (oy1 - y0) / S, 1 / S, 0)
            preview(tile, load, entry.inkColor ? chroma : null, coverage)
          } finally { pool.release(load); pool.release(chroma); pool.release(coverage) }
        }
      } finally { pool.release(pigment); pool.release(color) }
    }
    let pairedColour: { out: AccumulationBuffer } | null = null
    const settle = (a: AccumulationBuffer, b: AccumulationBuffer, c: AccumulationBuffer, first: boolean, spare: AccumulationBuffer, follow = false): { out: AccumulationBuffer } => {
      const st = { src: c, dst: a, out: a }
      const paired = first && colour ? { src: colour.c, dst: colour.a, out: colour.a } : null
      if (paired) pairedColour = paired
      const advance = (radius: number, knight: boolean, gate = field.coverage): void => {
        // Colour first: the following deposit draw still reads exactly the
        // same pre-step density. Neither destination aliases that density.
        if (paired) diffuseStep(paired.src, paired.dst, radius, knight, gate, st.src)
        diffuseStep(st.src, st.dst, radius, knight, gate, st.src)
        const t = st.src; st.src = st.dst; st.dst = t
        if (paired) { const t = paired.src; paired.src = paired.dst; paired.dst = t }
      }
      if (!follow) ops.push(() => {
        fieldOp(c, a, b, 0, mobileShare)
        // (§17.25) A mark that landed in a puddle wets the paint already
        // lying under its footprint: that paint is as mobile as the new -
        // it never dried - so the same mobile share of it joins c and runs,
        // settles and relocates with the new paint, to the MERGED front.
        // Without this the earlier pass's tideline stayed put under the
        // next pass, and a flat wash came out as a ladder of inner rims.
        // (§17.41) ...and it happens AFTER the front is known, over the
        // dome of the puddle the landing joined - see below.
        // Where earlier marks' SETTLED deposit lies, before b is overwritten
        // with the fixed part - kept in `band` until the front reads it: the
        // puddle this mark's water may have joined.
        if (first) this.ctx.passes().fieldOp(field.band, b, b, 4, 0.002)
        fieldOp(b, a, c, 1, -1)
        // The colour record's split, by the same gate.
        if (colour && first) {
          fieldOp(colour.c, colour.a, colour.b, 0, mobileShare)
          fieldOp(colour.b, colour.a, colour.c, 1, -1)
        }
      })
      // The water front, its band and the extended coverage come from the
      // deposit's mobile field, once; the colour record rides the same.
      if (first) frontOps(c, a)
      // (§17.29) The front carries the paint: the mobile field runs along
      // the front's cost, from the footprint out to where the water
      // stopped, in strided steps of WC_FIELD_OP_FRAG's mode 15 - so a
      // loaded mark into a wet wash sends its own pigment into the wash in
      // the fingers the front cut, at near the body's density (Ilya's
      // series 5), instead of leaving it inside its own contour with only
      // the water gone on. The film's own contour ring (the last cell and
      // a half of the budget) is left out of the domain here: on dry paper
      // the whole film sits one cell short of its budget, and with the
      // ring in, every stroke piled its outer texels into a hard line.
      // What the flow equalises is the TOTAL pigment - mobile plus fixed
      // (b): the wash's settled paint lying in the domain counts, or a
      // mark over a wet wash sent its own paint and the re-mobilised wash
      // under it out into fingers denser than its body, and the body went
      // pale. The deposit ping-pongs c and a; the colour record cc and ca,
      // in lockstep, taking the deposit's fractions (mode 16).
      if (first && !this.ctx.ab().noCarry) {
        const carry = watercolorCarryStrides(budgetPx)
        let src = c, dst = a
        let csrc = colour?.c, cdst = colour?.a
        for (let i = 0; i < carry.length; i += 4) {
          const n = Math.min(4, carry.length - i)
          const plan: Array<{ s: number; src: AccumulationBuffer; dst: AccumulationBuffer; csrc?: AccumulationBuffer; cdst?: AccumulationBuffer }> = []
          for (let j = 0; j < n; j++) {
            plan.push({ s: carry[i + j], src, dst, csrc, cdst })
            const t = src; src = dst; dst = t
            const ct = csrc; csrc = cdst; cdst = ct
          }
          ops.push(() => {
            for (const p of plan) {
              const opts = { d: field.pressure, dir: [p.s, p.s] as [number, number], band: [(budgetPx - 1.5) / costMax, 0] as [number, number], size: [WC_CARRY_POW, costMax] as [number, number], origin: [p.s, WC_CARRY_TRAVEL] as [number, number] }
              if (p.csrc && p.cdst) this.ctx.passes().fieldOp(p.cdst, p.csrc, b, 16, WC_CARRY_RATE, { ...opts, c: p.src })
              this.ctx.passes().fieldOp(p.dst, p.src, b, 15, WC_CARRY_RATE, opts)
            }
            const last = plan[plan.length - 1]
            present(last.dst, b, last.cdst, colour?.b)
          })
        }
        if (src !== c) { const from = src; ops.push(() => fieldOp(c, from, from, 1, 0)) }
        if (colour && csrc && csrc !== colour.c) { const from = csrc, to = colour.c; ops.push(() => fieldOp(to, from, from, 1, 0)) }
      }
      // (§17.41) The wet landing re-mobilises the earlier paint over the
      // DOME of the puddle it joined (band .a, from the front just run),
      // (§17.43) AFTER the carry: re-mobilised before it, the earlier paint
      // rode the new paint's front out of the footprint and piled in a line
      // at the domain's edge; now only the new paint travels with the
      // front, and the two paints mix by the puddle diffusion below, both
      // ways and without a direction.
      // not only under its footprint: the two paints then mix both ways in
      // the puddle diffusion below. The moved share leaves the fixed field
      // (b) as it joins the mobile one (c), for the deposit and the colour
      // record alike. `a` and `spare` are the temporaries.
      const remobFloor = groupDry ? 1 : WC_REMOB_DOME
      if (first && merge > 0) ops.push(() => {
        if (colour) {
          this.ctx.passes().fieldOp(a, colour.c, colour.b, 18, merge, {
            d: field.band,
            c,
            e: b,
            origin: [remobFloor, 1],
          })
          this.ctx.passes().fieldOp(spare, colour.b, colour.c, 3, 0, { c: a })
          fieldOp(colour.c, a, a, 1, 0)
          fieldOp(colour.b, spare, spare, 1, 0)
        }
        this.ctx.passes().fieldOp(a, c, b, 18, merge, {
          d: field.band,
          origin: [remobFloor, 0],
        })
        this.ctx.passes().fieldOp(spare, b, c, 3, 0, { c: a })
        fieldOp(c, a, a, 1, 0)
        fieldOp(b, spare, spare, 1, 0)
      })
      // All available water mixes by the same covered-film domain. The
      // former dome copy changed coverage.b while diffusion reads .a, so
      // its extra full-field draw did not restrict the actual exchange.
      // (§17.23) The bloom: the wash's SETTLED paint inside this operation's
      // footprint goes to the footprint's edge — the light patch with the
      // dark ragged ring. Only as much as the recorded wetness says the wash
      // was damp (watercolorBloomStrength); `a` and `spare` are free here.
      // (#680, §17.78) BEFORE the puddle settles into `b`: after it, the
      // bloom took this mark's own settled core out to the footprint's edge
      // too and left a light ring in the middle of the drop.
      if (bloom > 0) {
        ops.push(() => {
          rim(b, WC_BLOOM_SHARE * bloom, a, spare)
          fieldOp(b, spare, spare, 1, 0)
          if (paired && colour) {
            rim(colour.b, WC_BLOOM_SHARE * bloom, a, spare)
            fieldOp(colour.b, spare, spare, 1, 0)
          }
        })
      }
      // (#680, §17.78) ...and it SETTLES as it mixes: a share of the paint
      // grips the paper before the puddle moves it at all (the core), and of
      // what is still afloat a share more after every step - so the paint
      // that settles late has gone far and is little. A core, a nearer halo,
      // a wide faint one (Ilya: "белое пятно почти без размытия, градиент
      // побольше и прозрачнее, и огромный очень прозрачный"), where the
      // schedule alone evened the whole of it out into one pale cloud.
      // The paired update is linear for its shared pre-step gate, so the
      // mobile field is left undepleted and each step's slice is added to
      // the fixed one at its weight (watercolorPuddleSettleWeights); the
      // rest is scaled down once at the end. The fixed field ping-pongs
      // with `spare`, free here, and comes back into `b` before the bloom.
      const puddleSteps = merge > 0 && !this.ctx.ab().noDiffuse ? WET_DIFFUSE_PUDDLE_SCHEDULE : []
      if (puddleSteps.length) {
        const w = watercolorPuddleSettleWeights(puddleSteps.length)
        const acc = { fixed: b, free: spare }
        // (§17.82) The far slices - settled after the long steps, the faint
        // outer halo - go down through the paper's fibres (wcFibre).
        const fibreFrom = WET_SETTLE_FIBRE_FROM
        const world: [number, number, number] = [x0 / S, -(y0 / S + field.h), S]
        const settleSlice = (k: number): void => {
          if (!(w.slices[k] > 0)) return
          if (paired && colour) {
            // Both old mobile destinations are free after the paired draw.
            // Reuse them for fixed-slice sums, then copy back; no histories
            // or extra field-sized textures are needed.
            const addSlice = (fixed: AccumulationBuffer, mobile: AccumulationBuffer, tmp: AccumulationBuffer): void => {
              if (k >= fibreFrom) this.ctx.passes().fieldOp(tmp, fixed, mobile, 1, w.slices[k], { world, d: field.band, dir: [1, 1] })
              else fieldOp(tmp, fixed, mobile, 1, w.slices[k])
              fieldOp(fixed, tmp, tmp, 1, 0)
            }
            addSlice(b, st.src, st.dst)
            addSlice(colour.b, paired.src, paired.dst)
            return
          }
          if (k >= fibreFrom) this.ctx.passes().fieldOp(acc.free, acc.fixed, st.src, 1, w.slices[k], { world, d: field.band, dir: [1, 1] })
          else fieldOp(acc.free, acc.fixed, st.src, 1, w.slices[k])
          const t = acc.fixed; acc.fixed = acc.free; acc.free = t
        }
        // The core is taken off a SMOOTHED field: straight after the carry
        // the mobile paint has a pale line along the footprint's contour (the
        // carry leaves the film's own contour ring out), which the whole
        // schedule used to even out - settled raw, it stayed as a light ring
        // round the middle of every drop. Two fine steps, gated by the
        // coverage and not the dome (the line IS the dome's edge), an even
        // count so the pair's parity stays.
        for (const [radius, knight] of WET_SETTLE_SMOOTH) {
          ops.push(() => advance(radius, knight))
        }
        let afloat = 1
        ops.push(() => { settleSlice(0); afloat -= w.slices[0]; present(st.src, paired ? b : acc.fixed, paired?.src, colour?.b, afloat) })
        puddleSteps.forEach(({ radius, knight }, i) => {
          ops.push(() => {
            advance(radius, knight)
            settleSlice(i + 1)
            afloat -= w.slices[i + 1]
            present(st.src, paired ? b : acc.fixed, paired?.src, colour?.b, afloat)
          })
        })
        ops.push(() => {
          if (acc.fixed !== b) fieldOp(b, acc.fixed, acc.fixed, 1, 0)
          // What is still afloat, at its weight: into the free one of the
          // pair and back, so the pair's parity (which the colour settle's
          // spare is chosen by) does not change.
          fieldOp(st.dst, st.src, st.src, 1, w.afloat - 1)
          fieldOp(st.src, st.dst, st.dst, 1, 0)
          if (paired) {
            fieldOp(paired.dst, paired.src, paired.src, 1, w.afloat - 1)
            fieldOp(paired.src, paired.dst, paired.dst, 1, 0)
          }
        })
      }
      for (const { radius, knight } of diffuseSteps) {
        ops.push(() => { advance(radius, knight); present(st.src, b, paired?.src, colour?.b) })
      }
      // (§17.23) The tideline: after the paint has run, its puddle carries a
      // share of it to the rim as it dries. The moved field lands in `dst`,
      // the sum with the fixed paint in `src`.
      // (§17.42) ...or not: under the group-dry oracle the tide waits for
      // the whole wash (watercolorDryWash), and the operation's result is
      // its moved paint over the fixed field, all of it still mobile.
      ops.push(() => {
        // The pressure gate is no longer sampled after the diffusion. It
        // is now a spare shared sequentially by the paired final sums.
        const finalSpare = paired ? field.pressure : spare
        if (groupDry) {
          // Through the spare and back, so the result lands where the rim's
          // would (st.src): the colour settle's spare is chosen by that.
          fieldOp(finalSpare, b, st.src, 1, 1)
          fieldOp(st.src, finalSpare, finalSpare, 1, 0)
          st.out = st.src
          poolStreaks(st.src, finalSpare)
          if (paired && colour) {
            fieldOp(finalSpare, colour.b, paired.src, 1, 1)
            fieldOp(paired.src, finalSpare, finalSpare, 1, 0)
            paired.out = paired.src
            poolStreaks(paired.src, finalSpare)
          }
          return
        }
        rim(st.src, watercolorRimShare(WC_TIDE_RIM, radiusC, width) * tideWater, st.dst, finalSpare, true)
        st.out = st.src
        fieldOp(st.out, b, finalSpare, 1, 1)
        poolStreaks(st.out, finalSpare)
        if (paired && colour) {
          rim(paired.src, watercolorRimShare(WC_TIDE_RIM, radiusC, width) * tideWater, paired.dst, finalSpare, true)
          paired.out = paired.src
          fieldOp(paired.out, colour.b, finalSpare, 1, 1)
          poolStreaks(paired.out, finalSpare)
        }
      })
      return st
    }
    // The deposit's settle borrows a colour buffer as its spare; the colour
    // settle, when it runs, borrows a deposit one (both are done by then).
    // The deposit's spare: the colour record's deposit buffer once the
    // record is split (its mobile part lives in cc from the first op on),
    // else the unused cc.
    const dep = settle(field.a, field.b, field.c, true, colour ? field.ca : field.cc)
    // (#536, §17.20) One paint so far: its colour record is its deposit's
    // mass times one absorption everywhere, so it is rebuilt from the moved
    // deposit in a single pass instead of carried through the schedule
    // again — half the settle's cost, which was "всё это дело притормаживает".
    let col: { out: AccumulationBuffer }
    if (scratch.paints.size <= 1) {
      const only = [...scratch.paints][0]
      const tau = only ? pigmentAbsorption(only.split(',').map(Number) as [number, number, number]) : [0, 0, 0]
      col = { out: field.cc }
      ops.push(() => {
        this.ctx.passes().pigmentColor(field.cc, dep.out, tau)
      })
    } else {
      // Already transported in lockstep with each deposit step; an
      // independent colour schedule would change its mobility fractions.
      col = pairedColour!
    }

    // Sweep contacts in recorded order. Optical depth and pigment use the
    // same pre-contact pigment, before either result is copied back.
    for (const contact of contacts) {
      // Split the accumulated contact exposure into one-cell exchanges.
      // Each pulse stays within the shared pigment/colour capacity bound.
      let maxExposure = 0
      for (let i = 2; i < contact.field.pixels.length; i += 4) {
        maxExposure = Math.max(maxExposure, -Math.log(Math.max(1 - contact.field.pixels[i] / 255, 1 / 255)))
      }
      const substeps = Math.max(1, Math.ceil(0.2 * contact.radius / S * maxExposure * Math.SQRT2 / 0.84))
      const contactGain = 0.2 * contact.radius / (substeps * S)
      let rect: [number, number, number, number], scissor: [number, number, number, number]
      let left: number, right: number, bottom: number, top: number
      ops.push(() => {
        if (!flowTexture) return
        const cf = contact.field, cr = contact.rect
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, flowTexture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cf.width, cf.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, cf.pixels)
        rect = [(cr.x - x0) / (field.w * S), 1 - (cr.y + cr.h - y0) / (field.h * S), cr.w / (field.w * S), cr.h / (field.h * S)]
        // The face stencil reaches one canonical texel beyond the flow rect.
        // Draw and copy both records over that same halo to retain every pair.
        left = Math.max(0, Math.floor((cr.x - x0) / S) - 1)
        right = Math.min(field.w, Math.ceil((cr.x + cr.w - x0) / S) + 1)
        bottom = Math.max(0, Math.floor(field.h - (cr.y + cr.h - y0) / S) - 1)
        top = Math.min(field.h, Math.ceil(field.h - (cr.y - y0) / S) + 1)
        scissor = [left, bottom, right - left, top - bottom]
      })
      const exchange = (): void => {
        if (!flowTexture) return
        // Both draws read the same pre-pulse P/C. Copy back only after both
        // outputs exist; the existing settle scheduler yields between pulses.
        this.ctx.passes().brushPass(field, flowTexture, 4 * S, S, col.out, field.band, dep.out, rect, scissor, col.out, contactGain)
        this.ctx.passes().brushPass(field, flowTexture, 4 * S, S, dep.out, field.pressure, dep.out, rect, scissor, col.out, contactGain)
        field.pressure.copyRegionInto(dep.out, left, bottom, left, bottom, right - left, top - bottom)
        field.band.copyRegionInto(col.out, left, bottom, left, bottom, right - left, top - bottom)
        present(dep.out, null, col.out)
      }
      // Pulses share immutable contact geometry; reuse one closure while
      // retaining every scheduler operation and its chronological order.
      for (let sub = 0; sub < substeps; sub++) ops.push(exchange)
    }

    // (§17.42) The provisional dry target: the wet result with the one tide
    // along the whole wash's contour, into the deposit and colour buffers
    // the settle left free. The wash's own standing level and radius are
    // the widest and wettest of its operations (dryCtx), not this one's.
    let dry: { dep: AccumulationBuffer; col: AccumulationBuffer } | null = null
    if (groupDry) {
      const dryDep = dep.out === field.a ? field.c : field.a
      const dryCol = col.out === field.ca ? field.cc : field.ca
      const dc = scratch.dryCtx
      this.groupTideOps(
        ops, field, x0, y0, Math.max(radiusPx, dc?.radiusPx ?? 0) / S, Math.max(standing, dc?.standing ?? 0), scratch.paints,
        dep.out, colour ? col.out : null, dryDep, dryCol, [field.b, field.cb, field.pressure], S,
      )
      dry = { dep: dryDep, col: dryCol }
    }

    // …and home, tile by tile — and this is the new settled deposit.
    const land = (): void => {
      // (§17.43) The dry target first catches up with the deposit over the
      // WHOLE gesture, window or no window: a stroke wider than the field
      // (a replayed sheet-wide sweep from before the span cut) has paint
      // outside the rect that no settle touched, and the composite reads
      // the dry target - that paint had simply vanished from the picture.
      if (groupDry) {
        const bx0 = Math.floor(bounds.minX) - pad, by0 = Math.floor(bounds.minY) - pad
        const bx1 = Math.ceil(bounds.maxX) + pad, by1 = Math.ceil(bounds.maxY) + pad
        for (const tile of targets) {
          const entry = scratch.peek(tile.buffer)
          if (!entry?.inkLoad) continue
          const rx0 = Math.max(bx0, tile.originX), ry0 = Math.max(by0, tile.originY)
          const rx1 = Math.min(bx1, tile.originX + tile.buffer.width), ry1 = Math.min(by1, tile.originY + tile.buffer.height)
          if (rx1 <= rx0 || ry1 <= ry0) continue
          const tx = rx0 - tile.originX, ty = tile.buffer.height - (ry1 - tile.originY)
          if (!entry.inkDry) { entry.inkDry = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height); entry.inkLoad.copyTo(entry.inkDry) }
          else entry.inkLoad.copyRegionInto(entry.inkDry, tx, ty, tx, ty, rx1 - rx0, ry1 - ry0)
          if (entry.inkColor) {
            if (!entry.colorDry) { entry.colorDry = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height); entry.inkColor.copyTo(entry.colorDry) }
            else entry.inkColor.copyRegionInto(entry.colorDry, tx, ty, tx, ty, rx1 - rx0, ry1 - ry0)
          }
        }
      }
      for (const { tile, ox0, oy0, ox1, oy1 } of overlaps) {
        const entry = scratch.peek(tile.buffer)
        if (!entry?.inkLoad) continue
        const tx = ox0 - tile.originX, ty = tile.buffer.height - (oy1 - tile.originY), tw = ox1 - ox0, th = oy1 - oy0
        // (§17.44) A film that began while the settle ran (the next chunk's,
        // see newFilm) sits on a base copied before it landed: the settled
        // result goes onto that BASE, and the deposit is rebuilt as base +
        // film below - or the next chunk's paint vanished from the overlap
        // until the gesture ended. Otherwise it goes onto the deposit.
        const runningFilm = entry.filmGesture !== gesture && entry.filmGesture === scratch.gesture && !!entry.strokeInk && !!entry.inkBase
        const settledInk = runningFilm ? entry.inkBase! : entry.inkLoad
        const snap = snapshots.get(tile.buffer)
        fromField(dep.out, a0, tile, ox0, oy0, ox1, oy1, settledInk, snap?.ink ?? settledInk)
        if (entry.inkSettled) settledInk.copyRegionInto(entry.inkSettled, tx, ty, tx, ty, tw, th)
        // (§17.24) …and the coverage the water front extended - MERGED by
        // max (§17.44): the gesture may have gone on stamping the next
        // chunk's coverage while the settle ran.
        if (S === 1) {
          const sx = ox0 - x0, sy = field.h - (oy1 - y0)
          entry.coverage.copyRegionInto(field.mask, tx, ty, sx, sy, tw, th)
          this.ctx.passes().fieldOp(field.band, field.coverage, field.mask, 20, 0)
          field.band.copyRegionInto(entry.coverage, sx, sy, tx, ty, tw, th)
        } else {
          const tmp = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height)
          this.ctx.passes().wcResample(tmp, tx, ty, tw, th, field.coverage, (ox0 - x0) / S, field.h - (oy1 - y0) / S, 1 / S, 2, null, entry.coverage, fieldRect)
          tmp.copyRegionInto(entry.coverage, tx, ty, tx, ty, tw, th)
          this.ctx.pool().release(tmp)
        }
        const settledColor = entry.inkColor ? (runningFilm && entry.colorBase ? entry.colorBase : entry.inkColor) : null
        // (§17.44) One paint: its colour record is the deposit times one
        // absorption (§17.20), rebuilt at FULL resolution from the deposit
        // just brought home - the field's rebuilt record and the recorded one
        // are not the same quantity, and a change between them came back as
        // a paler, washed-out mark.
        const rebuildColour = (to: AccumulationBuffer, from: AccumulationBuffer): void =>
          this.ctx.passes().fieldOp(to, from, from, 2, 1, { c: from, d: from, tau: singleTau, scissor: [tx, ty, tw, th] })
        if (settledColor) {
          if (S > 1 && !colour) rebuildColour(settledColor, settledInk)
          else fromField(col.out, ca0, tile, ox0, oy0, ox1, oy1, settledColor, snap?.color ?? settledColor)
          if (entry.colorSettled) settledColor.copyRegionInto(entry.colorSettled, tx, ty, tx, ty, tw, th)
        }
        if (runningFilm) {
          const rect: [number, number, number, number] = [tx, ty, tw, th]
          this.ctx.passes().fieldOp(entry.inkLoad, entry.inkBase!, entry.strokeInk!, 1, 1, { scissor: rect })
          if (entry.inkColor && entry.colorBase && entry.strokeColor) this.ctx.passes().fieldOp(entry.inkColor, entry.colorBase, entry.strokeColor, 1, 1, { scissor: rect })
        }
        if (dry) {
          // (§17.43) First the settled wet state over the whole of this
          // tile's part of the field (the field is capped; past the window
          // the dry target keeps up with the deposit), then the dry result
          // over the field less its margin - the tide's change on top.
          if (!entry.inkDry) { entry.inkDry = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height); settledInk.copyTo(entry.inkDry) }
          else settledInk.copyRegionInto(entry.inkDry, tx, ty, tx, ty, tw, th)
          if (settledColor) {
            if (!entry.colorDry) { entry.colorDry = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height); settledColor.copyTo(entry.colorDry) }
            else settledColor.copyRegionInto(entry.colorDry, tx, ty, tx, ty, tw, th)
          }
          // Where the field was clipped by the tile's own edge there is no
          // margin to leave, the tile ends there.
          const ix0 = ox0 === x0 && x0 > minX ? ox0 + dryMargin : ox0, iy0 = oy0 === y0 && y0 > minY ? oy0 + dryMargin : oy0
          const ix1 = ox1 === x1 && x1 < maxX ? ox1 - dryMargin : ox1, iy1 = oy1 === y1 && y1 < maxY ? oy1 - dryMargin : oy1
          if (ix1 <= ix0 || iy1 <= iy0) continue
          fromField(dry.dep, dep.out, tile, ix0, iy0, ix1, iy1, entry.inkDry, entry.inkDry)
          if (entry.colorDry) {
            if (S > 1 && !colour) rebuildColour(entry.colorDry, entry.inkDry)
            else fromField(dry.col, col.out, tile, ix0, iy0, ix1, iy1, entry.colorDry, entry.colorDry)
          }
        }
      }
    }
    const finish = (): void => {
      if (disposed) return
      try { land() } finally { dispose(); snapshots.clear() }
    }
    // Presentation must show the actual solver-written rectangle, not only
    // the brush source AABB. Keep source bounds too when the field was capped.
    const compositeDomain = {
      minX: Math.min(bounds.minX, x0), minY: Math.min(bounds.minY, y0),
      maxX: Math.max(bounds.maxX, x1), maxY: Math.max(bounds.maxY, y1),
    }
    return { ops, finish, dispose, compositeDomain }
  }

  /** (#536, §17.42) The group tide as entries of `ops`: over a settle field
   *  whose coverage holds the wash's whole coverage (the union of every
   *  operation's domain), the wet deposit `dep` and its colour record `col`
   *  (null with one paint: rebuilt from the dried deposit) get the ONE tide
   *  along the coverage's outer contour, into `outDep` and `outCol`. `free`
   *  is three buffers the routine may scribble on; `mask`, `pressure` and
   *  `band` it takes for itself. The band is what the settle's own tide used
   *  (mode 6), read off an inward relaxation seeded from outside the
   *  coverage (mode 19) - no backrun, no "earlier mark", the whole union one
   *  domain with the dome full throughout. */
  groupTideOps(
    ops: Array<() => void>, field: SettleField, x0: number, y0: number,
    radiusPx: number, standing: number, paints: ReadonlySet<string>,
    dep: AccumulationBuffer, col: AccumulationBuffer | null, outDep: AccumulationBuffer, outCol: AccumulationBuffer,
    free: [AccumulationBuffer, AccumulationBuffer, AccumulationBuffer],
    /** (§17.44) World px per field cell; radiusPx is in cells already. */
    scale = 1,
  ): void {
    // (§17.44) A world width in cells - see the settle's own `width`.
    const width = Math.max(1, Math.round(Math.max(2, Math.min(WC_RIM_BAND_PX, Math.round(radiusPx * scale / 5))) / scale))
    const costMaxIn = width + 3
    const inSteps = width + 2
    const [t1, t2, t3] = free
    // The seeds from the coverage (mode 19): the inward pass's into `mask`
    // (inside unreached, outside the source), a stand-in outward cost into
    // `pressure` (0 inside, 1 outside); then the inward relaxation over the
    // relief as the settle runs it, the first two cells flat so the peak is
    // a continuous line. `band` is the relaxation's ping-pong partner until
    // it is written.
    ops.push(() => {
      this.ctx.passes().fieldOp(field.mask, field.coverage, field.coverage, 19, 0.002, { dir: [1, 0] })
      this.ctx.passes().fieldOp(field.pressure, field.coverage, field.coverage, 19, 0.002)
    })
    const pp = { src: field.mask, dst: field.band }
    for (let i = 0; i < inSteps; i += 4) {
      const n = Math.min(4, inSteps - i)
      ops.push(() => {
        for (let j = 0; j < n; j++) {
          const flat = i + j < 2
          this.ctx.passes().waterFrontStep(field, x0, y0, WC_FRONT_DRY_COST, pp.src, pp.dst, costMaxIn, flat ? 0 : WC_FRONT_CLIMB_IN, flat ? 1 : WC_FRONT_FLOOR_IN, 1, scale)
          const t = pp.src; pp.src = pp.dst; pp.dst = t
        }
        if (i + n >= inSteps && pp.src !== field.mask) this.ctx.passes().fieldOp(field.mask, pp.src, pp.src, 1, 0)
      })
    }
    const gather: Array<[number, number]> = []
    for (let st = 1; st <= Math.max(1, radiusPx / 2) && gather.length < 6; st *= 2) gather.push([st, st])
    // A 3x3 binomial at each stride of `gather`, `from` untouched, the result
    // in `out` (which may be one of the temporaries).
    const blurTo = (out: AccumulationBuffer, from: AccumulationBuffer, tmpA: AccumulationBuffer, tmpB: AccumulationBuffer): void => {
      let gs = from, gd = tmpA
      for (let i = 0; i < gather.length; i++) {
        this.ctx.passes().fieldOp(gd, gs, gs, 5, 0, { dir: gather[i] })
        const next = gd === tmpA ? tmpB : tmpA
        gs = gd; gd = next
      }
      if (gs !== out) this.ctx.passes().fieldOp(out, gs, gs, 1, 0)
    }
    const tideWater = Math.min(1, standing / WC_TIDE_STANDING_FULL)
    const share = watercolorRimShare(WC_TIDE_RIM, radiusPx, width) * tideWater
    const costMax = 8
    ops.push(() => {
      // The band (mode 6) over the whole union: costOut 0 inside the
      // coverage so `inside` and the dome are 1 throughout, no backrun (tau
      // 0), no "earlier mark" (the seed's .b is empty), the stood record
      // from the coverage against the wash's wettest standing level. Then
      // the band gathered by the rim's kernel, into `mask`.
      this.ctx.passes().fieldOp(field.band, field.pressure, field.coverage, 6, 0, {
        c: field.mask, d: field.pressure, band: [0.5, width / costMaxIn], size: [1 / costMax, 1 / costMaxIn],
        origin: [standing, 0], dir: [1, 1], tau: [0, 0, 0], world: [x0 / scale, -(y0 / scale + field.h), scale],
      })
      blurTo(field.mask, field.band, t1, t3)
    })
    // The tide: `share` of ALL the paint inside (mode 7 by band .g, the whole
    // union) gathered onto the band (mode 14) - the deposit and, with two
    // paints or more, the colour record by the same fractions.
    const tide = (paint: AccumulationBuffer, out: AccumulationBuffer): void => {
      this.ctx.passes().fieldOp(t1, paint, paint, 7, share, { d: field.band })
      blurTo(t2, t1, t2, t3)
      this.ctx.passes().fieldOp(out, paint, t2, 14, share, { c: field.mask, d: field.band })
    }
    ops.push(() => tide(dep, outDep))
    if (col) {
      ops.push(() => tide(col, outCol))
    } else {
      const only = [...paints][0]
      const tau = only ? pigmentAbsorption(only.split(',').map(Number) as [number, number, number]) : [0, 0, 0]
      ops.push(() => this.ctx.passes().fieldOp(outCol, outDep, outDep, 2, 1, { c: outDep, d: outDep, tau: [tau[0], tau[1], tau[2]] }))
    }
  }

  destroyTextures(): void {
    for (const field of this._ownedInputs) field.destroy()
    this._ownedInputs.clear()
    this.gl.deleteTexture(this._brushFlowTex)
    this.gl.deleteTexture(this._foreignWaterTex)
  }

  forgetTextures(): void {
    this._ownedInputs.clear()
    this._brushFlowTex = null
    this._foreignWaterTex = null
  }
}
