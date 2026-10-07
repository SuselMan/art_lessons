import type { Dab } from '@grafetto/shared'
import type { PencilPreset } from '../presets/pencilPresets'
import { WATERCOLOR_MIGRATION, WATERCOLOR_SPREAD, type RibbonProfile } from './ribbonProfile'
import { watercolorSpreadRadius, watercolorFerrulePx } from '../presets/watercolorPresets'

/** Same first-kept-dab scalars used by the lazy production scratch cache. */
export function prepareRibbonGestureScalars(first:Dab,preset:PencilPreset,profile:RibbonProfile,presetName:string) {
      // #489: the bloom is isotropic, so a nib that is not round is measured by
      // the circle with its area rather than by either axis. Identical to the
      // old `size * 0.5` for a round nib.
      const firstMinor = first.size * 0.5 * preset.sizeMultiplier
      const firstRadius = Math.max(
        watercolorSpreadRadius(firstMinor * Math.max(first.aspectRatio, 1), firstMinor), 0.5,
      )
      return {
        // (#536) No longer gated by the wetness under the landing point, and
        // that gate was the single worst thing about wet-in-wet.
        //
        // The bloom used to be baked into this gesture-wide number out of the
        // one digit under the first dab. So a brush set down *in* a puddle
        // spread three times as far for the whole of its travel, including the
        // dry paper it went on to cross, and a brush that started on dry paper
        // and ran through the puddle got no bloom anywhere — "если веду с
        // сухого через лужу на сухое, штрих ложится полностью сухим". Worse, at
        // a 16 px cell the first dab landing in a wet cell or a dry one near the
        // edge is close to a coin toss, which is the "иногда" in every one of
        // those reports.
        //
        // The bloom is now applied per pixel in the composite, off the deposit's
        // own record of what the paper under it was carrying (DAB_FRAG's
        // paperWetHere). This stays the *dry* reach, i.e. the ceiling the
        // shader scales up from where the paper was actually wet — so a stroke
        // blooms in the puddle and stays tight either side of it, inside one
        // mark.
        spreadPx: profile.spreadPx > 0 && profile.spreadOfRadius > 0
          ? Math.min(
            profile.spreadPx,
            Math.max(WATERCOLOR_SPREAD.min, firstRadius * profile.spreadOfRadius),
          )
          : 0,
        inkSmoothPx: 0, // resolved separately, see noteDabSpacing
        // (#468 v11) How far one exchange moves pigment. A constant of the
        // gesture for exactly the reason every other scalar here is one: the
        // composite recomputes whole rects, so whichever batch wrote a pixel
        // last would otherwise decide how far its paint had travelled.
        migratePx: profile.migrate > 0 && profile.migrateOfRadius > 0
          ? Math.min(
            WATERCOLOR_MIGRATION.maxPx,
            Math.max(WATERCOLOR_MIGRATION.minPx, firstRadius * profile.migrateOfRadius),
          )
          : 0,
        // The fallback the composite uses outside the mark, where there is no
        // deposit to read a per-pixel level from. The stroke's starting load,
        // not its current one, for the same no-seams reason.
        water: profile.waterLevel,
        fieldSeed: [first.x, first.y] as [number, number],
        // (#536) A constant of the gesture like every other scalar here, so
        // the hair does not change frequency between a live batch and the
        // final recomposite.
        // The nib's *long* axis, not the equal-area radius. A flat brush is a
        // row of hairs held in a ferrule, and the ferrule's width is the long
        // axis: measured by area it came out as a couple of bundles and read
        // as broad waves rather than as hair, which is what "на chisel не вижу
        // щетинки" was. For a round nib the two are the same number.
        //
        // (#536) …and the ferrule, not this footprint: the first dab of a
        // gesture carries both the pressure it was begun with and the head
        // taper, and on a small brush those two together cost most of the hair.
        // See watercolorFerrulePx.
        bristleRadiusPx: watercolorFerrulePx(
          firstMinor, first.aspectRatio, first.pressure, presetName,
        ),
      }
}
