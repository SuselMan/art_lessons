// (#494) Dab opacity baking, out of PencilEngine (seam С12 of the survey).
// Every term that ends up in a recorded Dab.opacity — preset, user opacity,
// speed, tilt/broadness, #478's deposit correction — is decided here, once,
// before the dab is painted or sent: a peer replaying the stroke reads the
// baked number and never re-derives it. Pure: the engine hands in the two
// numbers of its own it needs (the brush size and the dab spacing factor)
// through its private _bakeDabOpacity wrapper.

import type { Dab, ToolType } from '@grafetto/shared'
import { charcoalBroadDensity, charcoalBroadness } from '../presets/charcoalFeel'
import { charcoalNibFromPreset } from '../presets/charcoalPresets'
import { linerSpeedFlow, linerTiltFlow } from '../presets/linerPresets'
import { markerPressureFlow } from '../presets/markerPresets'
import { pencilTiltDensity, pencilTiltness } from '../presets/pencilTilt'
import { nibScallops, presetForTool, renderSizeScale } from '../presets/resolvePreset'
import { tiltMagnitudeDeg } from '../presets/tiltMath'
import { dabDepositScale, isDepositScaledTool, type DabSpacingBounds } from './dabSpacing'

/** Bakes final dab opacity (preset × user opacity × speed) in place. Shared
 *  by the real stroke path and the #92 prediction preview, so predicted
 *  dabs render with visually consistent opacity to real ones. tool/
 *  presetName/opacity are explicit params (rather than always reading this
 *  user's own _strokeTool/_strokePreset/_opts.opacity) purely so both
 *  callers can pass their own state through one shared implementation.
 *
 *  `baseSize` is the brush's nominal world size (the engine's _physicalSize)
 *  and `spacingFactor` the DabSystem's — the pair the dabs were spaced with,
 *  which #478's deposit correction below has to divide by. */
export function bakeDabOpacity(
  dabs: Dab[], speed: number, tool: ToolType, presetName: string, opacity: number,
  baseSize: number, spacingFactor: number,
): void {
  const preset      = presetForTool(tool, presetName)
  const speedFactor = Math.max(0.7, 1.0 - speed * 0.15)
  // Marker (#250, ADR 004 §2) shares liner's exact speed-flow curve —
  // "minimal influence" is the same physical justification ADR 004 gives
  // (a real ink/dye tip doesn't compress the way graphite does), and
  // reusing linerSpeedFlow rather than inventing a separate marker curve
  // keeps this v1/uncalibrated (ADR 004 MVP scope) without adding a new
  // unverified formula on top of an already-uncalibrated one.
  const inkSpeed = (tool === 'liner' || tool === 'marker') ? linerSpeedFlow(speed) : 0
  // #478: for a footprint-spaced tool the step between dabs is no longer a
  // constant fraction of the brush size, so how many dabs land on a given
  // pixel now varies with grade, pressure and tilt — and for these three
  // tools the deposit is linear in `Dab.opacity` and normalized by nothing
  // else, so denser dabs would simply paint a darker mark. This holds the
  // tone where it is; see dabSpacing.ts's dabDepositScale for why the linear
  // form is the accurate one here rather than a convenient one.
  //
  // Null (and therefore free) for every tool still on the old spacing rule,
  // where the ratio would be exactly 1 by construction.
  // #547: not isFootprintSpacedTool — the digital brush is spaced by that rule
  // and deliberately excluded from this correction. See isDepositScaledTool.
  const sizeScale = isDepositScaledTool(tool) ? renderSizeScale(tool, presetName) : null
  // #501: which bounds actually shaped this stroke's step. The deposit is
  // divided by the step the dabs were *really* spaced at, so this has to be
  // the same pair DabSystem was given at _onStart — a chisel spaced by the
  // scallop bound but normalised by the footprint rule alone would simply
  // paint darker, in proportion to how much the extra bound tightened it.
  const spacingBounds: DabSpacingBounds = { footprint: true, scallop: nibScallops(tool, presetName) }
  // #501: the flat nib's elongation is a property of the cut, not of how far
  // the stick is laid over — and its contact patch is *smaller* than the
  // round end face, not larger, so charcoal's broad-side lightening reads it
  // exactly backwards. Zero here, and 0 passed as u_charcoalBroadAspect at
  // paint time, so the shader's own copy of the same derivation agrees
  // (charcoalBroadness' comment on why the two must not disagree).
  const chiselNib = tool === 'charcoal' && charcoalNibFromPreset(presetName) === 'chisel'
  for (const dab of dabs) {
    if (tool === 'eraser') dab.opacity = opacity
    // Smudge (#14) has no pencil preset to draw an opacity from (the
    // opacity slider here is repurposed as "strength" — see toolSchemas'
    // own smudge entry) — same speedFactor as pencil though: moving
    // slower still means a firmer, more thorough blend, matching how a
    // real blending stump behaves.
    else if (tool === 'smudge') dab.opacity = opacity * speedFactor
    // Liner (#241, ADR 003 §2-3, §7): pressure's own contribution to flow
    // lives entirely in DabShapingProfile.depositPressure (dabShaping.ts),
    // baked into dab.pressure before this ever runs — see linerPresets.ts's
    // own comment on why it isn't re-derived here. Speed and tilt are the
    // only two factors this branch adds on top of the flat preset opacity.
    else if (tool === 'liner') {
      const tiltDeg = tiltMagnitudeDeg(dab.tiltX, dab.tiltY)
      dab.opacity = preset.opacity * opacity * inkSpeed * linerTiltFlow(tiltDeg)
    }
    // Marker (#250, ADR 004 §2; explicit pressureFactor added in "Ревизия
    // v1.5" §1 — the expert's own proposed
    // `deposit = flowPerDistance * segmentLength * pressureFactor` names
    // it as its own term rather than folding it silently into "flow"):
    // same speed/tilt shape as liner (shared inkSpeed above), plus a mild
    // markerPressureFlow term liner doesn't have. `dab.opacity` here is
    // *not yet* the final ink deposit — _ribbonStrokeWork multiplies it
    // by this dab's own segmentLength at paint time (distance-
    // normalization can't happen here: this function only ever sees one
    // dab at a time, with no notion of "distance since the previous
    // one" — see _markerSegmentLength).
    else if (tool === 'marker') {
      const tiltDeg = tiltMagnitudeDeg(dab.tiltX, dab.tiltY)
      dab.opacity = preset.opacity * opacity * inkSpeed * linerTiltFlow(tiltDeg) * markerPressureFlow(dab.pressure)
    }
    // Brush pen (#454, ADR 009 §5/§9): flat. Not "not tuned yet" — flat on
    // purpose, and in two directions.
    //
    // No pressure term, because a tool where pressure moves width *and*
    // alpha together reads as an airbrush rather than a pen; ADR 009 §9
    // makes width the only thing pressure drives. No speed or tilt term
    // either: the liner's inkSpeed models ink leaving a capillary tip at a
    // rate per unit *time*, which is a fineliner's physics, not a flexing
    // brush nib's — what speed does to this tool is sharpen the tail
    // (applyBrushPenEndTaper), and that is the whole of it in v1.
    //
    // The flatness is also load-bearing downstream, not merely tidy: every
    // dab of the stroke carrying the same opacity is exactly what lets the
    // source-over composite reconstruct the finished pixel from a coverage
    // buffer and one scalar (DAB_FRAG's u_inkMode=8 branch). A per-dab
    // opacity could not be expressed there at all.
    else if (tool === 'brushPen') dab.opacity = preset.opacity * opacity
    // #547, ADR 013 §3 — flat, and for the composite's own reason stated for
    // the brush pen directly above: this number is the *stroke's* opacity, and
    // the source-over composite reconstructs each finished pixel from one
    // coverage buffer and one scalar. A per-dab value could not be expressed
    // there.
    //
    // What varies per dab for this tool is **flow**, and it deliberately does
    // not live here: it is applied when the stamp is drawn into the coverage
    // buffer (_paintRibbonDabs), where accumulating it is the whole point.
    // Recomputed on replay from Dab.pressure and the frozen descriptor rather
    // than recorded, so the payload gains nothing (digitalBrushFlow).
    else if (tool === 'digitalBrush') dab.opacity = preset.opacity * opacity
    // Watercolor (#468, ADR 011 §5): flat, for every reason the brush pen's
    // is flat directly above, plus one of its own.
    //
    // The shared reasons: pressure drives the brush's width, not its
    // transparency, and a flat per-stroke opacity is what lets the composite
    // reconstruct a finished pixel from a coverage buffer and one scalar
    // (DAB_FRAG's u_inkMode=9 branch reads u_opacity, not a per-dab value).
    //
    // Its own: how dark a wash comes out is already modelled, and modelled
    // somewhere better — inkLoad accumulates distance-normalized deposit and
    // the composite saturates it (WATERCOLOR_SATURATE_INK). Adding a speed or
    // pressure term to alpha *as well* would be two mechanisms competing to
    // express one physical quantity, which is how the marker's own density
    // got hard to reason about before "Ревизия v1.5" separated them.
    // (#468 v9) …times how much paint is in the water. This is pigment's one
    // and only route to the finished pixel: the deposit is now a constant
    // (watercolorPigmentEffects), so nothing else scales with it and the
    // control stays linear. Constant across a stroke, which is what lets the
    // composite reconstruct a finished pixel from a coverage buffer and one
    // scalar at all.
    // (#536) …and no longer times how much paint is in the water. That factor
    // moved onto the deposit (DAB_FRAG's u_inkStrength), because a wash spans
    // several strokes and they are allowed to carry different amounts of
    // paint — that is precisely what "lay clean water, then take colour into
    // it" is. With it here, the composite reconstructed the whole wash from
    // one scalar taken from whichever stroke opened it, so a wash that began
    // with clean water rendered every stroke after it invisible at pen-up.
    else if (tool === 'watercolor') dab.opacity = preset.opacity * opacity
    // Charcoal (#304 §3, plus #305's broad-side lightening): shares pencil's
    // speed curve deliberately — "slower stroke -> denser deposit" is equally
    // true of both materials — and adds one term graphite has no analogue
    // for. Laid on its broad side, the stick spreads the same pressure over a
    // far larger contact patch, so it must deposit lighter; without this, the
    // broad regime just paints a much bigger *and* equally dark mark, which
    // reads as a fat marker rather than a stick on its side. Derived from the
    // dab's own baked aspectRatio rather than re-running the curve on tilt,
    // so it can't disagree with the geometry actually being drawn (see
    // charcoalBroadness' own comment).
    else if (tool === 'charcoal') {
      const broadness = chiselNib ? 0 : charcoalBroadness(dab.aspectRatio)
      dab.opacity = preset.opacity * opacity * speedFactor * charcoalBroadDensity(broadness)
    }
    // Graphite (#389). The tilt term is the counterpart of charcoal's
    // broad-side lightening just above, and arrives here the same way: from
    // the dab's own baked aspectRatio, not by re-running the curve on tilt,
    // so a slider moved between record time and here can't make the deposit
    // disagree with the geometry it's shading (see pencilTiltness). Reduces
    // to exactly the old expression when PENCIL_TILT.lightening is 0.
    //
    // Eraser and smudge share the tilt *geometry* but not this: their
    // branches above never had a preset opacity to scale, and "erases less
    // when tilted" is a change to how erasing works rather than a
    // consequence of spreading graphite over more paper.
    else dab.opacity = preset.opacity * opacity * speedFactor * pencilTiltDensity(pencilTiltness(dab.aspectRatio))
    // Applied on top of whichever branch ran, not inside them: it is a
    // property of how densely this dab's own footprint got sampled, and says
    // nothing about which material is being deposited. Baked into the
    // recorded Dab like every other term here, so a peer replaying the
    // stroke reproduces the same tone without knowing anything about
    // spacing (#478).
    if (sizeScale !== null) {
      dab.opacity *= dabDepositScale(
        { size: dab.size, aspectRatio: dab.aspectRatio, sizeScale, hardness: preset.hardness },
        baseSize, spacingFactor, spacingBounds)
    }
  }
}
