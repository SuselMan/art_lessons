# Paper sources

Photographed sheets the shipped paper grain is baked from. Inputs to
`npm run bake:paper` (see `apps/web/scripts/bakePaperTextures.ts`), never
served to a browser — what clients fetch is the baked
`apps/web/public/paper/*.paper`, which is gitignored and regenerated.

These files are committed even though the bake output is not, and that
asymmetry is deliberate: a source is immutable, so it enters git history
once, while baked output is rewritten on every re-tune and would accumulate
tens of megabytes per pass (the reason #300 took it out of the repo). Having
the source here also means CI can bake with no network access and no
credentials.

## paper001-displacement.jpg

- **Source**: [ambientCG, Paper001](https://ambientcg.com/a/Paper001) —
  `Paper001_4K-JPG_Displacement.jpg` from the 4K-JPG archive.
- **License**: CC0 1.0 (public domain dedication). No attribution required;
  recorded here because knowing where an asset came from matters more than
  the licence obliging it.
- **What it is**: 4096×2402 single-channel height map of a white sheet,
  produced by ambientCG's height-field photogrammetry.
- **Known limitation**: it does **not** tile, despite the material being
  published as seamless — repeating it puts a hard vertical seam down the
  middle. The bake cross-fades the sheet's own edges before wrapping it (see
  `makeSeamless`), which is only needed at all for the magnifications whose
  window is larger than the sheet.
- **Physical size**: unknown; ambientCG reports `dimensionX/Y = 0` for this
  asset. The three baked magnifications were chosen by eye against a real
  canvas rather than derived from a scale.
