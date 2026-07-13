export interface FeatureFlagDef {
  key: string
  label: string
  description: string
  /** VITE_-prefixed env var (apps/web/.env.local) used as the default when no
   *  localStorage override exists yet. */
  envVar?: string
}

export const FEATURE_FLAGS: readonly FeatureFlagDef[] = [
  {
    key: 'debugOverlay',
    label: 'Debug overlay',
    description: 'Per-stroke input/render timing panel (#91).',
    envVar: 'VITE_DEBUG_OVERLAY',
  },
  {
    key: 'predictPointer',
    label: 'Pointer prediction (experimental)',
    description: 'Predicts pointer position ahead of real events to cut felt input latency (#92). May misdraw on sharp direction reversals.',
    envVar: 'VITE_PREDICT_POINTER',
  },
  {
    key: 'tapToHideUI',
    label: 'Minimal UI: tap to hide (experimental)',
    description: 'A short single-finger tap on the canvas hides the toolbar/header/layer panel; tap again to bring them back (#99). Stylus strokes never trigger it.',
    envVar: 'VITE_TAP_TO_HIDE_UI',
  },
  {
    key: 'hapticGrain',
    label: 'Haptic paper grain (experimental)',
    description: 'Vibrates in a fixed hash-grid pattern over the paper as the stroke crosses it, to try simulating paper texture by touch. Android Chrome only (no Vibration API on iOS); for-fun prototype, not tuned.',
    envVar: 'VITE_HAPTIC_GRAIN',
  },
]

const STORAGE_PREFIX = 'featureFlag:'

function envDefault(def: FeatureFlagDef): boolean {
  return !!def.envVar && import.meta.env[def.envVar] === 'true'
}

export function getFeatureFlag(key: string): boolean {
  const raw = localStorage.getItem(STORAGE_PREFIX + key)
  if (raw === 'true') return true
  if (raw === 'false') return false
  const def = FEATURE_FLAGS.find(f => f.key === key)
  return def ? envDefault(def) : false
}

export function setFeatureFlag(key: string, value: boolean): void {
  localStorage.setItem(STORAGE_PREFIX + key, String(value))
}

// Pencil sound has distinct variants rather than one on/off toggle — a multi-way choice doesn't
// fit FeatureFlagDef's boolean shape, so it gets its own small pair of functions instead of
// forcing the generic flag list to support enum values for this one case. variant1/variant2 are
// the node-graph recipes in lib/PencilSound.ts; variant3 is the AudioWorklet synth in
// lib/pencilSoundV3/ (#153).
export type PencilSoundSetting = 'off' | 'variant1' | 'variant2' | 'variant3'
const PENCIL_SOUND_STORAGE_KEY = 'pencilSoundVariant'

export function getPencilSoundSetting(): PencilSoundSetting {
  const raw = localStorage.getItem(PENCIL_SOUND_STORAGE_KEY)
  return raw === 'variant1' || raw === 'variant2' || raw === 'variant3' ? raw : 'off'
}

export function setPencilSoundSetting(value: PencilSoundSetting): void {
  localStorage.setItem(PENCIL_SOUND_STORAGE_KEY, value)
}
