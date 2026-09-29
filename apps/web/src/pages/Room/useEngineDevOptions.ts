import { useMemo, useState } from 'react'

import type { HapticGrainStats, PencilEngineOptions, StrokeDebugStats } from '../../engine'
import {
  getCharcoalGrainVariant, getFeatureFlag, getGraphiteGrainVariant, grainVariantToMode,
} from '../../lib/observability/featureFlags'
import { useSettingsStore } from '../../stores/settingsStore'

/** The engine options that only a developer ever changes. */
export type EngineDevOptions = Pick<PencilEngineOptions,
  'debug' | 'onStrokeDebugStats' | 'predictPointer' | 'hapticGrain' | 'onHapticGrainStats' | 'grainMode' | 'charcoalGrainMode'>

/** (#493) The developer switches the engine is built with, and the readouts
 *  two of them report into (shown by DebugStack). Out of Room.
 *
 *  Every one of these is part of how the engine is *constructed*, so a change
 *  rebuilds it — which is why they arrive as one memoised object: the mount
 *  effect depends on it, and it changes exactly when one of the flags does. */
export function useEngineDevOptions() {
  // Device performance investigation (#91) — shows a live per-stroke input/
  // render timing readout. Controlled by the "Debug overlay" feature flag
  // (#100) — VITE_DEBUG_OVERLAY in apps/web/.env.local as the default, or the
  // gear-icon settings panel to override per-browser via localStorage.
  const debugEnabled = getFeatureFlag('debugOverlay')
  const [strokeStats, setStrokeStats] = useState<StrokeDebugStats | null>(null)
  // Optional pointer-prediction experiment (#92) — same feature-flag pattern
  // as debugEnabled above. Off by default; lets Ilya A/B it on real hardware
  // before deciding whether to keep it.
  const predictEnabled = getFeatureFlag('predictPointer')
  // Haptic paper-grain experiment: same feature-flag pattern as the ones
  // above. Off by default — for-fun prototype, Android Chrome only.
  const hapticGrainEnabled = getFeatureFlag('hapticGrain')
  const [hapticStats, setHapticStats] = useState<HapticGrainStats | null>(null)
  // Dev-only grain A/B (see SettingsPanel / DAB_FRAG's computeGrain) — live
  // shader mode, applies to every paper type. One per material (#304
  // follow-up): 'off' leaves it undefined, and the engine falls back to that
  // material's own shipped default rather than to a shared one.
  const grainMode = grainVariantToMode(getGraphiteGrainVariant())
  const charcoalGrainMode = grainVariantToMode(getCharcoalGrainVariant())

  // (#321) One sound setting for the whole app — the graphite-on-paper
  // recipes and the interface's own clicks (RadialDial) read the same pair of
  // values. Live-tuning debug panel for every PencilSound knob (#153 round
  // 13, see PencilSoundTuningPanel.tsx) — nothing to tune while the sound is
  // off, same feature-flag pattern as the ones above.
  const soundEnabled = useSettingsStore(s => s.soundEnabled)
  const pencilSoundTuningEnabled = getFeatureFlag('pencilSoundTuning') && soundEnabled

  const engineDevOptions = useMemo<EngineDevOptions>(() => ({
    debug: debugEnabled,
    onStrokeDebugStats: debugEnabled ? setStrokeStats : undefined,
    predictPointer: predictEnabled,
    hapticGrain: hapticGrainEnabled,
    onHapticGrainStats: hapticGrainEnabled ? setHapticStats : undefined,
    grainMode,
    charcoalGrainMode,
  }), [debugEnabled, predictEnabled, hapticGrainEnabled, grainMode, charcoalGrainMode])

  return { engineDevOptions, debugEnabled, strokeStats, hapticGrainEnabled, hapticStats, pencilSoundTuningEnabled }
}
