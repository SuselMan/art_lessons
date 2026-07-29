import { ICON_CODEPOINTS } from '../icons/codepoints.generated'
import { CUSTOM_ICON_NAMES, type IconName, type MaterialIconName } from '../icons/iconNames'

/** Every icon in the app goes through here. Most names are Material Symbols
 *  glyphs from the subsetted font baked into src/assets/fonts/ (#322); a few
 *  tools (charcoal, smudge) have hand-drawn glyphs instead, because no
 *  Material symbol reads as "carbon stick" or "blending stump".
 *
 *  Names are a union type, not `string` — the shipped font contains only the
 *  glyphs listed in icons/iconNames.ts, so a name outside that list has
 *  nothing to draw. The type is what makes that a compile error rather than
 *  an invisible button someone finds on a tablet later.
 *
 *  The font is addressed by codepoint, not by its `liga` ligatures: this
 *  renders '\u{e872}', not the text "delete". Subsetting by ligature would
 *  have meant keeping every letter, and with it every icon those letters can
 *  still spell — 269.7 KB against 4.7 KB for the same 60 icons. The full
 *  reasoning and the measurement are in scripts/bakeIconFont.ts.
 *
 *  Custom glyphs live in `src/assets/icons/*.svg` and are picked up by
 *  filename — dropping `foo.svg` there and adding "foo" to CUSTOM_ICON_NAMES
 *  makes `<Icon name="foo" />` render it, and a file named after an existing
 *  Material symbol overrides that symbol without touching any call site. They
 *  are inlined (not <img>) so `currentColor` and the surrounding `font-size`
 *  rules keep working: call sites size icons via
 *  `.material-symbols-outlined { font-size: … }` in their CSS module, and the
 *  wrapper keeps that class either way.
 *
 *  Requirements for a custom SVG: viewBox="0 0 24 24", no width/height,
 *  currentColor for fill/stroke, and no `id`/`clipPath` (an inlined id would
 *  collide with the same icon rendered elsewhere on the page). */
const customIcons = Object.fromEntries(
  Object.entries(
    import.meta.glob('../assets/icons/*.svg', {
      query: '?raw',
      eager: true,
      import: 'default',
    }) as Record<string, string>,
  ).map(([path, svg]) => [path.slice(path.lastIndexOf('/') + 1, -'.svg'.length), svg]),
)

// CUSTOM_ICON_NAMES has to be written out by hand (a type cannot be derived
// from a directory listing), so it can fall out of step with what is actually
// in assets/icons/. Dropping in an SVG without listing it would leave the name
// untypeable; listing one that does not exist would render an empty span. Both
// are caught here on first import rather than by eye.
if (import.meta.env.DEV) {
  const onDisk = new Set(Object.keys(customIcons))
  const listed = new Set<string>(CUSTOM_ICON_NAMES)
  const missing = [...onDisk].filter((n) => !listed.has(n))
  const stale = [...listed].filter((n) => !onDisk.has(n))
  if (missing.length > 0 || stale.length > 0) {
    console.error(
      '[Icon] src/assets/icons/ and CUSTOM_ICON_NAMES disagree.' +
        (missing.length > 0 ? ` On disk but not listed: ${missing.join(', ')}.` : '') +
        (stale.length > 0 ? ` Listed but not on disk: ${stale.join(', ')}.` : ''),
    )
  }
}

/** Narrows away the custom-only names (bullet-tip, chisel-tip), which have no
 *  glyph in the font and are never looked up in the codepoint map. */
function isMaterialIcon(name: IconName): name is MaterialIconName {
  return name in ICON_CODEPOINTS
}

export function Icon({ name }: { name: IconName }) {
  const custom = customIcons[name]
  if (custom) {
    // aria-hidden: the glyph is decorative in both branches — an icon-only
    // control carries its own aria-label, and one with a text label would
    // otherwise be announced twice.
    return (
      <span
        className="material-symbols-outlined"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: custom }}
      />
    )
  }
  return (
    <span className="material-symbols-outlined" aria-hidden="true">
      {isMaterialIcon(name) ? ICON_CODEPOINTS[name] : null}
    </span>
  )
}
