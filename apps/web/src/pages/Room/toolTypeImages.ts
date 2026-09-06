// Sample-stroke images for the tool-type pickers (#335) — one photographed
// stroke per pencil grade / charcoal type, cut from a single scanned sheet,
// background removed into alpha (see the file's own alpha channel: the graphite
// is black, the paper is gone, so the UI puts its own paper tint behind it).
//
// Picked up by filename rather than listed here: a file's basename *is* the
// enum option it illustrates ('HB.png' ⇒ grade 'HB', 'vine.png' ⇒ charcoal type
// 'vine'), the same convention components/Icon.tsx already uses for custom
// glyphs. Adding a grade is then dropping a file in, not editing two places —
// and `toolSchemas.test.ts` asserts every option a schema declares has one, so
// a missing file is a failing test rather than a silently blank row.
//
// `?url` (not the raw bytes): these are ~40 KB PNGs each, so they stay separate
// files the browser fetches on demand, and only the URL strings are in the
// bundle.
const files = import.meta.glob('../../assets/tool-types/*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function imagesFor(tool: string): Record<string, string> {
  const prefix = `../../assets/tool-types/${tool}/`
  return Object.fromEntries(
    Object.entries(files)
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, url]) => [path.slice(prefix.length, -'.png'.length), url]),
  )
}

export const PENCIL_GRADE_IMAGES = imagesFor('pencil')
export const CHARCOAL_TYPE_IMAGES = imagesFor('charcoal')

/** (#547) Unlike the two above, these are not photographs of a real stroke on
 *  real paper — there is no such thing for this tool. They are the engine's own
 *  output, baked by scripts/bakeBrushSamples.ts, which is the only picture of a
 *  digital brush that cannot quietly stop being true. */
export const DIGITAL_BRUSH_IMAGES = imagesFor('digitalBrush')

/** Marker nibs deliberately get icons instead (see markerSchema) — the two
 *  differ in tip *shape*, which a photographed stroke shows far worse than a
 *  drawn glyph does. The sample strokes still exist under
 *  `assets/tool-types/marker/` and are what the icons were drawn from. */
export const MARKER_NIB_ICONS = { bullet: 'bullet-tip', chisel: 'chisel-tip' } as const
