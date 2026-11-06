import {isBrushCurveTrace,type BrushCurveTrace}from'./brushCurveTrace.js'
export type {BrushCurveTrace}from'./brushCurveTrace.js'
import {isBrushBristle,type BrushBristle} from './brushBristle.js'
export type {BrushBristle} from './brushBristle.js'
import {isBrushSketch,type BrushSketch} from './brushSketch.js'
export type {BrushSketch} from './brushSketch.js'
import { isBrushSpray, type BrushSpray } from './brushSpray.js'
export type { BrushSpray } from './brushSpray.js'
import { isDabSourceTime } from './dabCodec.js'
import { isBrushCurve as curve, type BrushCurve } from './brushCurves.js'
export type { BrushCurve } from './brushCurves.js'
import { isBrushBehavior, type BrushBehavior, type BrushCompatibility, type BrushDynamic } from './brushBehavior.js'
/** Immutable rendering data shared by built-in brushes, importers and room clients. */
export type AssetId = `asset:${string}`
export type TipMaskId = 'chalk' | 'rough' | 'bristle' | 'speckle' | 'grass' | 'leaf' | 'clumps' | AssetId
export type BrushTextureId = 'dry' | 'grit' | 'cloud' | AssetId

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
  /** Legacy round ramp, sampled bitmap, or an explicit mathematical profile.
   * Existing round Gaussian descriptors retain their immutable renderer path. */
  kind: 'round' | 'bitmap' | 'procedural'
  /** Which mask, when kind is 'bitmap'. */
  mask?: TipMaskId
  /** Sample this square inside the padded asset, retaining the source tip size. */
  maskBounds?: { x: number; y: number; width: number; height: number }
  /** Explicit integer source grid for an opaque grayscale image pyramid.
   * Stored bytes are inverse gray coverage; resize brightness before inversion.
   * Absence preserves the recorded padded-POT/trilinear sampler. The rectangle
   * addresses actual source texels, independently of the square drawing crop. */
  imageSampling?: {
    kind: 'integer-pyramid'
    signal: 'inverse-gray'
    sourceRect: { x: number; y: number; width: number; height: number }
  }
  /** Standard axial masks work with stamp and mixer; Gaussian remains stamp-only.
   * Absence preserves legacy round/bitmap sampling. */
  profile?: { kind: 'gaussian'; fade: number; antialias: boolean }
    | { kind: 'standard'; shape: 'ellipse' | 'rectangle'; horizontalFade: number; verticalFade: number; antialias: boolean }
    /** Opaque core plus a one-pixel outward band linear in squared distance. */
    | { kind: 'circleBand'; antialias: true }
    /** Native radial response table, UNORM32 big-endian words in CAS bytes. */
    | { kind: 'radialCurve'; lookup: AssetId; resolution: number; encoding: 'unorm32be'; antialias: false }
  /** Quantized mask operation before texture, flow and opacity. */
  alphaThreshold?: { value: number; softness: number }
  /** Equal-size image-pipe frames; one selection per logical dab, before scatter. */
  animation?: { mode: 'random' | 'incremental'; frames: AssetId[] }
  /** Straight adjusted-gray CAS plane paired with mask alpha; frame indices are shared. */
  material?: { kind: 'lightness'; gray: AssetId; grayFrames?: AssetId[]; strength: number }
  /** RGB planes or adjusted gray for a captured gradient, paired with mask alpha. */
  color?: { planes: [AssetId, AssetId, AssetId]; frames?: [AssetId, AssetId, AssetId][] }
    | {gradient:{gray:AssetId;grayFrames?:AssetId[]}}
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

/** Independent foreground colour rate and its sensor responses. */
export interface BrushForegroundRate {rate:number;dynamics?:BrushDynamic[]}
/** A gradient variant omits the outer rate, so older validators reject it. */
export type BrushForeground=BrushForegroundRate|{gradient:BrushForegroundRate & {value:number;positionDynamics?:BrushDynamic[]}}
export function brushForegroundRate(foreground:BrushForeground|undefined):BrushForegroundRate|undefined {
 return foreground && 'gradient' in foreground ? foreground.gradient : foreground
}
export function brushUsesGradient(brush:BrushDescriptor):boolean {
 return !!brush.tip.color && 'gradient' in brush.tip.color || !!brush.mixer?.foreground && 'gradient' in brush.mixer.foreground
}
export function brushTipColorPlanes(tip:BrushTip,index=0):readonly [AssetId,AssetId,AssetId]|undefined {
 const color=tip.color
 if(!color)return undefined
 if('gradient' in color){const gray=color.gradient.grayFrames?.[index] ?? color.gradient.gray;return[gray,gray,gray]}
 return color.frames?.[index] ?? color.planes
}
function isBrushForeground(value:unknown):boolean {
 if(!record(value))return false
 const gradient='gradient' in value
 if(gradient && (Object.keys(value).length!==1 || !record(value.gradient)))return false
 const rate=gradient ? value.gradient : value
 if(!record(rate)||!numberIn(rate.rate,0,1))return false
 if(Object.keys(rate).some(key=>!(gradient ? ['rate','dynamics','value','positionDynamics'] : ['rate','dynamics']).includes(key)))return false
 if(rate.dynamics!==undefined&&!isBrushBehavior({version:2,modulations:{flow:rate.dynamics}}))return false
 return !gradient || numberIn(rate.value,0,1) && (rate.positionDynamics===undefined||isBrushBehavior({version:2,modulations:{flow:rate.positionDynamics}}))
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
  behavior?: BrushBehavior
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
  curveTrace?:BrushCurveTrace
  bristle?:BrushBristle
  sketch?:BrushSketch
  spray?: BrushSpray
  scatter?: BrushScatter
  /** (#573) The brush's own grain, anchored to the canvas rather than to the
   *  stamp — see tipMasks.ts on why only that survives the overlap of a
   *  continuous stroke. `periodPx` is the world size of one tile of it. */
  texture?: {
    id: BrushTextureId; periodPx: number; strength: number
    /** Explicit operation on the dab mask; absent preserves historical grain. */
    application?: { mode: 'multiply' | 'subtract'; soft: boolean }
    /** Integer repeat grid at the top-left of its padded square asset. */
    patternSize?: { width: number; height: number }
    /** Canvas phase in world pixels; random axes are selected once per gesture. */
    offset?: { x: number; y: number; randomX: boolean; randomY: boolean }
  }
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
    /** Foreground fraction at contact; absent preserves the historical .85 prime. */
    initialLoad?: number
    /** How much of what is under the brush it picks up per radius
     *  travelled. Together with `load` this sets how far a colour is dragged:
     *  the carried paint forgets at `pickup + load` per radius. */
    pickup: number
    /** Include transparent canvas pixels in pickup; absent preserves opaque pickup. */
    smearAlpha?: boolean
    /** Sample the previous placed dab's canvas neighbourhood instead of a reservoir. */
    source?: 'previousCanvas'|'projectionCanvas'
    /** New mask strategy: feedback composition precedes foreground and mask. */
    algorithm?: 'krita-mask' | 'krita-stamp'
    /** Uniform previous-canvas area mean. Fixed64 sample cap. */
    sampling?: { mode: 'uniformMean' | 'adaptiveMean' | 'maskMean'; radius: number; radiusDynamics?: BrushDynamic[] }
    /** Source-over foreground added to sampled canvas before masked transfer.
     * Rate and its input responses multiply effective dab opacity once here;
     * transfer independently applies pickup and effective opacity. No reservoir. */
    foreground?: BrushForeground
    /** LIGHTNESSMAP stores unshaded colour and accumulated height per tile. */
    paintThickness?: {value:number;mode:'overlay'|'overwrite';dynamics?:BrushDynamic[]}
    /** Multiplicative input responses for the pickup/transfer amount. */
    pickupDynamics?: BrushDynamic[]
    /** How strongly the carried paint is laid down per radius travelled. */
    strength: number
  }
}

export interface ImportedBrush {
  descriptor: BrushDescriptor
  name: string
  source: string
  /** Original author artwork, sanitized PNG at most 128px; display only. */
  preview?: string
  /** Source editor defaults; opacity/flow already contribute to descriptor rendering. */
  sourceDefaults?: { sizePx: number; opacity: number; flow: number }
  warnings: string[]
  compatibility?: BrushCompatibility[]
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
const ASSET = /^asset:[a-f0-9]{64}$/
/** Validate untrusted conversion output at both ends of the wire. Imported
 * presets currently target the stamp model, with explicit conversion warnings. */
/** PNG display payloads never become brush resources or execution inputs. */
function isBrushPreview(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 90022 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return false
  try {
    const bytes = atob(value.slice(22))
    if (bytes.slice(0, 8) !== '\x89PNG\r\n\x1a\n' || bytes.slice(12, 16) !== 'IHDR') return false
    const dimension = (offset: number) => Array.from(bytes.slice(offset, offset + 4)).reduce((n, c) => n * 256 + c.charCodeAt(0), 0)
    return bytes.length >= 33 && dimension(16) > 0 && dimension(16) <= 128 && dimension(20) > 0 && dimension(20) <= 128
  } catch { return false }
}

export function isBrushLibrary(value: unknown, limits: { maxBytes?: number; maxBrushes?: number; maxAssets?: number } = {}): value is BrushLibrary {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.assets) || !Array.isArray(value.brushes)
    || !Array.isArray(value.skipped) || value.brushes.length > (limits.maxBrushes ?? 512) || value.assets.length > (limits.maxAssets ?? 1024)) return false
  const ids = new Set<string>()
  const assetSizes = new Map<string, number>()
  let bytes = 0
  for (const a of value.assets) {
    if (!record(a) || typeof a.id !== 'string' || !ASSET.test(a.id) || ids.has(a.id)
      || !numberIn(a.size, 2, 2048) || !Number.isInteger(a.size) || (a.size & (a.size - 1)) !== 0
      || a.file !== `${a.id.slice(6)}.bin`) return false
    ids.add(a.id); assetSizes.set(a.id, a.size); bytes += a.size * a.size
  }
  if (bytes > (limits.maxBytes ?? 256 * 1024 * 1024)) return false
  const keys = new Set<string>()
  const ref = (id: unknown): boolean => typeof id === 'string' && ids.has(id)
  for (const b of value.brushes) {
    if (!record(b) || typeof b.name !== 'string' || b.name.length > 256 || typeof b.source !== 'string' || b.source.length > 256
      || !Array.isArray(b.warnings) || b.warnings.length > 100 || !b.warnings.every(w => typeof w === 'string' && w.length <= 2000)
      || !record(b.descriptor)) return false
    if (b.sourceDefaults !== undefined && (!record(b.sourceDefaults)
      || Object.keys(b.sourceDefaults).some(key => !['sizePx','opacity','flow'].includes(key))
      || !numberIn(b.sourceDefaults.sizePx, 0.01, 10000)
      || !numberIn(b.sourceDefaults.opacity, 0, 1) || !numberIn(b.sourceDefaults.flow, 0, 1))) return false
    if (b.preview !== undefined && !isBrushPreview(b.preview)) return false
    const d = b.descriptor
    const descriptorKeys = ['id','version','model','category','tip','paperInteraction','spacing','flow','flowPer','flowSpan','sizeByPressure','flowByPressure','opacityByPressure','pressureSmoothingPx','opacity','scatter','texture','wet','behavior','mixer','spray','sketch','bristle','curveTrace']
    if (Object.keys(d).some(key => !descriptorKeys.includes(key))) return false
    if (typeof d.id !== 'string' || !/^imported-[a-f0-9]{16,64}$/.test(d.id) || !numberIn(d.version, 1, 10000)
      || !Number.isInteger(d.version) || !['stamp','mixer'].includes(String(d.model)) || !['line','paint','wet','soft','texture','scatter'].includes(String(d.category))
      || !record(d.tip) || !['round','bitmap','procedural'].includes(String(d.tip.kind))
      || ((d.tip.kind === 'bitmap' || d.tip.mask !== undefined) && !ref(d.tip.mask))
      || !numberIn(d.tip.hardness, 0, 1) || !numberIn(d.tip.aspect, 1, 16) || !numberIn(d.tip.angle, -Math.PI * 2, Math.PI * 2)
      || !['fixed','path','travel'].includes(String(d.tip.rotation))
      || !numberIn(d.paperInteraction, 0, 1) || !numberIn(d.spacing, 0.000001, 2) || !numberIn(d.flow, 0, 1)
      || !['pass','stamp'].includes(String(d.flowPer)) || !numberIn(d.opacity, 0, 1)
      || !numberIn(d.pressureSmoothingPx, 0, 100) || !curve(d.sizeByPressure, 8) || !curve(d.flowByPressure) || !curve(d.opacityByPressure)) return false
    if(d.curveTrace!==undefined&&(!isBrushCurveTrace(d.curveTrace)||d.model!=='stamp'||d.spray!==undefined||d.sketch!==undefined||d.bristle!==undefined||d.scatter!==undefined||d.mixer!==undefined||!record(d.behavior)||d.behavior.version!==2||d.behavior.dual!==undefined||d.behavior.timing!==undefined||d.behavior.wetMix!==undefined||d.behavior.taper!==undefined||d.texture!==undefined||d.wet!==undefined||d.paperInteraction!==0||d.tip.kind!=='round'||d.tip.profile!==undefined||!record(d.behavior.rendering)||d.behavior.rendering.accumulation!=='directOver'||d.behavior.rendering.blendMode!=='normal'))return false
    if(d.bristle!==undefined&&(!isBrushBristle(d.bristle)||d.model!=='stamp'||d.spray!==undefined||d.sketch!==undefined||d.curveTrace!==undefined||d.scatter!==undefined||d.mixer!==undefined||!record(d.behavior)||d.behavior.version!==2||d.behavior.dual!==undefined||d.behavior.timing!==undefined||d.behavior.wetMix!==undefined||d.behavior.taper!==undefined||d.texture!==undefined||d.wet!==undefined||d.paperInteraction!==0||d.tip.kind!=='round'||d.tip.profile!==undefined||!record(d.behavior.rendering)||d.behavior.rendering.accumulation!=='directOver'||d.behavior.rendering.blendMode!=='normal'))return false
    if(d.sketch!==undefined&&(!isBrushSketch(d.sketch)||d.model!=='stamp'||d.spray!==undefined||d.bristle!==undefined||d.curveTrace!==undefined||d.scatter!==undefined||d.mixer!==undefined||!record(d.behavior)||d.behavior.version!==2||d.behavior.dual!==undefined||d.behavior.timing!==undefined||d.behavior.wetMix!==undefined||d.behavior.taper!==undefined||d.texture!==undefined||d.wet!==undefined||d.paperInteraction!==0||d.tip.kind!=='round'||d.tip.profile!==undefined||!record(d.behavior.rendering)||d.behavior.rendering.accumulation!=='directOver'||d.behavior.rendering.blendMode!=='normal'))return false
    if(d.spray!==undefined&&(!isBrushSpray(d.spray)||d.model!=='stamp'||d.scatter!==undefined||d.mixer!==undefined||!record(d.behavior)||d.behavior.version!==2))return false
    if (d.tip.kind === 'procedural' && d.tip.profile === undefined) return false
    if (d.tip.profile !== undefined) {
      const profile=d.tip.profile
      if (!record(profile) || !['round','procedural'].includes(String(d.tip.kind))
        || d.tip.mask !== undefined || d.tip.maskBounds !== undefined || d.tip.animation !== undefined || d.tip.material !== undefined
        || !record(d.behavior) || d.behavior.version !== 2 || d.behavior.wetMix !== undefined
        || d.behavior.edgeBleed !== undefined || d.wet !== undefined
        || (record(d.behavior.rendering) && d.behavior.rendering.wetEdges !== undefined && d.behavior.rendering.wetEdges !== 0)
        || typeof profile.antialias !== 'boolean') return false
      if (profile.kind === 'gaussian') {
        if (d.model !== 'stamp' || d.tip.aspect !== 1
          || Object.keys(profile).some(key=>!['kind','fade','antialias'].includes(key))
          || !numberIn(profile.fade,0.000001,0.999999)) return false
      } else if (profile.kind === 'standard') {
        if (d.tip.kind !== 'procedural' || !['ellipse','rectangle'].includes(String(profile.shape))
          || Object.keys(profile).some(key=>!['kind','shape','horizontalFade','verticalFade','antialias'].includes(key))
          || !numberIn(profile.horizontalFade,0,1) || !numberIn(profile.verticalFade,0,1)) return false
      } else if (profile.kind === 'radialCurve') {
        if (d.tip.kind !== 'procedural' || profile.antialias!==false || profile.encoding!=='unorm32be'
          || Object.keys(profile).some(key=>!['kind','lookup','resolution','encoding','antialias'].includes(key))
          || !ref(profile.lookup) || !numberIn(profile.resolution,1,40000) || !Number.isInteger(profile.resolution)
          || (assetSizes.get(profile.lookup as string) ?? 0)<4
          || ((assetSizes.get(profile.lookup as string) ?? 0)**2)<4*(profile.resolution+2)
          || d.tip.imageSampling!==undefined || d.tip.alphaThreshold!==undefined) return false
      } else if (profile.kind === 'circleBand') {
        if (d.tip.kind !== 'procedural' || profile.antialias!==true || Object.keys(profile).some(key=>!['kind','antialias'].includes(key))) return false
      } else return false
    }
    // Initial max-alpha primitive has a circular, untextured source. Its
    // entire premultiplied pigment pixel changes only on strictly higher alpha.
    const circleBand=record(d.tip.profile) && d.tip.profile.kind==='circleBand'
    const maximumAlpha=record(d.behavior) && record(d.behavior.rendering) && d.behavior.rendering.accumulation==='maxAlpha'
    if (circleBand || maximumAlpha) {
      if (!circleBand || !maximumAlpha || d.model!=='stamp' || d.tip.aspect!==1 || d.paperInteraction!==0
        || d.tip.mask!==undefined || d.tip.material!==undefined || d.tip.imageSampling!==undefined
        || d.tip.animation!==undefined || d.tip.alphaThreshold!==undefined
        || d.flow!==1 || d.flowPer!=='stamp' || d.flowSpan!==undefined
        || !Array.isArray(d.flowByPressure) || d.flowByPressure.some(point=>!Array.isArray(point)||point[1]!==1)
        || !Array.isArray(d.opacityByPressure) || d.opacityByPressure.some(point=>!Array.isArray(point)||point[1]!==1)
        || (record(d.behavior) && ((record(d.behavior.dynamics) && (d.behavior.dynamics.flow!==undefined || d.behavior.dynamics.opacity!==undefined))
          || (record(d.behavior.modulations) && (d.behavior.modulations.flow!==undefined || d.behavior.modulations.opacity!==undefined))))
        || d.texture!==undefined || d.scatter!==undefined || d.wet!==undefined || d.mixer!==undefined
        || (record(d.behavior) && (d.behavior.dual!==undefined || d.behavior.taper!==undefined
          || (record(d.behavior.rotation) && d.behavior.rotation.projection===true)
          || (record(d.behavior.scatter) && d.behavior.scatter.roundnessJitter!==undefined && d.behavior.scatter.roundnessJitter!==0)
          || (record(d.behavior.dynamics) && d.behavior.dynamics.roundness!==undefined)
          || (record(d.behavior.modulations) && d.behavior.modulations.roundness!==undefined)))) return false
    }
    if (record(d.behavior) && ((record(d.behavior.dynamics) && d.behavior.dynamics.sharpness!==undefined) || (record(d.behavior.modulations) && d.behavior.modulations.sharpness!==undefined)) && d.tip.alphaThreshold===undefined) return false
    if (d.tip.alphaThreshold !== undefined) {
      const threshold=d.tip.alphaThreshold
      if (!record(threshold) || Object.keys(threshold).some(key=>!['value','softness'].includes(key)) || !numberIn(threshold.value,0,1) || !numberIn(threshold.softness,0,1)) return false
    }
    if (d.tip.maskBounds !== undefined) {
      const bounds = d.tip.maskBounds
      if (d.tip.kind !== 'bitmap' || !record(bounds)
        || Object.keys(bounds).some(key => !['x','y','width','height'].includes(key))
        || !numberIn(bounds.x,0,1) || !numberIn(bounds.y,0,1)
        || !numberIn(bounds.width,1/2048,1) || !numberIn(bounds.height,1/2048,1)
        || bounds.x + bounds.width > 1 || bounds.y + bounds.height > 1) return false
    }
    if (d.tip.imageSampling !== undefined) {
      const sampling = d.tip.imageSampling
      if (d.tip.kind !== 'bitmap' || d.tip.material !== undefined || !record(sampling)
        || Object.keys(sampling).some(key => !['kind','signal','sourceRect'].includes(key))
        || sampling.kind !== 'integer-pyramid' || sampling.signal !== 'inverse-gray'
        || !record(sampling.sourceRect)) return false
      const rect = sampling.sourceRect
      if (Object.keys(rect).some(key => !['x','y','width','height'].includes(key))
        || !numberIn(rect.x,0,2047) || !Number.isInteger(rect.x)
        || !numberIn(rect.y,0,2047) || !Number.isInteger(rect.y)
        || !numberIn(rect.width,1,2048) || !Number.isInteger(rect.width)
        || !numberIn(rect.height,1,2048) || !Number.isInteger(rect.height)) return false
      const animation = record(d.tip.animation) ? d.tip.animation.frames : undefined
      const frames = Array.isArray(animation) ? animation : [d.tip.mask]
      const right = rect.x + rect.width, bottom = rect.y + rect.height
      if (frames.some(id => {
        const size = typeof id === 'string' ? assetSizes.get(id) : undefined
        return size === undefined || right > size || bottom > size
      })) return false
    }
    if (d.tip.animation !== undefined) {
      const animation = d.tip.animation
      if (d.tip.kind !== 'bitmap' || !record(animation)
        || Object.keys(animation).some(key => !['mode','frames'].includes(key))
        || !['random','incremental'].includes(String(animation.mode))
        || !Array.isArray(animation.frames) || animation.frames.length < 2 || animation.frames.length > 256
        || !animation.frames.every(ref) || animation.frames[0] !== d.tip.mask) return false
      const frameIds = animation.frames
      const sizes = new Set(value.assets.filter(asset => frameIds.includes(asset.id)).map(asset => asset.size))
      if (sizes.size !== 1) return false
    }
    if(d.tip.color !== undefined) {
      const color=d.tip.color,frames=(d.tip.animation as {frames?:unknown[]}|undefined)?.frames ?? [d.tip.mask]
      const tuple=(v:unknown):v is AssetId[]=>Array.isArray(v)&&v.length===3&&v.every(ref)
      if(d.model!=='mixer'||(d.mixer as {algorithm?:string}|undefined)?.algorithm!=='krita-stamp'||d.tip.kind!=='bitmap'||d.tip.material!==undefined||d.tip.imageSampling!==undefined||!record(color))return false
      let planes:unknown[]
      if('gradient' in color){
        const g=color.gradient
        if(Object.keys(color).length!==1||!record(g)||Object.keys(g).some(k=>!['gray','grayFrames'].includes(k))||!ref(g.gray)
          ||(d.tip.animation ? !Array.isArray(g.grayFrames)||g.grayFrames.length!==frames.length||!g.grayFrames.every(ref)||g.grayFrames[0]!==g.gray : g.grayFrames!==undefined))return false
        planes=Array.isArray(g.grayFrames)?g.grayFrames:[g.gray]
      }else {
        if(Object.keys(color).some(k=>!['planes','frames'].includes(k))||!tuple(color.planes)
          ||(d.tip.animation ? !Array.isArray(color.frames)||color.frames.length!==frames.length||!color.frames.every(tuple)||JSON.stringify(color.frames[0])!==JSON.stringify(color.planes) : color.frames!==undefined))return false
        planes=((color.frames ?? [color.planes]) as unknown[][]).flat()
      }
      const ids=[...frames,...planes]
      if(new Set(value.assets.filter(a=>ids.includes(a.id)).map(a=>a.size)).size!==1)return false
    }
    if (d.tip.material !== undefined) {
      const material = d.tip.material
      if ((d.model !== 'stamp' && !(d.model==='mixer' && record(d.mixer) && d.mixer.algorithm==='krita-mask' && d.mixer.paintThickness)) || d.tip.kind !== 'bitmap' || !record(material)
        || Object.keys(material).some(key => !['kind','gray','grayFrames','strength'].includes(key))
        || material.kind !== 'lightness' || !ref(material.gray) || !ref(d.tip.mask)
        || !numberIn(material.strength,0,1)) return false
      const animation = d.tip.animation as { frames: unknown[] } | undefined
      const alphaFrames = animation?.frames ?? [d.tip.mask]
      if (d.tip.animation ? !Array.isArray(material.grayFrames) || material.grayFrames.length !== alphaFrames.length
        || material.grayFrames[0] !== material.gray || !material.grayFrames.every(ref) : material.grayFrames !== undefined) return false
      const grayFrames = (material.grayFrames ?? [material.gray]) as unknown[]
      const paired = [...alphaFrames,...grayFrames]
      if (new Set(value.assets.filter(asset => paired.includes(asset.id)).map(asset => asset.size)).size !== 1) return false
    }
    const key = `${d.id}@${d.version}`
    if (keys.has(key)) return false
    keys.add(key)
    if (d.flowSpan !== undefined && !numberIn(d.flowSpan, 0.01, 1)) return false
    if (d.texture !== undefined) {
      const t = d.texture
      if (!record(t) || !ref(t.id) || !numberIn(t.periodPx, 1, 8192) || !numberIn(t.strength, 0, 1)
        || Object.keys(t).some(key => !['id','periodPx','strength','application','patternSize','offset'].includes(key))) return false
      if (t.application !== undefined && (!record(t.application) || !['multiply','subtract'].includes(String(t.application.mode))
        || typeof t.application.soft !== 'boolean' || Object.keys(t.application).some(key => !['mode','soft'].includes(key)))) return false
      if (t.patternSize !== undefined) {
        const p = t.patternSize, asset = value.assets.find(a => a.id === t.id)
        if (!record(p) || !asset || !numberIn(p.width,1,asset.size) || !numberIn(p.height,1,asset.size)
          || !Number.isInteger(p.width) || !Number.isInteger(p.height)
          || Object.keys(p).some(key => !['width','height'].includes(key))) return false
      }
      if (t.offset !== undefined && (!record(t.offset) || !numberIn(t.offset.x,-8192,8192) || !numberIn(t.offset.y,-8192,8192)
        || typeof t.offset.randomX !== 'boolean' || typeof t.offset.randomY !== 'boolean'
        || Object.keys(t.offset).some(key => !['x','y','randomX','randomY'].includes(key)))) return false
    }
    if (d.scatter !== undefined && (!record(d.scatter) || !numberIn(d.scatter.count, 1, 32) || !Number.isInteger(d.scatter.count)
      || !numberIn(d.scatter.radius, 0, 4) || !numberIn(d.scatter.scale, 0.01, 2)
      || !numberIn(d.scatter.sizeJitter, 0, 1) || !numberIn(d.scatter.angleJitter, 0, 1) || !numberIn(d.scatter.flowJitter, 0, 1))) return false
    if (d.wet !== undefined && (!record(d.wet) || !numberIn(d.wet.edge, 0, 1) || !numberIn(d.wet.mottle, 0, 1)
      || !numberIn(d.wet.granulation, 0, 1) || typeof d.wet.glaze !== 'boolean'
      || (d.wet.model !== undefined && d.wet.model !== 1 && d.wet.model !== 2)
      || (d.wet.bloom !== undefined && !numberIn(d.wet.bloom, 0, 1)) || (d.wet.feather !== undefined && !numberIn(d.wet.feather, 0, 1)))) return false
    if (d.behavior !== undefined) {
      if (!isBrushBehavior(d.behavior)) return false
      if (d.behavior.sequentialRandom && !isBrushSequentialXYCompatible(d as unknown as BrushDescriptor)) return false
      const secondary = d.behavior.dual?.brush
      if (secondary) {
        if (d.model !== 'stamp' && secondary.tip?.profile?.kind === 'gaussian') return false
        if (secondary.behavior?.dual || secondary.behavior?.sequentialRandom || secondary.behavior?.strokeInput || secondary.behavior?.timing || secondary.tip?.profile?.kind === 'circleBand') return false
        const probe = { schemaVersion: 1, assets: value.assets, brushes: [{ name: 'secondary', source: b.source, warnings: [], descriptor: secondary }], skipped: [] }
        if (!isBrushLibrary(probe)) return false
      }
    }
    if (d.mixer !== undefined && (!record(d.mixer) || !numberIn(d.mixer.load,0,1) || !numberIn(d.mixer.pickup,0,1) || !numberIn(d.mixer.strength,0,1)
      || (d.mixer.initialLoad !== undefined && !numberIn(d.mixer.initialLoad,0,1))
      || (d.mixer.smearAlpha !== undefined && typeof d.mixer.smearAlpha !== 'boolean')
      || (d.mixer.source !== undefined && !isBrushCanvasSource(d.mixer.source))
      || (d.mixer.algorithm !== undefined && (!['krita-mask','krita-stamp'].includes(String(d.mixer.algorithm)) || !isBrushCanvasSource(d.mixer.source)))
      || (d.mixer.sampling !== undefined && (!record(d.mixer.sampling) || !isBrushCanvasSource(d.mixer.source) || !['uniformMean','adaptiveMean','maskMean'].includes(String(d.mixer.sampling.mode)) || !numberIn(d.mixer.sampling.radius,0,3)))
      || (d.mixer.sampling?.mode === 'maskMean' && !['krita-mask','krita-stamp'].includes(String(d.mixer.algorithm)))
      || (d.mixer.sampling?.radiusDynamics !== undefined && !isBrushBehavior({ version: 2, modulations: { flow: d.mixer.sampling.radiusDynamics } }))
      || (d.mixer.foreground !== undefined && (!isBrushCanvasSource(d.mixer.source) || !isBrushForeground(d.mixer.foreground)))
      || (d.mixer.pickupDynamics !== undefined && !isBrushBehavior({ version: 2, modulations: { flow: d.mixer.pickupDynamics } })))) return false
    // Canvas feedback has no carried reservoir or wet charge. Foreground is
    // opt-in only through its independent pre-transfer composition contract.
    if (isBrushCanvasSource(d.mixer?.source) && (d.mixer.load !== 0 || d.mixer.initialLoad !== 0 || d.behavior?.wetMix !== undefined)) return false
    if(d.tip.color!==undefined&&record(d.mixer?.foreground)&&'gradient' in d.mixer.foreground)return false
    if (d.model === 'mixer' && d.mixer === undefined) return false
    if(d.mixer?.paintThickness!==undefined) {
      const t=d.mixer.paintThickness
      if(d.mixer.algorithm!=='krita-mask'||d.mixer.source!=='previousCanvas'||!d.tip.material||!record(t)||Object.keys(t).some(k=>!['value','mode','dynamics'].includes(k))
        ||!numberIn(t.value,0,1)||!['overlay','overwrite'].includes(String(t.mode))
        ||t.dynamics!==undefined&&!isBrushBehavior({version:2,modulations:{flow:t.dynamics}}))return false
    }
    if (d.model !== 'mixer' && d.mixer !== undefined) return false
    if (b.compatibility !== undefined && (!Array.isArray(b.compatibility) || b.compatibility.length > 128 || !b.compatibility.every(c => record(c) && typeof c.feature === 'string' && c.feature.length <= 128 && ['supported','approximate','unsupported'].includes(String(c.status)) && typeof c.detail === 'string' && c.detail.length <= 2000))) return false
    if (d.screentonePx !== undefined) return false
  }
  return value.skipped.length <= 1024 && value.skipped.every(s => record(s) && typeof s.name === 'string' && s.name.length <= 256
    && Array.isArray(s.reasons) && s.reasons.length <= 100 && s.reasons.every(r => typeof r === 'string' && r.length <= 2000))
}

/** Rendering resources referenced by an immutable descriptor, including children.
 * Keep transport/preparation retention independent of each renderer's bindings. */
export function brushAssetIds(brush: BrushDescriptor): AssetId[] {
  const ids=new Set<AssetId>(),visited=new Set<BrushDescriptor>()
  const add=(id: string | undefined): void => { if(id?.startsWith('asset:')) ids.add(id as AssetId) }
  const visit=(value: BrushDescriptor): void => {
    if(visited.has(value)) return
    visited.add(value)
    add(value.tip.mask)
    for(const id of value.tip.animation?.frames ?? [])add(id)
    if(value.tip.color&&'gradient' in value.tip.color){add(value.tip.color.gradient.gray);for(const id of value.tip.color.gradient.grayFrames??[])add(id)}
    else {for(const id of value.tip.color?.planes??[])add(id);for(const frame of value.tip.color?.frames??[])for(const id of frame)add(id)}
    add(value.tip.material?.gray)
    for(const id of value.tip.material?.grayFrames ?? [])add(id)
    add(value.texture?.id)
    if(value.tip.profile?.kind==='radialCurve')add(value.tip.profile.lookup)
    if(value.behavior?.dual)visit(value.behavior.dual.brush)
  }
  visit(brush)
  return [...ids]
}

/** Enumerate semantic sensor slots only; labels/compatibility notes are not input. */
function brushDynamicInputs(b: BrushDescriptor): BrushDynamic[] {
  const v=b.behavior, groups=[v?.modulations,v?.wetMix?.dynamics]
  return [
    ...Object.values(b.sketch?.dynamics??{}).flat(),
    ...Object.values(b.curveTrace?.dynamics??{}).flat(),
    ...Object.values(v?.dynamics??{}),...Object.values(v?.colorAdjustment??{}),
    ...(v?.spacing?.dynamics??[]),...(v?.timing?.rateDynamics??[]),
    ...(v?.rotation?.composition?.additive??[]),...(v?.rotation?.composition?.scaling??[]),
    ...groups.flatMap(g=>Object.values(g??{}).flat()),
    ...(b.mixer?.sampling?.radiusDynamics??[]),...(brushForegroundRate(b.mixer?.foreground)?.dynamics??[]),...(b.mixer?.foreground && 'gradient' in b.mixer.foreground ? b.mixer.foreground.gradient.positionDynamics??[] : []),...(b.mixer?.pickupDynamics??[]),...(b.mixer?.paintThickness?.dynamics??[]),
  ]
}

/** Time is resolved by the author once, including the clock inherited by a child. */
export function brushRequiresSourceTime(brush: BrushDescriptor): boolean {
  const seen=new Set<BrushDescriptor>()
  const visit=(b: BrushDescriptor):boolean=>{
    if(seen.has(b))return false
    seen.add(b)
    return !!b.behavior?.timing||brushDynamicInputs(b).some(d=>d.control==='time')||!!(b.behavior?.dual&&visit(b.behavior.dual.brush))
  }
  return visit(brush)
}

/** Whether execution requires an explicit recorded gesture random context.
 * Inspect only sensor-bearing fields; ordinary metadata must not opt in. */
export function brushRequiresRandomContext(brush: BrushDescriptor): boolean {
  const seen = new Set<BrushDescriptor>()
  const native = (d: BrushDynamic | undefined): boolean => d?.control === 'strokeRandom' && d.randomSource?.kind === 'qt5Taus88'
  const visit = (b: BrushDescriptor): boolean => {
    if (seen.has(b)) return false
    seen.add(b)
    const v = b.behavior
    if(v?.sequentialRandom)return true
    const controls = brushDynamicInputs(b)
    return controls.some(native) || !!(v?.dual && visit(v.dual.brush))
  }
  return visit(brush)
}


/** Semantic prerequisites of the versioned single-source XY request policy.
 * This is not a preset-name gate or a claim of input-path parity with another app. */
export function isBrushSequentialXYCompatible(brush: BrushDescriptor): boolean {
  const v=brush.behavior,s=brush.scatter,tip=brush.tip
  if(brush.paperInteraction!==0||v?.erase||v?.falloff!==undefined||brush.model!=='stamp'||brush.mixer||brush.wet||brush.texture||!v||v.dual||v.wetMix||v.grain||v.colorAdjustment||v.edgeBleed||v.taper)return false
  if(tip.kind!=='round'||tip.profile?.kind!=='gaussian'||tip.profile.antialias||tip.aspect!==1||tip.rotation!=='fixed'||tip.mask||tip.animation||tip.material||tip.alphaThreshold)return false
  if(!s||s.count!==1||s.scale!==1||s.sizeJitter!==0||s.angleJitter!==0||s.flowJitter!==0)return false
  if(v.scatter?.placement!=='xyUniform'||!v.scatter.bothAxes||v.scatter.countJitter!==0||(v.scatter.roundnessJitter??0)!==0)return false
  const r=v.rotation
  if(r && (r.random!=='none'||r.composition||r.flipX||r.flipY||r.azimuth||r.projection))return false
  if(v.rendering && (v.rendering.wetEdges!==0||v.rendering.burntEdges!==0))return false
  const allowed=['scatter','opacity','flow']
  if(Object.keys(v.dynamics??{}).some(k=>!allowed.includes(k))||Object.keys(v.modulations??{}).some(k=>!allowed.includes(k)))return false
  if((v.spacing?.dynamics??[]).some(d=>d.control!=='pressure'&&d.control!=='off'))return false
  const dynamics=[...Object.values(v.dynamics??{}),...Object.values(v.modulations??{}).flat(),...(v.spacing?.dynamics??[])]
  return dynamics.every(d=>d.control!=='random'&&d.control!=='strokeRandom'&&d.jitter===0)
}

/** Recorded allocation input is mandatory for each opted-in logical request.
 * Empty final chunks have no new request to validate; endpoint-only input does. */
export function hasBrushSourceInputs(brush: BrushDescriptor, dabs: readonly import('./stroke.js').Dab[], endpoint?: import('./stroke.js').Dab): boolean {
  const allocation=!!brush.behavior?.sequentialRandom, direction=!!brush.behavior?.strokeInput, time=brushRequiresSourceTime(brush)
  if(!allocation&&!direction&&!time)return true
  const valid=(d: import('./stroke.js').Dab):boolean=>!!d
    &&(!time||isDabSourceTime(d.sourceTime))
    &&(!direction||(typeof d.sourceAngle==='number'&&Number.isFinite(d.sourceAngle)))
    &&(!allocation||(Number.isInteger(d.sourceSize)&&d.sourceSize!>=1&&d.sourceSize!<=100000
      &&typeof d.sourceScale==='number'&&Number.isFinite(d.sourceScale)&&d.sourceScale>=0&&d.sourceScale<=1))
  return dabs.every(valid)&&(!endpoint||valid(endpoint))
}

/** Both feedback sources use the same rate and dab pipeline. */
export function isBrushCanvasSource(value:unknown):value is 'previousCanvas'|'projectionCanvas' {
  return value==='previousCanvas'||value==='projectionCanvas'
}
export function brushSamplesCanvas(brush:BrushDescriptor|undefined):brush is BrushDescriptor & {mixer:NonNullable<BrushDescriptor['mixer']> & {source:'previousCanvas'|'projectionCanvas'}} {return isBrushCanvasSource(brush?.mixer?.source)}
