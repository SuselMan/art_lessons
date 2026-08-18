import type { ToolType } from '@grafetto/shared'

import { markerNibFromPreset } from './markerPresets'
import type { NibShape } from './markerRibbon'

// #455, ADR 009 §1: what the ribbon rasterizer draws, separated from what it
// deposits.
//
// The ribbon (#330) was built for the marker and, until this file existed, was
// the marker: its geometry, its multiply-with-dye composite and its ink-load
// bookkeeping were one path in engine/index.ts. But only the *ink model* is
// marker-specific. The geometry — sweep a convex nib along a segment, get the
// convex hull of its two endpoint copies, exactly — is the general answer to
// "draw a stroke as a connected figure instead of a row of stamps", and it is
// the only rasterizer here that can render a *variable-width* line without
// beading, because its bands take each endpoint's own nib geometry (see
// markerRibbon.ts's per-endpoint nibSupport calls).
//
// The brush pen needs exactly that geometry and none of the dye model. So the
// two tools now differ by this record and nothing else.

export interface RibbonProfile {
  /** Outline the CPU-side band builder and the shader's nib stamp must agree
   *  on — they draw the same figure from two directions. */
  nibShape: NibShape
  /** Corner radius as a fraction of the nib's short half-axis. Ignored for an
   *  ellipse. */
  cornerFraction: number
  /** Width of the mark's edge ramp, in canvas px. */
  aaPx: number
  /** Whether the ink-load pass runs at all. True only for a tool whose
   *  composite needs a separate per-pixel pigment quantity (the marker's
   *  multiply); a covering, source-over ink has no such quantity, and the pass
   *  would be one buffer and two draws per tile spent on a value nothing
   *  reads. This flag is also the hook a future dry-brush/inkLoad mode turns
   *  on — ADR 009 §10 on why the hook is here and not a field in the payload. */
  ink: boolean
  /** How much less ink lands at the nib's rim than at its centre. Read only by
   *  the ink pass. */
  inkEdgeFalloff: number
  /** Which DAB_FRAG branch composites the finished pixel: 2 = the marker's
   *  multiply-with-darkness, 8 = the brush pen's source-over. */
  compositeInkMode: 2 | 8
  /** How far the ribbon's straight chords may deviate from the curve they
   *  approximate before sampling gets denser (DabSystem.curvatureTolerancePx). */
  curvatureTolerancePx: number
  /** Smallest half-width, in canvas px, that this tool still draws. A dab
   *  below it is *widened* to it rather than dropped.
   *
   *  The marker drops such dabs instead (null here), and for the marker that
   *  is right — a sub-half-pixel marker dab is a degenerate case. For the brush
   *  pen it would delete precisely the thin end of every stroke, i.e. the tool's
   *  first quality criterion: 0.15 (the width floor) times a 3px pen is 0.45px.
   *  A light touch with a fine pen should leave a hairline, not a gap. */
  minHalfWidthPx: number | null
  /** How far ink wicks into absorbent paper at the mark's *rim*, as a fraction
   *  of the edge ramp's own width. The core is never touched at any value (see
   *  DAB_FRAG's brush-pen branch: the term is scaled by 1 - coverage, which is
   *  identically 0 inside the mark). 0 disables it. */
  paperWick: number
}

// ─── Marker (#330) ──────────────────────────────────────────────────────────

// #330 stage 2: width of the marker's edge ramp, in canvas pixels — the one
// number that decides how crisp the tool reads, and deliberately an absolute
// one. The profile it replaces spent a fixed *fraction* of the dab on its
// falloff (36-40% of the mark's half-width at every size), so a 120px brush
// came out with a ~44px gradient; a real felt/alcohol tip has an edge whose
// width is a property of the tip, not of how wide the tip is.
//
// Canvas pixels, not screen pixels: dabs are baked into the layer's own
// world-space buffer and the viewport transform is applied later at display
// time, so a screen-space width would make the same Operation Log render
// differently at different zoom — see .claude/rules.md on cross-device
// determinism for why that class of dependency is not acceptable here.
//
// 1.0 is the natural starting point (one pixel of ramp is what a hard edge
// costs to antialias at all); this is an uncalibrated first pass like every
// other marker constant, and the paper-driven bleed that used to hide inside
// the old falloff is deliberately not folded back in yet — stage 3.
const MARKER_EDGE_AA_PX = 1.0

// #330 stage 3: how far the ribbon's straight chords may deviate from the curve
// they approximate before sampling gets denser (DabSystem.curvatureTolerancePx).
//
// 0.15px, not the half pixel this started at. The first value was picked
// against the path's own sagitta alone and left visible rounded scalloping on
// turns with a wide nib: the dominant error is the nib's *reach* amplifying the
// turn (see DabSystem.curvatureTolerancePx), and against a 1px edge ramp a
// periodic 0.5px wobble is roughly half the boundary pixel's alpha — plainly
// visible now that nothing blurs it. A fraction of the ramp width is the right
// scale for this; sample count only grows with sqrt(1/tol), so tightening it
// this far costs ~1.8x the samples on the curves where it binds at all, and
// nothing on straight strokes.
const MARKER_CURVATURE_TOLERANCE_PX = 0.15

// #330 stage 3, ADR 004 §1 revisited: the chisel nib is a rounded rectangle,
// not an ellipse. A flat felt tip really does have parallel sides and a short
// rounded end; an ellipse tapers all the way along its length, which reads as a
// calligraphy pen and never produces the flat broad band a chisel marker is
// bought for. Only reachable now that the ribbon makes the union exact for any
// convex nib — as a *stamp* shape a rounded box was measurably worse than the
// ellipse (26.3px of scalloping against 21.0px at the same spacing), because a
// flat side translates as a whole.
//
// Corner radius as a fraction of the nib's short half-axis; the expert's
// suggested range was 0.20-0.35 and this sits in the middle. Uncalibrated first
// pass like every other marker constant.
const MARKER_CHISEL_CORNER_FRACTION = 0.28

// #330 stage 3: how much less ink the nib lays down right at its rim than at
// its centre. Deliberately shallow — a marker's mark is close to uniform across
// the tip, and the old soft profile (which tapered all the way to zero) is what
// made a light touch read as an airbrush instead of a marker. The silhouette's
// crispness now comes from geometry, so this term no longer has to double as an
// edge; it only keeps the mark from looking mechanically flat.
const MARKER_INK_EDGE_FALLOFF = 0.9

// ─── Brush pen (#454, ADR 009) ──────────────────────────────────────────────

// ADR 009 §7: the pen's edge *is* its ink spread. A perfectly mathematical
// boundary reads as digital; real ink travels a short way into the paper's
// fibres. The liner expresses that by growing its dab quad past the geometric
// radius (#452's wick), which is a mechanism built for stamps — the ribbon
// already has the same property in the right units, so the brush pen widens
// this ramp instead of carrying a second mechanism for one effect.
//
// 1.8px against the marker's 1.0: visibly softer, still inside the 0.3-1.0px
// of visible feathering ADR 009 asks for (the ramp is one-sided, running
// inward from the boundary). Canvas px, for exactly the reason MARKER_EDGE_AA_PX
// spells out above — and ADR 009 §7 restates it, because the spec that
// prompted this tool said "physical/screen pixels", which through a per-device
// DPR factor would be the one thing cross-device determinism forbids.
const BRUSH_PEN_EDGE_AA_PX = 1.8

/** ADR 009 §2: below this half-width the nib is widened rather than dropped —
 *  see RibbonProfile.minHalfWidthPx. Half a canvas pixel is where a mark stops
 *  being resolvable at all. */
const BRUSH_PEN_MIN_HALF_WIDTH_PX = 0.5

/** ADR 009 §8: paper's influence on the brush pen is far weaker than on
 *  graphite or charcoal, and it acts on the rim only — no holes or grain inside
 *  the stroke, which would read as a dry brush rather than a brush pen.
 *
 *  A fraction of the edge ramp (BRUSH_PEN_EDGE_AA_PX, 1.8 canvas px), so 0.5
 *  means ink reaches roughly 0.9px further out where the paper is at its most
 *  absorbent than where it is at its least. That sits inside the 0.3-1.0px of
 *  visible feathering ADR 009 §7 asks for, and it is the *whole* of the pen's
 *  spread: there is no second outward band the way the liner has one, because
 *  the ribbon's own ramp is already in the right units and the ADR is explicit
 *  that one effect gets one mechanism.
 *
 *  Raised from #454's 0.35 along with the sign fix (#472) — at 0.35 running
 *  the wrong way it was subtracting about half a pixel of ink from exactly the
 *  places ink should have been reaching. Uncalibrated. */
const BRUSH_PEN_PAPER_WICK = 0.5

const MARKER_BULLET_RIBBON: RibbonProfile = {
  nibShape: 'ellipse',
  cornerFraction: 0,
  aaPx: MARKER_EDGE_AA_PX,
  ink: true,
  inkEdgeFalloff: MARKER_INK_EDGE_FALLOFF,
  compositeInkMode: 2,
  curvatureTolerancePx: MARKER_CURVATURE_TOLERANCE_PX,
  minHalfWidthPx: null,
  paperWick: 0,
}

const MARKER_CHISEL_RIBBON: RibbonProfile = {
  ...MARKER_BULLET_RIBBON,
  nibShape: 'roundedBox',
  cornerFraction: MARKER_CHISEL_CORNER_FRACTION,
}

const BRUSH_PEN_RIBBON: RibbonProfile = {
  nibShape: 'ellipse',
  cornerFraction: 0,
  aaPx: BRUSH_PEN_EDGE_AA_PX,
  // No dye quantity to track: ink is a covering deposit, so coverage alone
  // says everything the composite needs. See RibbonProfile.ink.
  ink: false,
  inkEdgeFalloff: 1,
  compositeInkMode: 8,
  // Same tolerance as the marker's. The term that dominates it is the nib's
  // reach amplifying a turn, and this nib is nearly round (aspect ~1.1) rather
  // than 5:1 — so this is comfortably conservative here rather than tight.
  curvatureTolerancePx: MARKER_CURVATURE_TOLERANCE_PX,
  minHalfWidthPx: BRUSH_PEN_MIN_HALF_WIDTH_PX,
  paperWick: BRUSH_PEN_PAPER_WICK,
}

/** Which tools the ribbon rasterizer draws. Every other tool goes through the
 *  ordinary per-dab stamp path, unchanged. */
export function isRibbonTool(tool: ToolType): boolean {
  return tool === 'marker' || tool === 'brushPen'
}

export function ribbonProfileFor(tool: ToolType, presetName: string | undefined): RibbonProfile {
  if (tool === 'brushPen') return BRUSH_PEN_RIBBON
  return markerNibFromPreset(presetName) === 'chisel' ? MARKER_CHISEL_RIBBON : MARKER_BULLET_RIBBON
}
