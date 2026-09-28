import { useEffect, type RefObject } from 'react'

import type { PencilEngineAPI } from '../../engine'
import { getFeatureFlag } from '../../lib/observability/featureFlags'

/** (#536) The watercolor tool's dev-only switches, read off the Debug tab's
 *  feature flags and handed to the engine: which term of the composite to
 *  paint instead of the finished wash (wcView*), and the A/B switches for
 *  the composite's presentation-time effects and the settle's passes
 *  (wcNo*).
 *
 *  Read HERE rather than in the engine: the engine suite runs with no DOM at
 *  all, so a localStorage read down there typechecks and then kills every
 *  engine test on the line it sits on. And on the Debug tab rather than
 *  behind a localStorage key someone has to type into a console — the device
 *  these are switched on for is the tablet, which has no console.
 *
 *  `engineEpoch` re-applies them to a rebuilt engine (context loss, room
 *  switch): the engine keeps no copy across a rebuild. */
export function useWatercolorDevFlags(engineRef: RefObject<PencilEngineAPI | null>, engineEpoch: number): void {
  const view: 0 | 1 | 2 | 3 | 4 = getFeatureFlag('wcViewWater')
    ? 4
    : getFeatureFlag('wcViewPigment')
      ? 3
      : getFeatureFlag('wcViewDensity')
        ? 2
        : getFeatureFlag('wcViewSilhouette') ? 1 : 0
  useEffect(() => {
    engineRef.current?.setWatercolorDebugView(view)
  }, [engineRef, view, engineEpoch])
  const noSpread = getFeatureFlag('wcNoSpread')
  const noMigrate = getFeatureFlag('wcNoMigrate')
  const noDiffuse = getFeatureFlag('wcNoDiffuse')
  const noCarry = getFeatureFlag('wcNoCarry')
  const opDry = getFeatureFlag('wcOpDry')
  useEffect(() => {
    engineRef.current?.setWatercolorAb({ noSpread, noMigrate, noDiffuse, noCarry, opDry })
  }, [engineRef, noSpread, noMigrate, noDiffuse, noCarry, opDry, engineEpoch])
}
