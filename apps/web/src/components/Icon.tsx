/** Every icon in the app goes through here. Most names are Material Symbols
 *  ligatures rendered by the icon font (loaded in index.html); a few tools
 *  (charcoal, smudge) have hand-drawn glyphs instead, because no Material
 *  symbol reads as "carbon stick" or "blending stump".
 *
 *  Custom glyphs live in `src/assets/icons/*.svg` and are picked up by
 *  filename — dropping `foo.svg` there makes `<Icon name="foo" />` render it,
 *  and a file named after an existing Material symbol overrides that symbol
 *  without touching any call site. They are inlined (not <img>) so
 *  `currentColor` and the surrounding `font-size` rules keep working: call
 *  sites size icons via `.material-symbols-outlined { font-size: … }` in their
 *  CSS module, and the wrapper keeps that class either way.
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

export function Icon({ name }: { name: string }) {
  const custom = customIcons[name]
  if (custom) {
    return <span className="material-symbols-outlined" dangerouslySetInnerHTML={{ __html: custom }} />
  }
  return <span className="material-symbols-outlined">{name}</span>
}
