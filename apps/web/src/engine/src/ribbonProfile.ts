import type { ToolType } from '@grafetto/shared'

import { markerNibFromPreset } from './markerPresets'
import {
  watercolorMixFromPreset, watercolorWaterEffects, watercolorPigmentEffects,
  watercolorPigmentFromPreset,
} from './watercolorPresets'
import { watercolorPigmentByCode } from './watercolorPigments'
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
   *  multiply-with-darkness, 8 = the brush pen's source-over, 9 = watercolor's
   *  transparent glaze (#468, ADR 011 §3). */
  compositeInkMode: 2 | 8 | 9
  /** #468 — how much extra pigment piles up at the wash's own boundary as it
   *  dries (ADR 011 §3.1). 0 disables the term outright, which is what every
   *  tool but watercolor sets; the shader multiplies by it, so a zero makes the
   *  whole ring-sampling block vanish identically rather than merely rounding
   *  to nothing. */
  wetEdge: number
  /** #468 — how far out, in canvas px, the wet-edge term looks for the wash's
   *  boundary. This is the visual *width* of the dark rim, and it is an
   *  absolute canvas-px distance for exactly the reason aaPx is (see
   *  MARKER_EDGE_AA_PX): a real wash's tideline is a property of how far
   *  pigment creeps before the water front stops, not of how wide the brush
   *  was. */
  wetEdgeRadiusPx: number
  /** #468 — how strongly the paper's own pits catch settling pigment (ADR 011
   *  §3.3). 0 disables. Reads the same offline-baked paperCatch every other
   *  branch does, so it adds no new GPU-side derivation. */
  granulation: number
  /** #468 v2 — how far, in canvas px, the wash may travel past the place the
   *  brush actually touched (ADR 011 §3.5). 0 disables the whole re-threshold
   *  block, which is what every other ribbon tool wants: a marker's mark *is*
   *  its swept nib outline, and so is a pen's.
   *
   *  This is the single most important number of v2. With it at 0 the tool is
   *  a semi-transparent marker no matter what the other terms do, because the
   *  eye reads the exact correspondence between the brush's path and the
   *  mark's boundary long before it reads any texture. */
  spreadPx: number
  /** #468 v2 — depth of the low-frequency water/pigment field (ADR 011 §3.6).
   *  0 disables. This is the scale a wash actually varies at; paper grain is a
   *  tenth of it and cannot stand in for it. */
  cloud: number
  /** #468 v3 — whether the ink pass divides each dab's deposit by that dab's
   *  own radius, making it a quantity *per unit area* instead of per unit
   *  length (ADR 011 §3.8).
   *
   *  False keeps the original formula, and the marker must keep it forever: its
   *  strokes are in production rooms and its saturation constants were
   *  calibrated against that scale, so changing it would silently re-render
   *  every marker mark ever drawn.
   *
   *  What it fixes for watercolor: unnormalized, a pixel accumulates roughly
   *  `opacity x radius` because it is covered by about `2 * radius / spacing`
   *  dabs each depositing `opacity x spacing`. On a 70px-radius wash that is
   *  ~29 into an 8-bit buffer that saturates at 1.0 — so the saturation curve
   *  was pinned at its ceiling everywhere and `density` was the constant 1.
   *  Normalized, the same pixel lands near `opacity` regardless of how wide the
   *  brush is or how densely the dabs were spaced, which is the only way the
   *  curve can express anything at all. */
  normalizeDeposit: boolean
  /** #468 v3 — deposit laid per radius of travel, when normalizeDeposit is on.
   *  0 for a tool on the legacy scale, which reads dab.opacity instead.
   *
   *  Deliberately a constant of the *tool* rather than dab.opacity, which is
   *  what the legacy formula uses. dab.opacity carries the user's own opacity
   *  slider, and feeding it into inkLoad as well would make that slider act
   *  twice — once on how much pigment is deposited and again on how strong the
   *  composite paints it — so halving it would quarter the mark. inkLoad has to
   *  mean "how much brushwork has happened here", which is a fact about the
   *  gesture and not about how dilute the paint is.
   *
   *  Calibrated against the buffer, not derived on paper: the arithmetic says a
   *  fully-worked pixel should accumulate about 2x this, but reading the actual
   *  inkLoad texture back showed roughly half that — 8-bit quantisation eats a
   *  slice of every one of the ~30 tiny additions a pixel receives, and the
   *  bands do not overlap the stamps quite as densely as the geometry suggests.
   *  0.75 measures out at ~0.66 at full water and ~0.26 at the far end of a
   *  40-radius sweep, which straddles saturateInk exactly as intended. Re-measure
   *  rather than re-derive if either number moves. */
  depositPerRadius: number
  /** #468 v5 — how covering this paint is, 0..1 (ADR 011 §5). Chooses between
   *  the two halves of the composite: at 0 the wash transmits whatever is under
   *  it (a multiply, which is all v1-v4 ever did), at 1 it sits on top of it.
   *
   *  Every real watercolour is near the transparent end — the table's widest is
   *  0.20 — but the difference between 0.02 and 0.20 is exactly what makes two
   *  glazes read as paint over paint rather than as two flat digital layers. */
  pigmentOpacity: number
  /** #468 v4 — the stroke's own water level, 0..1, as the user set it (ADR 011
   *  §4). This is the *initial* load; the engine multiplies it by how much is
   *  left at each dab (watercolorWaterLoad). 0 for a tool with no water model.
   *
   *  On the profile rather than parsed from the preset string at every call
   *  site: the profile is already built from that string once per batch, and a
   *  second parser somewhere else is a second place for the format to drift. */
  waterLevel: number
  /** #468 v4 — the stroke's own pigment level, 0..1. Same story. */
  pigmentLevel: number
  /** #468 v4 — reach as a fraction of the stroke's own radius, before spreadPx
   *  caps it (ADR 011 §4.1). Water decides it: a dry brush barely leaves its
   *  own footprint, a flood travels visibly further than the hand went. 0 for a
   *  tool with no spread at all. */
  spreadOfRadius: number
  /** #468 v4 — how strongly the paper's own relief breaks the brush's contact
   *  with it (ADR 011 §4.2). 0 = a loaded brush that floods the valleys and
   *  touches everything; 1 = a nearly dry one riding the crests.
   *
   *  This is dry brush done as *geometry*, not as a texture laid over a solid
   *  mark: it multiplies coverage itself, so the silhouette genuinely breaks up
   *  and the gaps are paper rather than pale paint. A grain multiplier on top
   *  of a continuous mark reads as a textured brush — which is exactly the
   *  criticism v1 through v3 kept attracting.
   *
   *  Only the nominal value lives here; the shader modulates it per pixel by
   *  how much water was left when the brush passed (see u_inkLoad's .r channel). */
  dryContact: number
  /** #468 v4 — upper end of the per-place edge-softness range (ADR 011 §4.1).
   *  Water decides it: a flood has edges running from nearly lost to fairly
   *  crisp within one mark, a dry brush has only crisp ones. */
  edgeSoftMax: number
  /** #468 v4 — the band the tideline's gating field is thresholded against.
   *  Low/high, and *inverted* with water on purpose: a dry mark has almost no
   *  perimeter carrying a rim, a wet one has most of it. */
  tideLo: number
  tideHi: number
  /** #468 v3 — whether the deposit decays as the brush unloads along the stroke
   *  (ADR 011 §3.8, watercolorPresets.ts's watercolorWaterLoad). False leaves
   *  every dab depositing the same amount, which is right for a marker or a pen
   *  fed from a reservoir and wrong for a brush carrying a finite load. */
  waterDepletion: boolean
  /** #468 — the inkLoad at which one pass reaches its full density and stops
   *  building (ADR 011 §3.2). Unlike the marker's two discrete Beer-Lambert
   *  layers, a single wet wash has exactly one: brushing back over paint that
   *  is still wet moves it around, it does not stack a second film. Depth comes
   *  from *glazing* — lifting the brush and going again, which starts a new
   *  scratch and therefore a genuinely new layer. Ignored by a branch that
   *  doesn't read inkLoad. */
  saturateInk: number
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
  /** How strongly paper grain eats into the mark's *rim*. The core is never
   *  touched at any value (see DAB_FRAG's brush-pen branch: the term is scaled
   *  by 1 - coverage, which is identically 0 inside the mark). 0 disables it. */
  paperEdge: number
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
 *  Uncalibrated first pass. */
const BRUSH_PEN_PAPER_EDGE = 0.35

const MARKER_BULLET_RIBBON: RibbonProfile = {
  nibShape: 'ellipse',
  cornerFraction: 0,
  aaPx: MARKER_EDGE_AA_PX,
  ink: true,
  inkEdgeFalloff: MARKER_INK_EDGE_FALLOFF,
  compositeInkMode: 2,
  curvatureTolerancePx: MARKER_CURVATURE_TOLERANCE_PX,
  minHalfWidthPx: null,
  paperEdge: 0,
  // #468 — watercolor's three terms, off. The marker's own branch never reads
  // them; they are set explicitly rather than left optional so that adding a
  // fourth ribbon tool has to make a decision about each one instead of
  // inheriting an accident.
  wetEdge: 0,
  wetEdgeRadiusPx: 0,
  granulation: 0,
  spreadPx: 0,
  cloud: 0,
  // #468 v3 — the legacy deposit scale, and permanently so: this tool's strokes
  // are in production rooms and its saturation constants were calibrated
  // against it. See RibbonProfile.normalizeDeposit.
  normalizeDeposit: false,
  depositPerRadius: 0,
  waterDepletion: false,
  // #468 v4 — the brush model's own four. Off, and the tools they belong to
  // have no use for them: a marker tip and a pen nib carry ink from a
  // reservoir, not a finite load of water with paint in it.
  waterLevel: 0,
  pigmentLevel: 0,
  pigmentOpacity: 0,
  spreadOfRadius: 0,
  dryContact: 0,
  edgeSoftMax: 0,
  tideLo: 0,
  tideHi: 0,
  saturateInk: 0,
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
  paperEdge: BRUSH_PEN_PAPER_EDGE,
  wetEdge: 0,
  wetEdgeRadiusPx: 0,
  granulation: 0,
  spreadPx: 0,
  cloud: 0,
  // #468 v3 — the legacy deposit scale, and permanently so: this tool's strokes
  // are in production rooms and its saturation constants were calibrated
  // against it. See RibbonProfile.normalizeDeposit.
  normalizeDeposit: false,
  depositPerRadius: 0,
  waterDepletion: false,
  // #468 v4 — the brush model's own four. Off, and the tools they belong to
  // have no use for them: a marker tip and a pen nib carry ink from a
  // reservoir, not a finite load of water with paint in it.
  waterLevel: 0,
  pigmentLevel: 0,
  pigmentOpacity: 0,
  spreadOfRadius: 0,
  dryContact: 0,
  edgeSoftMax: 0,
  tideLo: 0,
  tideHi: 0,
  saturateInk: 0,
}

// ─── Watercolor (#468, ADR 011) ─────────────────────────────────────────────

// The third tool to take the ribbon's geometry without its ink model, and the
// clearest demonstration of why #455 separated the two: a wet round brush and a
// brush pen sweep an identical figure. Everything that makes one read as water
// and the other as ink is in the deposit model.

/** Softer than the brush pen's 1.8, which is itself softer than the marker's
 *  1.0. Water carries pigment a little way into the fibres before the paper
 *  stops it, and a wash whose boundary resolves in under two pixels reads as a
 *  vector shape filled with pale colour. This is the *inner* ramp only — the
 *  visible tideline outside it is the wet-edge term below, which is a different
 *  mechanism at a different scale.
 *
 *  Canvas px, never device px — see MARKER_EDGE_AA_PX for the full argument
 *  and .claude/rules.md for why a per-DPR factor in shared canvas content is
 *  the one thing that is not allowed here. */
const WATERCOLOR_EDGE_AA_PX = 3.0

/** How wide the tideline is. 7px is a visible rim at a realistic wash size
 *  without turning into a vignette; it is also comfortably inside what a
 *  16-tap ring can resolve without aliasing into a dotted outline. */
const WATERCOLOR_WET_EDGE_RADIUS_PX = 7.0

/** ADR 011 §3.2/§3.8 — inkLoad at which one pass reaches full density.
 *
 *  A wet wash reaches its tone almost at once and then stops: brushing back and
 *  forth over paint that has not dried moves the same pigment around rather
 *  than adding more. Depth comes from *glazing* — lifting the stylus, which
 *  starts a new scratch and multiplies afresh over what the last pass left.
 *
 *  Meaningful only since v3. Until the deposit was normalized this curve was
 *  fed a value that saturated an 8-bit buffer on the first dab, so it evaluated
 *  to a flat 1 everywhere and the whole term was dead code — which is a good
 *  part of why v1's washes were so mechanically even. Now a full-water pass
 *  lands just above this and a depleted one lands well below, which is what
 *  makes the far end of a long sweep read as drier than its start. */
const WATERCOLOR_SATURATE_INK = 0.95

/** Below this half-width the nib is widened rather than dropped, same as the
 *  brush pen. Higher than its 0.5 because this tool's own width floor is 0.32
 *  of nominal: a wet brush has no hairline to protect, and a sub-pixel wash is
 *  not a thing that happens. */
const WATERCOLOR_MIN_HALF_WIDTH_PX = 0.75

/** Paper bites the rim as it does for the brush pen, and harder — a wash creeps
 *  along fibres far more than ink does, so its boundary is the most irregular
 *  of any tool here. Still rim-only by construction (the shader scales the term
 *  by 1 - coverage), so no value of this can put holes inside a wash. */
const WATERCOLOR_PAPER_EDGE = 0.55

/** ADR 011 §3.5 — the **cap** on how far the wash may leave the brush's own
 *  footprint, in canvas px. The engine scales the actual reach with the
 *  stroke's own radius and clamps it here (see _paintRibbonStroke).
 *
 *  This is the correction that matters most in v2. Everything else in this
 *  profile is texture; this is geometry. A marker's mark *is* the swept outline
 *  of its tip, and while a wash's boundary coincides exactly with where the
 *  brush travelled, no amount of mottling stops the eye reading
 *  "semi-transparent marker" — perfectly parallel sides and a perfectly clean
 *  turn give it away before any texture is even looked at.
 *
 *  Scales with brush size, unlike every other edge width in this engine, and
 *  the reason is physical rather than convenient: aaPx and the marker's ramp
 *  describe how a *tip* resolves against paper, which is a property of the tip.
 *  This describes how far a load of water travels before the paper stops it,
 *  and a big brush genuinely carries more water than a small one. A flat 7px
 *  was the first attempt and it was invisible — against a 140px wash that is a
 *  5% wobble, and the mark stayed exactly as clean as a marker's.
 *
 *  The shader spends this budget in *both* directions (see its
 *  blur-and-rethreshold block): the mark pushes out in some places and pulls in
 *  in others, which a plain dilation could not do. */
const WATERCOLOR_SPREAD_CAP_PX = 26.0

/** Floor, so even the thinnest line's boundary stops being mathematically
 *  exact. Below roughly this the blur cannot displace anything at all. */
const WATERCOLOR_SPREAD_MIN_PX = 2.5

/** Read by engine/index.ts's _paintRibbonStroke, which is where the stroke's
 *  own radius is known. Exported as a record rather than three constants so a
 *  caller cannot pick up two of the three and silently ignore the cap. */
export const WATERCOLOR_SPREAD = {
  cap: WATERCOLOR_SPREAD_CAP_PX,
  min: WATERCOLOR_SPREAD_MIN_PX,
}

/** #468 v4 — the profile is now a function of the stroke's own water/pigment
 *  mix rather than a constant, which is what turns this from a preset into a
 *  brush model. Everything below that is *not* derived from the mix is a
 *  property of the rasterizer or of paper, and stays fixed.
 *
 *  Built fresh per batch. That is a small object allocation on a path that
 *  already builds a whole ribbon geometry buffer, and it buys the one thing a
 *  shared constant cannot: two strokes with different mixes, live in the same
 *  room at the same time, rendering correctly. */
function watercolorRibbon(presetName: string | undefined): RibbonProfile {
  const mix = watercolorMixFromPreset(presetName)
  const w = watercolorWaterEffects(mix.water)
  const p = watercolorPigmentEffects(mix.pigment)
  // (#468 v5) The paint itself. `mix.pigment` is *how much* paint; this is
  // *which* paint, and they multiply: a lot of a smooth phthalo green still
  // grains far less than a little cobalt.
  const paint = watercolorPigmentByCode(watercolorPigmentFromPreset(presetName))
  return {
    nibShape: 'ellipse',
    cornerFraction: 0,
    aaPx: WATERCOLOR_EDGE_AA_PX,
    // Unlike the brush pen, this tool very much does have a per-pixel pigment
    // quantity — how much paint the brush left at each spot is what the wash's
    // density is made of, and it must be separate from the silhouette for the
    // same reason the marker's is (see RibbonProfile.ink).
    ink: true,
    // Nearly flat across the nib. The brush's own rim falloff would fight the
    // wet-edge term, which is trying to make the boundary *darker*; a real
    // loaded brush lays a fairly even film anyway, and what unevenness a wash
    // has comes from the paper, not from the ferrule.
    inkEdgeFalloff: 0.95,
    compositeInkMode: 9,
    curvatureTolerancePx: MARKER_CURVATURE_TOLERANCE_PX,
    minHalfWidthPx: WATERCOLOR_MIN_HALF_WIDTH_PX,
    paperEdge: WATERCOLOR_PAPER_EDGE,
    wetEdgeRadiusPx: WATERCOLOR_WET_EDGE_RADIUS_PX,
    spreadPx: WATERCOLOR_SPREAD_CAP_PX,
    saturateInk: WATERCOLOR_SATURATE_INK,
    normalizeDeposit: true,
    waterDepletion: true,
    // ── from water: geometry and behaviour ──
    waterLevel: mix.water,
    pigmentLevel: mix.pigment,
    // The paint's own readiness to travel through wet paper, on top of how
    // much water there is to carry it. Centred so a mid-diffusion paint leaves
    // the water setting alone.
    spreadOfRadius: w.spreadOfRadius * (0.6 + 0.8 * paint.diffusion),
    cloud: w.cloud,
    edgeSoftMax: w.edgeSoftMax,
    tideLo: w.tideLo,
    tideHi: w.tideHi,
    dryContact: w.dryContact,
    // ── from pigment: how much paint ──
    granulation: p.granulation * (0.25 + 1.5 * paint.granulation),
    pigmentOpacity: paint.opacity,
    depositPerRadius: p.depositPerRadius,
    // A staining paint binds to the fibre and cannot migrate to the drying
    // perimeter, so it leaves *less* of a rim — the reduction is the point, not
    // a fudge factor.
    wetEdge: p.wetEdge * (1 - 0.6 * paint.staining),
  }
}

/** Which tools the ribbon rasterizer draws. Every other tool goes through the
 *  ordinary per-dab stamp path, unchanged. */
export function isRibbonTool(tool: ToolType): boolean {
  return tool === 'marker' || tool === 'brushPen' || tool === 'watercolor'
}

/** #468 — whether this tool's composite needs the deferred settle pass that
 *  runs once over the whole stroke's bounds at pen-up (engine's
 *  _settleRibbonStroke). Keyed off wetEdge rather than off the tool name
 *  because the settle exists *for* that term: the wet edge is a property of the
 *  finished silhouette, and no batch painted while the stroke is still growing
 *  knows where the finished boundary will be. */
export function ribbonNeedsSettle(profile: RibbonProfile): boolean {
  return profile.wetEdge > 0
}

export function ribbonProfileFor(tool: ToolType, presetName: string | undefined): RibbonProfile {
  if (tool === 'watercolor') return watercolorRibbon(presetName)
  if (tool === 'brushPen') return BRUSH_PEN_RIBBON
  return markerNibFromPreset(presetName) === 'chisel' ? MARKER_CHISEL_RIBBON : MARKER_BULLET_RIBBON
}
