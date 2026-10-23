/** Immutable rendering data shared by built-in brushes, importers and room clients. */
export type AssetId = `asset:${string}`
export type TipMaskId = 'chalk' | 'rough' | 'bristle' | 'speckle' | 'grass' | 'leaf' | 'clumps' | AssetId
export type BrushTextureId = 'dry' | 'grit' | 'cloud' | AssetId

/** Control points in x order, x in 0..1, y unbounded above 0. At least two. */
export type BrushCurve = readonly (readonly [x: number, y: number])[]

/** How the footprint is oriented in the world.
 *
 *  Not a free angle function, deliberately: these are the answers that mean
 *  something to a painter, and each is a different *frame* (ADR 012 §3 makes
 *  the same distinction for the marker's chisel). A round tip ignores all of
 *  them, which is why the field can be there from day one at no cost. */
export type TipRotation =
  /** Anchored to the canvas — a flat brush held at one angle, the way a
   *  calligrapher holds a chisel. The mark is wide across the travel and thin
   *  along it, which is the whole expressive range of a flat brush. Also what a
   *  stamp that must stay upright (a grass clump) wants. */
  | 'fixed'
  /** Swings to follow the stroke, unless the pen is tilted, in which case the
   *  pen's own azimuth wins (tiltOrPathAngle). Right for a round tip, where the
   *  angle only matters for the shape of an elongated one. */
  | 'path'
  /** (#573) Follows the direction of travel and nothing else. A bristle tip's
   *  hairs have to sit *across* the stroke for each to drag its own streak, and
   *  letting pen tilt turn them would line them up along it — one streak. */
  | 'travel'

export interface BrushTip {
  /** 'round' is the procedural radial ramp. 'bitmap' (#573) is a mask sampled
   *  per stamp (tipMasks.ts), which is what turns the set from a row of round
   *  brushes into a library. */
  kind: 'round' | 'bitmap'
  /** Which mask, when kind is 'bitmap'. */
  mask?: TipMaskId
  /** 0 = a gradient with no edge at all, 1 = a disc. Feeds the round stamp's
   *  profile, and also dabSpacing's footprint rule — a hard-edged stamp has to
   *  be laid denser or the mark reads as a row of discs (#478). A bitmap tip's
   *  edge is in its picture; there it only feeds the spacing rule. */
  hardness: number
  /** Long axis / short axis. 1 = round. Above 1 the tip is flat, and what the
   *  stroke's width does then is decided by `rotation`. */
  aspect: number
  rotation: TipRotation
  /** World angle of the long axis, radians, read only when rotation is 'fixed'.
   *  Canvas-anchored rather than screen-anchored, so rotating the viewport does
   *  not rotate the brush — see DabShapingProfile.angle on why the frame has to
   *  be named rather than assumed. */
  angle: number
}

/** How one recorded dab becomes several stamps, and how much each stamp is
 *  allowed to differ from the dab it came from.
 *
 *  Every value is a *spread*, never a direction, and every draw comes out of
 *  brushDabRandom seeded by the dab itself (see brushDabSeed) — so the teacher's
 *  splatter lands on the student's screen drop for drop. None of it is
 *  recorded: the dab is, and the stamps are a pure function of it. */
export interface BrushScatter {
  /** Stamps per dab. */
  count: number
  /** How far a stamp may land from the dab, as a fraction of the dab's
   *  diameter. 0 stamps on the path. */
  radius: number
  /** Each stamp's size as a fraction of the dab's — a splatter is a spray of
   *  drops much smaller than the area it covers. 1 = the dab's own size. */
  scale: number
  /** 0..1 — how much smaller than `scale` a stamp may randomly come out. */
  sizeJitter: number
  /** 0..1 of a full turn a stamp may be rotated by at random. 1 spins it
   *  freely, which is what keeps a textured tip from printing the same picture
   *  in a visible row. */
  angleJitter: number
  /** 0..1 — how much lighter than full a stamp may randomly come out. */
  flowJitter: number
}

/** Rows of the brush picker, in display order (#573). A property of the brush
 *  rather than a table in the UI, so a brush cannot be added without deciding
 *  where it goes. */
export type BrushCategory = 'line' | 'paint' | 'wet' | 'soft' | 'texture' | 'scatter'

/** Which renderer a brush goes through.
 *
 *  - `ribbon`: v1's path, the ribbon machinery's coverage stamp (DAB_FRAG's
 *    u_inkMode=10) with flow driven by pressure. Kept, unchanged, only so that
 *    strokes recorded with a `@1` token of the original six brushes replay
 *    exactly as drawn — no brush in the current set uses it (ADR 013 §7).
 *  - `stamp`: the brush's own stamp and composite programs (#573) — bitmap
 *    tips, scatter, paper tooth, screentone, and pressure acting on opacity as
 *    a real ceiling rather than on flow.
 *  - `mixer`: the smudge tool's carried imprint with the brush's own colour
 *    loaded into it (#573) — a brush that paints and picks up what it paints
 *    over. See digitalBrushMixer. */
export type BrushModel = 'ribbon' | 'stamp' | 'mixer'

export interface BrushDescriptor {
  /** Stable across versions — it is half of the recorded preset token. */
  id: string
  /** Bumped by **any** edit that changes a pixel. See ADR 013 §7: the token a
   *  stroke records carries this, so improving a brush never repaints the
   *  strokes already drawn with it — the old version keeps resolving to the old
   *  numbers forever, and new strokes record the new one.
   *
   *  This is the same permanence rule `dabs`/`dabsPacked` follow in
   *  StrokeOperation, and it is the whole reason the token is not just an id. */
  version: number
  model: BrushModel
  category: BrushCategory
  /** The shape of one imprint. See BrushTip — and note that this is the only
   *  field here that describes the *mark*; everything else describes behaviour. */
  tip: BrushTip
  /** How strongly the paper's own relief breaks this brush's contact with it,
   *  0..1. A property of the **preset**, not of the tool, and that correction
   *  came out of the design review: v1's ADR said "a digital brush does not
   *  touch paper, full stop", which is right for Hard Round and wrong for the
   *  whole Dry/Rough family, where the sheet's tooth *is* the mechanism of the
   *  texture. Grafetto has a real height-mapped paper, so declining to use it
   *  would be throwing away the one thing we have that Procreate does not.
   *
   *  Read by the `stamp` model only; pressure pushes the mark into the tooth,
   *  the way a pastel stick is pushed into a sheet. */
  paperInteraction: number
  /** Step between stamps as a fraction of the footprint's diameter. Smaller
   *  than the engine's 0.22 default for every continuous brush here: that
   *  number was calibrated for tools whose dabs blend through paper grain, and
   *  a soft digital stamp shows its own ripple much sooner. Larger for a
   *  scatter brush, whose dabs are places to throw stamps from rather than a
   *  line being traced. */
  spacing: number
  /** How much **one full pass of the brush** lays down — 1 is a solid mark
   *  from a single stroke, 0.3 needs three or four passes to get there.
   *
   *  Per *pass*, not per stamp, when `flowPer` is 'pass' (every continuous
   *  brush): stamps sit a twentieth of the footprint apart, so ~20 of them
   *  cover any given pixel in one pass, and read as a per-stamp amount even
   *  0.12 accumulated to 0.92. The engine converts this to a per-stamp value
   *  against the distance actually travelled, which also makes the density
   *  independent of how fast the stroke was drawn.
   *
   *  Kept strictly apart from opacity, which the composite applies once to the
   *  finished silhouette. Collapsing the two is precisely what makes a
   *  hand-rolled digital brush darken at every self-crossing; see ADR 013 §3. */
  flow: number
  /** (#573) 'pass' for a continuous brush (see `flow`); 'stamp' for a scatter
   *  brush, whose stamps are separate marks — a splatter drop is as dark as
   *  its flow says, however far apart the dabs that threw it were. */
  flowPer: 'pass' | 'stamp'
  /** (#573) The width, as a fraction of the dab's diameter, that one pass is
   *  measured across when `flowPer` is 'pass'. 1 for a tip that fills its
   *  footprint. A bristle tip's footprint is mostly empty: each hair is a
   *  twentieth of the brush across, so a pixel under a hair is crossed by a
   *  twentieth as many stamps as the whole-brush reading assumes, and the
   *  streaks came out at a twentieth of the flow asked for. */
  flowSpan?: number
  /** Multiplier on the size slider, per dab, as a function of pressure.
   *  Switched off by the tool's "pressure changes size" setting. */
  sizeByPressure: BrushCurve
  /** `ribbon` model only: multiplier on `flow` as a function of pressure. */
  flowByPressure: BrushCurve
  /** `stamp` and `mixer` models (#573): the stroke's opacity *ceiling* as a
   *  function of pressure — the Photoshop/Krita sense of pressure→opacity, not
   *  flow. Going back over the stroke's own tail at the same light pressure
   *  cannot darken it past this; pressing harder can. Switched off by the
   *  tool's "pressure changes opacity" setting, which pins it at 1. */
  opacityByPressure: BrushCurve
  /** Distance, world px, over which the pressure low-pass reaches ~63% of a new
   *  reading. Digital brushes track pressure closely enough for a tablet's own
   *  noise to show, exactly as the brush pen does (#454) — and for the same
   *  reason this is a distance rather than a per-sample weight (#472): a weight
   *  makes the filter's cutoff the digitiser's report rate, so the same gesture
   *  comes out differently on a 60 Hz and a 240 Hz stylus. */
  pressureSmoothingPx: number
  /** Stroke opacity this brush is authored at, before the user's own slider. */
  opacity: number
  /** (#573) Several stamps per dab, each jittered. Absent = one stamp exactly
   *  on the dab. */
  scatter?: BrushScatter
  /** (#573) The brush's own grain, anchored to the canvas rather than to the
   *  stamp — see tipMasks.ts on why only that survives the overlap of a
   *  continuous stroke. `periodPx` is the world size of one tile of it. */
  texture?: { id: BrushTextureId; periodPx: number; strength: number }
  /** (#579) How the finished stroke is rendered like wet media — the digital
   *  watercolor family, built the way Procreate builds its own: from the
   *  stroke's coverage and a few render settings, with no fluid anywhere. The
   *  physical watercolor tool (ADR 011) is a separate thing and stays one.
   *
   *  All four act in the composite, on the finished coverage, so none of them
   *  is erased by stamps overlapping — the reason tone effects cannot live in
   *  the tip (see tipMasks.ts on brush textures). */
  wet?: {
    /** 0..1 — pigment pulled to the rim: the interior lightens, the edge
     *  keeps its full tone. Procreate's "Wet edges". */
    edge: number
    /** 0..1 — blooms: tone varied by a large canvas-anchored cloud texture. */
    mottle: number
    /** 0..1 — pigment settling into a fine grain. */
    granulation: number
    /** Multiply with what is already on the layer instead of covering it,
     *  so strokes darken where they overlap — a transparent glaze. */
    glaze: boolean
    /** (#581) Which renderer: 1 = #579's (tone by coverage), frozen for the
     *  strokes already drawn with it; 2 = density through a power on the
     *  colour's transmittance, with the two-scale edge, blooms, paper
     *  granulation and feathering. Absent means 1. */
    model?: 1 | 2
    /** (#581) 0..1 — backruns: lighter patches with dark branching borders. */
    bloom?: number
    /** (#581) 0..1 — wet-in-wet: the rim dissolves into a feathered fringe. */
    feather?: number
  }
  /** (#573) Halftone pitch, world px — the composite turns the stroke's tone
   *  into dots of a fixed screen instead of a continuous fill. World-anchored,
   *  so two strokes of tone line up into one screen the way two pieces of
   *  screentone film cut from one sheet do. */
  screentonePx?: number
  /** (#573) `mixer` model only. */
  mixer?: {
    /** How much of the brush's own colour is folded back into what it carries
     *  per radius travelled. 1 = never picks anything up (a plain brush); low =
     *  mostly drags what is already on the canvas. */
    load: number
    /** How much of what is under the brush it picks up per radius
     *  travelled. Together with `load` this sets how far a colour is dragged:
     *  the carried paint forgets at `pickup + load` per radius. */
    pickup: number
    /** How strongly the carried paint is laid down per radius travelled. */
    strength: number
  }
}

export interface ImportedBrush {
  descriptor: BrushDescriptor
  name: string
  source: string
  warnings: string[]
}
export interface BrushAsset { id: AssetId; size: number; file: string }
export interface BrushLibrary {
  schemaVersion: 1
  brushes: ImportedBrush[]
  assets: BrushAsset[]
  skipped: { name: string; reasons: string[] }[]
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function numberIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}
function curve(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 2 || value.length > 32) return false
  let last = -1
  return value.every(p => {
    if (!Array.isArray(p) || p.length !== 2 || !numberIn(p[0], 0, 1) || !numberIn(p[1], 0, 2) || p[0] < last) return false
    last = p[0]
    return true
  })
}
const ASSET = /^asset:[a-f0-9]{64}$/
/** Validate untrusted conversion output at both ends of the wire. Imported
 * presets currently target the stamp model, with explicit conversion warnings. */
export function isBrushLibrary(value: unknown): value is BrushLibrary {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.assets) || !Array.isArray(value.brushes)
    || !Array.isArray(value.skipped) || value.brushes.length > 512 || value.assets.length > 1024) return false
  const ids = new Set<string>()
  let bytes = 0
  for (const a of value.assets) {
    if (!record(a) || typeof a.id !== 'string' || !ASSET.test(a.id) || ids.has(a.id)
      || !numberIn(a.size, 2, 2048) || !Number.isInteger(a.size) || (a.size & (a.size - 1)) !== 0
      || a.file !== `${a.id.slice(6)}.bin`) return false
    ids.add(a.id); bytes += a.size * a.size
  }
  if (bytes > 256 * 1024 * 1024) return false
  const keys = new Set<string>()
  const ref = (id: unknown): boolean => typeof id === 'string' && ids.has(id)
  for (const b of value.brushes) {
    if (!record(b) || typeof b.name !== 'string' || b.name.length > 256 || typeof b.source !== 'string' || b.source.length > 256
      || !Array.isArray(b.warnings) || b.warnings.length > 100 || !b.warnings.every(w => typeof w === 'string' && w.length <= 2000)
      || !record(b.descriptor)) return false
    const d = b.descriptor
    const descriptorKeys = ['id','version','model','category','tip','paperInteraction','spacing','flow','flowPer','flowSpan','sizeByPressure','flowByPressure','opacityByPressure','pressureSmoothingPx','opacity','scatter','texture','wet']
    if (Object.keys(d).some(key => !descriptorKeys.includes(key))) return false
    if (typeof d.id !== 'string' || !/^imported-[a-f0-9]{16,64}$/.test(d.id) || !numberIn(d.version, 1, 10000)
      || !Number.isInteger(d.version) || d.model !== 'stamp' || !['line','paint','wet','soft','texture','scatter'].includes(String(d.category))
      || !record(d.tip) || !['round','bitmap'].includes(String(d.tip.kind))
      || ((d.tip.kind === 'bitmap' || d.tip.mask !== undefined) && !ref(d.tip.mask))
      || !numberIn(d.tip.hardness, 0, 1) || !numberIn(d.tip.aspect, 1, 16) || !numberIn(d.tip.angle, -Math.PI * 2, Math.PI * 2)
      || !['fixed','path','travel'].includes(String(d.tip.rotation))
      || !numberIn(d.paperInteraction, 0, 1) || !numberIn(d.spacing, 0.01, 2) || !numberIn(d.flow, 0, 1)
      || !['pass','stamp'].includes(String(d.flowPer)) || !numberIn(d.opacity, 0, 1)
      || !numberIn(d.pressureSmoothingPx, 0, 100) || !curve(d.sizeByPressure) || !curve(d.flowByPressure) || !curve(d.opacityByPressure)) return false
    const key = `${d.id}@${d.version}`
    if (keys.has(key)) return false
    keys.add(key)
    if (d.flowSpan !== undefined && !numberIn(d.flowSpan, 0.01, 1)) return false
    if (d.texture !== undefined && (!record(d.texture) || !ref(d.texture.id)
      || !numberIn(d.texture.periodPx, 1, 8192) || !numberIn(d.texture.strength, 0, 1))) return false
    if (d.scatter !== undefined && (!record(d.scatter) || !numberIn(d.scatter.count, 1, 32) || !Number.isInteger(d.scatter.count)
      || !numberIn(d.scatter.radius, 0, 4) || !numberIn(d.scatter.scale, 0.01, 2)
      || !numberIn(d.scatter.sizeJitter, 0, 1) || !numberIn(d.scatter.angleJitter, 0, 1) || !numberIn(d.scatter.flowJitter, 0, 1))) return false
    if (d.wet !== undefined && (!record(d.wet) || !numberIn(d.wet.edge, 0, 1) || !numberIn(d.wet.mottle, 0, 1)
      || !numberIn(d.wet.granulation, 0, 1) || typeof d.wet.glaze !== 'boolean'
      || (d.wet.model !== undefined && d.wet.model !== 1 && d.wet.model !== 2)
      || (d.wet.bloom !== undefined && !numberIn(d.wet.bloom, 0, 1)) || (d.wet.feather !== undefined && !numberIn(d.wet.feather, 0, 1)))) return false
    if (d.mixer !== undefined || d.screentonePx !== undefined) return false
  }
  return value.skipped.length <= 1024 && value.skipped.every(s => record(s) && typeof s.name === 'string' && s.name.length <= 256
    && Array.isArray(s.reasons) && s.reasons.length <= 100 && s.reasons.every(r => typeof r === 'string' && r.length <= 2000))
}
