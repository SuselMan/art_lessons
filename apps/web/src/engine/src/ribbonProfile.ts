import type { ToolType } from '@grafetto/shared'

import { markerNibFromPreset } from './markerPresets'
import {
  watercolorMixFromPreset, watercolorNibFromPreset, watercolorWaterEffects, watercolorPigmentEffects,
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
  /** #468 v8 — the direction the stroke set off in, as a unit vector (ADR 011
   *  §8). Read only by the dry-brush term, which stretches its bristle field
   *  along it: a nearly dry round brush leaves *longitudinal* streaks, because
   *  the hairs group and separate along the travel, and a field that knows only
   *  the paper's relief reads as an aerosol instead.
   *
   *  Taken from the gesture's first segment and then fixed, so a live stroke
   *  and a replay of it agree — the same rule the dab spacing follows. A curve
   *  therefore keeps its opening direction throughout; a dry drag, which is
   *  what this term exists for, is near enough straight for that to hold. */
  strokeDir: [number, number]
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
  /** #468 v8 — how softly the boundary resolves (ADR 011 §8). Water's number
   *  outright, not a ceiling for noise to pick under: choosing a hard or a soft
   *  edge has to be something the hand does, not something a field decides. */
  edgeSoft: number
  /** #468 v8 — how far the boundary may wander off the brush's own outline, as
   *  a fraction of the blur it is thresholded against. Dry paint goes where it
   *  is put; a flood finds its own shape. */
  edgeWander: number
  /** #468 v4 — the band the tideline's gating field is thresholded against.
   *  Low/high, and *inverted* with water on purpose: a dry mark has almost no
   *  perimeter carrying a rim, a wet one has most of it. */
  tideLo: number
  tideHi: number
  /** #468 v10 — what share of the ink dose the nib stamps carry; the ribbon
   *  bands carry the rest. 0 means "the legacy even split", which is what the
   *  marker keeps.
   *
   *  It matters because the two passes are not equally smooth. A stamp deposits
   *  a cone (see inkEdgeFalloff), so a stamp entering or leaving the set that
   *  covers a pixel contributes ~0 at the moment it does and the accumulated
   *  total barely moves. A band deposits flat across its quad, so the same
   *  entering and leaving is a step — and a pixel is covered by only about four
   *  of them, which is a visible ripple at exactly the dab spacing. That ripple
   *  is what a long straight stroke shows as a faint row of discs.
   *
   *  Giving the bands the smaller share cuts what they can ripple by. They
   *  cannot be dropped altogether: their whole reason for existing is that on a
   *  turn they reach places the stamps miss, and with no ink there the
   *  composite multiplies by nothing and the outside of the turn comes out
   *  bare. */
  stampInkShare: number
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
  /** #468 v11, ADR 011 §11 — how much of the pigment lying at a place one
   *  exchange with its neighbourhood may move, and how far.
   *
   *  0 switches the whole thing off, including the 52 texture reads it costs,
   *  which is what every other tool through this program gets.
   *
   *  A *rate*, not an amount. What actually moves is this times the pigment
   *  already there, so the operation redistributes paint instead of adding it —
   *  and that is the property the term exists for. The painted-on tideline it
   *  partly replaces multiplies brightness at the rim without taking that
   *  brightness from the middle, so a wash could grow a dark edge while its
   *  centre stayed exactly as dark as before. No real one does.
   *
   *  Not scaled by the pigment setting, for the reason depositPerRadius spells
   *  out at length: pigment already enters through how much of it is there to
   *  be moved, and a second route would make the control quadratic again. What
   *  does scale it is *which* paint — a staining one binds to the fibre and
   *  cannot travel, which is a property of the paint, not of how much of it
   *  went on. */
  migrate: number
  /** Reach as a fraction of the stroke's own radius, resolved to px against the
   *  gesture's first dab and capped — same shape as spreadOfRadius, and for the
   *  same reason: one number has to describe a 12px brush and a 120px one. */
  migrateOfRadius: number
  /** The wetness gate. Below `migrateLo` nothing migrates at all.
   *
   *  High and steep on purpose. A merely damp wash dries roughly where it was
   *  put, because the paint has nowhere to swim to — and the moment the model
   *  starts moving pigment at ordinary settings, every mark grows a dark rim
   *  and the tool is back to being a bag of recognisable effects. Edge
   *  deposition is what *very wet* looks like, so it is only what very wet
   *  does. */
  migrateLo: number
  migrateHi: number
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
  /** How strongly the paper's grain acts on the mark's *rim*, as a fraction of
   *  the edge ramp's own width. 0 disables it. The core is never touched at any
   *  value by either reader below: both scale the term by 1 - coverage, which
   *  is identically 0 inside the mark.
   *
   *  **The direction is the composite branch's own business, not this field's**,
   *  and the two current readers genuinely disagree — which is why this is named
   *  for the input (paper, at the rim) rather than for an effect:
   *
   *   - the **brush pen** (u_inkMode 8) reads it as *wicking outward*: ink is
   *     pulled into the absorbent low spots, so the visible edge reaches
   *     further where the paper drinks. #472 established that is the right
   *     reading for a liquid, and it is the one the liner's own wick (#452)
   *     already used.
   *   - **watercolor** (u_inkMode 9) reads it as *eating inward*: the low spots
   *     take a bite out of the rim.
   *
   *  Those cannot both be right about the same physics, and the second one is
   *  the older reading (it is what the brush pen shipped with in #454 and what
   *  watercolor copied from it in #468). Left alone here on purpose: #468 is a
   *  live experiment with its own edge machinery (wetEdge, granulation, tide
   *  lines), and flipping its rim term inside a merge would be changing someone
   *  else's tool by side effect. Worth resolving deliberately — see #472's
   *  handover note. */
  paperRim: number
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
  paperRim: 0,
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
  stampInkShare: 0,
  waterDepletion: false,
  // #468 v4 — the brush model's own four. Off, and the tools they belong to
  // have no use for them: a marker tip and a pen nib carry ink from a
  // reservoir, not a finite load of water with paint in it.
  waterLevel: 0,
  pigmentLevel: 0,
  pigmentOpacity: 0,
  spreadOfRadius: 0,
  strokeDir: [1, 0] as [number, number],
  dryContact: 0,
  edgeSoft: 0,
  edgeWander: 0,
  tideLo: 0,
  tideHi: 0,
  saturateInk: 0,
  migrate: 0,
  migrateOfRadius: 0,
  migrateLo: 0,
  migrateHi: 0,
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
  paperRim: BRUSH_PEN_PAPER_WICK,
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
  stampInkShare: 0,
  waterDepletion: false,
  // #468 v4 — the brush model's own four. Off, and the tools they belong to
  // have no use for them: a marker tip and a pen nib carry ink from a
  // reservoir, not a finite load of water with paint in it.
  waterLevel: 0,
  pigmentLevel: 0,
  pigmentOpacity: 0,
  spreadOfRadius: 0,
  strokeDir: [1, 0] as [number, number],
  dryContact: 0,
  edgeSoft: 0,
  edgeWander: 0,
  tideLo: 0,
  tideHi: 0,
  saturateInk: 0,
  migrate: 0,
  migrateOfRadius: 0,
  migrateLo: 0,
  migrateHi: 0,
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
 *  part of why v1's washes were so mechanically even.
 *
 *  #468 v11 — raised from 0.95 to 1.35, and the whole of §11 depends on it.
 *  The deposit buffer is eight-bit and tops out at 1.0, and an ordinary pass
 *  runs about twice that, so a wash's inside sat *above* the old curve's end:
 *  density evaluated to exactly 1 and could not go any higher. That is a
 *  ceiling, and a ceiling makes a rim impossible — pigment arriving somewhere
 *  already at 1 changes nothing, so no amount of transport could ever have
 *  shown. At 1.35 the same clamped deposit lands at about 0.83 and there is
 *  room above it for paint that migrated there to darken.
 *
 *  What it does *not* cost is the flat wash. The deposit still clamps, so the
 *  inside of a wash is still a flat number and still insensitive to how the
 *  deposit wobbles — the property v9 went to some trouble for. Measured: flat
 *  wash unevenness unchanged to the second decimal, graded wash unchanged in
 *  spread and step evenness, with WATERCOLOR_PRESET.opacity raised to keep the
 *  tone where it was. */
const WATERCOLOR_SATURATE_INK = 1.35

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
/** (#468 v6) A cone-profiled stamp lays exactly a third of what a flat one of
 *  the same peak lays: the mean of (1 - r/R) over a disc is
 *  integral of (1-p)*2p dp from 0 to 1 = 1/3. So switching the deposit to a
 *  cone (see inkEdgeFalloff) drops the whole tool's density threefold unless
 *  this puts it back. Written as its own constant rather than folded into the
 *  deposit figures so that the calibration those carry stays readable, and so
 *  that this is obviously a unit conversion rather than a taste decision. */
/** (#468 v10) How the ink dose splits between the nib stamps and the bands
 *  between them. See RibbonProfile.stampInkShare — the short version is that
 *  the stamps deposit a cone and ripple hardly at all, the bands deposit flat
 *  and ripple at the dab spacing, so the smooth pass should carry most of it. */
const WATERCOLOR_STAMP_INK_SHARE = 0.82

/** Converts the deposit from "per unit length of travel" to the scale the cone
 *  profile actually accumulates at, so the numbers in watercolorPigmentEffects
 *  stay readable. A single pass runs it roughly twice over the deposit buffer's
 *  own ceiling, which is deliberate: what makes a stroke's inside a flat film
 *  rather than a domed airbrush stripe is precisely that the accumulation tops
 *  out across the whole width and slopes only through the margin. Measured — at
 *  a quarter of this the cross-section came back a smooth dome, which is not
 *  what a loaded brush leaves. */
const WATERCOLOR_CONE_DEPOSIT_GAIN = 1.8

const WATERCOLOR_SPREAD_CAP_PX = 26.0

/** Floor, so even the thinnest line's boundary stops being mathematically
 *  exact. Below roughly this the blur cannot displace anything at all. */
const WATERCOLOR_SPREAD_MIN_PX = 2.5

/** Read by engine/index.ts's _paintRibbonStroke, which is where the stroke's
 *  own radius is known. Exported as a record rather than three constants so a
 *  caller cannot pick up two of the three and silently ignore the cap. */
/** #468 v11 — how far pigment travels in one exchange, as a fraction of the
 *  brush's own radius, and the px window that fraction is held inside.
 *
 *  The reach is what decides how wide the band of settled pigment comes out,
 *  because a single exchange moves paint exactly this far and no further. Just
 *  over half a radius puts the band inside the mark's own margin, where the
 *  film genuinely is thinner, rather than out in the spread fringe where there
 *  is no water to have carried anything.
 *
 *  Capped for the same reason the spread is: a very large brush would otherwise
 *  redistribute over a distance nobody reads as a rim. Floored so a small one
 *  still moves paint at all rather than exchanging with itself. */
const WATERCOLOR_MIGRATE_OF_RADIUS = 0.55
const WATERCOLOR_MIGRATE_MAX_PX = 20.0
const WATERCOLOR_MIGRATE_MIN_PX = 3.0

/** The share of the pigment present that one exchange may move.
 *
 *  Held below 1 so the operation can never take more paint out of a place than
 *  is there; the shader clamps as well, but a rate that needs the clamp is a
 *  rate that has stopped conserving. 0.55 was picked by measurement against the
 *  four exercises — see ADR 011 §11. */
const WATERCOLOR_MIGRATE_GAIN = 0.75

/** Where "wet enough for paint to swim" begins and where it is complete. */
const WATERCOLOR_MIGRATE_LO = 0.78
const WATERCOLOR_MIGRATE_HI = 1.0

/** Exported for the engine, which resolves the reach against the gesture's own
 *  first dab exactly as it does the spread's. */
export const WATERCOLOR_MIGRATION = {
  maxPx: WATERCOLOR_MIGRATE_MAX_PX,
  minPx: WATERCOLOR_MIGRATE_MIN_PX,
}

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
/** Softer than the marker chisel's 0.28: that number is a cut felt edge, and a
 *  brush's corners are hair. Top of the range #330's expert suggested (0.20 to
 *  0.35), uncalibrated like every other first-pass constant here. */
const WATERCOLOR_FLAT_CORNER_FRACTION = 0.35

function watercolorRibbon(presetName: string | undefined): RibbonProfile {
  const mix = watercolorMixFromPreset(presetName)
  const w = watercolorWaterEffects(mix.water)
  const p = watercolorPigmentEffects(mix.pigment)
  // (#468 v5) The paint itself. `mix.pigment` is *how much* paint; this is
  // *which* paint, and they multiply: a lot of a smooth phthalo green still
  // grains far less than a little cobalt.
  const paint = watercolorPigmentByCode(watercolorPigmentFromPreset(presetName))
  // #489: the nib's *body* in the ribbon, chosen separately from the geometry
  // of its contact patch — one says what silhouette the sweep has, the other
  // where the patch is and how big. A flat is a rounded box like the marker's
  // chisel, but softer-cornered: felt is cut, hair is not.
  const nib = watercolorNibFromPreset(presetName)
  return {
    nibShape: nib === 'chisel' ? 'roundedBox' : 'ellipse',
    cornerFraction: nib === 'chisel' ? WATERCOLOR_FLAT_CORNER_FRACTION : 0,
    aaPx: WATERCOLOR_EDGE_AA_PX,
    // Unlike the brush pen, this tool very much does have a per-pixel pigment
    // quantity — how much paint the brush left at each spot is what the wash's
    // density is made of, and it must be separate from the silhouette for the
    // same reason the marker's is (see RibbonProfile.ink).
    ink: true,
    // (#468 v6) A cone, not a cylinder — full dose at the nib's centre falling
    // to nothing at its rim. This is what removes the chain of discs, and the
    // reason is arithmetic rather than aesthetic.
    //
    // A pixel is covered by `2*radius / spacing` stamps, which for this brush is
    // about 4.03 — so as the brush travels, the count alternates between 4 and
    // 5. With a flat dose per stamp that is a 25% step in the accumulated
    // deposit, appearing exactly one dab-spacing apart: measured 163 against
    // 210 in the buffer, and 5/4 = 1.25 against the measured 1.28. That ripple
    // was invisible while the deposit saturated the 8-bit buffer everywhere and
    // came straight through once v3 normalized it.
    //
    // With a cone the stamp entering or leaving the count contributes ~0 at the
    // moment it does, so the sum barely moves — the standard partition-of-unity
    // answer to stamp banding. The marker keeps 0.9 because its deposit is
    // saturated anyway and its constants were calibrated against it.
    inkEdgeFalloff: 0.0,
    compositeInkMode: 9,
    curvatureTolerancePx: MARKER_CURVATURE_TOLERANCE_PX,
    minHalfWidthPx: WATERCOLOR_MIN_HALF_WIDTH_PX,
    paperRim: WATERCOLOR_PAPER_EDGE,
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
    edgeSoft: w.edgeSoft,
    edgeWander: w.edgeWander,
    tideLo: w.tideLo,
    tideHi: w.tideHi,
    strokeDir: [1, 0],
    dryContact: w.dryContact,
    // ── from pigment: how much paint ──
    granulation: p.granulation * (0.25 + 1.5 * paint.granulation),
    pigmentOpacity: paint.opacity,
    depositPerRadius: p.depositPerRadius * WATERCOLOR_CONE_DEPOSIT_GAIN,
    stampInkShare: WATERCOLOR_STAMP_INK_SHARE,
    // A staining paint binds to the fibre and cannot migrate to the drying
    // perimeter, so it leaves *less* of a rim — the reduction is the point, not
    // a fudge factor.
    wetEdge: p.wetEdge * (1 - 0.6 * paint.staining),
    // ── from the paint: whether it can travel at all (#468 v11) ──
    //
    // The same staining figure, and rather harder, because this is the real
    // mechanism the line above only imitates: a staining paint is one that has
    // already bound to the fibre by the time the water starts moving, so there
    // is nothing left loose for the water to carry. Diffusion is how readily it
    // moves once loose, so it belongs here too.
    // Zero outright below the gate rather than left to evaluate to nothing.
    // The shader's gate reads the water *left* at each place, which depletion
    // only ever lowers, so a stroke whose nominal setting is already under the
    // threshold cannot migrate anywhere — and a zero here skips sixty texture
    // reads per fragment instead of spending them on a result known in advance.
    // Measured at roughly half the composite's cost on a full-width band.
    migrate: mix.water <= WATERCOLOR_MIGRATE_LO
      ? 0
      : WATERCOLOR_MIGRATE_GAIN
        * (1 - 0.7 * paint.staining)
        * (0.6 + 0.8 * paint.diffusion),
    migrateOfRadius: WATERCOLOR_MIGRATE_OF_RADIUS,
    migrateLo: WATERCOLOR_MIGRATE_LO,
    migrateHi: WATERCOLOR_MIGRATE_HI,
  }
}

/** Which tools the ribbon rasterizer draws. Every other tool goes through the
 *  ordinary per-dab stamp path, unchanged. */
export function isRibbonTool(tool: ToolType): boolean {
  return tool === 'marker' || tool === 'brushPen' || tool === 'watercolor'
}

export function ribbonProfileFor(tool: ToolType, presetName: string | undefined): RibbonProfile {
  if (tool === 'watercolor') return watercolorRibbon(presetName)
  if (tool === 'brushPen') return BRUSH_PEN_RIBBON
  return markerNibFromPreset(presetName) === 'chisel' ? MARKER_CHISEL_RIBBON : MARKER_BULLET_RIBBON
}
