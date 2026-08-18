// #468 v5, ADR 011 §5 — real pigments, each with its own character.
//
// Until v5 the tool had one pigment, and "how much of it" was the only thing a
// user could say about the paint. That is wrong about watercolor in a way that
// shows immediately: French Ultramarine granulates so heavily that people buy
// it *for* the effect, while a phthalo green of the same strength lays down
// perfectly smooth. Same amount of paint, completely different mark.
//
// ── Provenance ──────────────────────────────────────────────────────────────
//
// The table below is adapted from `json/pigments.json` in *Writing on Water*
// (https://github.com/arsena21/writing-on-water), Copyright (c) 2012 Antonio R.
// <antonio@rain-d.ru>, MIT licence. Colours and the granulation / opacity /
// diffusion / staining figures are theirs; the mapping onto this engine's terms
// (below) is ours, and `blossom` is dropped because we have no backruns for it
// to drive.
//
// MIT requires the copyright notice to travel with substantial portions of the
// work, which is what this block is. It is a genuinely reusable piece of
// research — fifteen paints an actual watercolourist would recognise, with
// plausible relative numbers — and re-deriving it from pigment datasheets would
// have been a week's work for a worse result.
//
// ── What each field does here ───────────────────────────────────────────────
//
// The fields are not sliders and are deliberately not exposed as any: they are
// facts about a paint, and the point of picking "Cobalt Blue" is that you get
// cobalt's behaviour without having to know which four numbers produce it.

/** Codes are the real Colour Index names watercolour tubes are labelled with,
 *  which is also what makes them safe as stable identifiers: a stroke records
 *  the code, and PB29 will still mean French Ultramarine in ten years. */
export type WatercolorPigmentCode = string

export interface WatercolorPigment {
  /** Colour Index code, as printed on the tube. Recorded on the stroke. */
  code: WatercolorPigmentCode
  name: string
  /** The paint's own colour, linear 0..1 RGB. */
  color: [number, number, number]
  /** How strongly this paint clumps into the paper's pits as it dries.
   *  Multiplies the tool's own granulation term. Ultramarine 0.75 against
   *  phthalo green 0.10 is the whole reason this table exists. */
  granulation: number
  /** How covering the paint is, 0..1 — and every one of these is *low*, which
   *  is what makes them watercolours rather than gouache. Chooses between the
   *  two halves of the composite: a transparent paint transmits what is under
   *  it (a multiply), an opaque one sits on top of it (an over). See DAB_FRAG's
   *  u_inkMode=9 branch. */
  opacity: number
  /** How readily it travels through wet paper. Scales the wash's spread. */
  diffusion: number
  /** How hard it binds to the fibre. A staining paint cannot migrate to the
   *  drying perimeter, so it leaves *less* of a tideline, not more — which is
   *  why this reduces the wet-edge term rather than adding to it. */
  staining: number
}

function rgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
}

export const WATERCOLOR_PIGMENTS: readonly WatercolorPigment[] = [
  { code: 'PY35',  name: 'Cadmium Yellow',       color: rgb(0xf1e433), granulation: 0.10, opacity: 0.20, diffusion: 0.25, staining: 0.75 },
  { code: 'PY154', name: 'Benzimida Yellow',     color: rgb(0xdbbc2e), granulation: 0.30, opacity: 0.02, diffusion: 0.25, staining: 0.75 },
  { code: 'PY42',  name: 'Gold Ochre',           color: rgb(0xEB8346), granulation: 0.10, opacity: 0.10, diffusion: 0.50, staining: 0.75 },
  { code: 'PR108', name: 'Cadmium Scarlet',      color: rgb(0xe94730), granulation: 0.30, opacity: 0.10, diffusion: 0.75, staining: 0.75 },
  { code: 'PR179', name: 'Perylene Maroon',      color: rgb(0xd4322f), granulation: 0.30, opacity: 0.01, diffusion: 0.01, staining: 1.00 },
  { code: 'PR122', name: 'Quinacridone Magenta', color: rgb(0xe83b4f), granulation: 0.30, opacity: 0.01, diffusion: 0.01, staining: 1.00 },
  { code: 'PBr7',  name: 'Burnt Sienna',         color: rgb(0xAD534A), granulation: 0.50, opacity: 0.10, diffusion: 0.50, staining: 0.75 },
  { code: 'PB29',  name: 'French Ultramarine',   color: rgb(0x2a3b97), granulation: 0.75, opacity: 0.10, diffusion: 0.75, staining: 0.25 },
  { code: 'PB28',  name: 'Cobalt Blue',          color: rgb(0x48439d), granulation: 0.75, opacity: 0.10, diffusion: 0.75, staining: 0.50 },
  { code: 'PB15',  name: 'Winsor Blue',          color: rgb(0x2688d3), granulation: 0.50, opacity: 0.20, diffusion: 0.25, staining: 0.50 },
  { code: 'PB36',  name: 'Cerulean Blue',        color: rgb(0x0274ae), granulation: 0.50, opacity: 0.02, diffusion: 1.00, staining: 0.75 },
  { code: 'PG7',   name: 'Winsor Green',         color: rgb(0x07997e), granulation: 0.10, opacity: 0.02, diffusion: 0.25, staining: 1.00 },
  { code: 'PG36',  name: 'Winsor Green YS',      color: rgb(0x74c176), granulation: 0.10, opacity: 0.02, diffusion: 0.50, staining: 1.00 },
  { code: 'PBk6',  name: 'Neutral Tint',         color: rgb(0x242F2C), granulation: 0.75, opacity: 0.02, diffusion: 1.00, staining: 1.00 },
  { code: 'PW4',   name: 'Chinese White',        color: rgb(0xFFFFFF), granulation: 0.01, opacity: 0.02, diffusion: 0.25, staining: 0.50 },
]

/** French Ultramarine: the paint most people picture when they picture
 *  watercolour granulating, and the one that shows the most of what this table
 *  buys. */
export const DEFAULT_WATERCOLOR_PIGMENT = 'PB29'

/** The neutral fallback for a stroke whose code we do not recognise — recorded
 *  by a newer client, or by one we later removed a pigment from. Mid-range on
 *  every axis, so an unknown paint renders as an unremarkable one rather than
 *  as nothing.
 *
 *  Not optional: the Operation Log is permanent, so this path is reached by
 *  real strokes in real rooms, not only by malformed input. */
const UNKNOWN_PIGMENT: WatercolorPigment = {
  code: '', name: '', color: [0.2, 0.32, 0.6],
  granulation: 0.35, opacity: 0.06, diffusion: 0.5, staining: 0.6,
}

const BY_CODE = new Map(WATERCOLOR_PIGMENTS.map(p => [p.code, p]))

export function watercolorPigmentByCode(code: string | undefined): WatercolorPigment {
  const exact = code ? BY_CODE.get(code) : undefined
  return exact ?? BY_CODE.get(DEFAULT_WATERCOLOR_PIGMENT) ?? UNKNOWN_PIGMENT
}

export function isWatercolorPigmentCode(code: string): boolean {
  return BY_CODE.has(code)
}

/** Option list for the tool's picker, in the order above — warm through cool,
 *  the way a pan set is laid out. */
export const WATERCOLOR_PIGMENT_CODES: readonly string[] =
  WATERCOLOR_PIGMENTS.map(p => p.code)

/** A swatch per pigment, as an inline SVG data URI, for the picker's option
 *  images.
 *
 *  A painted square is the honest picture of a paint, and generating it beats
 *  committing fifteen PNGs the way the pencil grades do: those illustrate a
 *  *mark* (which a photograph shows and a swatch cannot), whereas what
 *  distinguishes one tube from the next here is its colour. Each is well under
 *  200 bytes, so they cost less in the bundle than one of those PNGs costs on
 *  the wire. */
export const WATERCOLOR_PIGMENT_SWATCHES: Record<string, string> = Object.fromEntries(
  WATERCOLOR_PIGMENTS.map(p => {
    const hex = p.color
      .map(c => Math.round(c * 255).toString(16).padStart(2, '0'))
      .join('')
    // A rounded square with a hairline so a near-white paint (Chinese White)
    // is still visible against a light panel.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">`
      + `<rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="%23${hex}"`
      + ` stroke="rgba(0,0,0,.28)" stroke-width="1"/></svg>`
    return [p.code, `data:image/svg+xml,${svg}`]
  }),
)
