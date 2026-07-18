import { ROUGH_VARIANTS } from '../engine/src/paperNoise'

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
  {
    key: 'pencilSoundTuning',
    label: 'Pencil sound tuning panel (dev only)',
    description: 'Collapsible live-tuning panel for every PencilSound/PENCIL_SOUND_VARIANT_3 knob (#153 round 13), plus a "copy config" button to hand tuned values back. Only shown while pencilSoundSetting is variant3.',
    envVar: 'VITE_PENCIL_SOUND_TUNING',
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
// forcing the generic flag list to support enum values for this one case. All three are
// node-graph recipes in lib/PencilSound.ts (#153, round 13 — variant3 was an AudioWorklet synth
// before that, see PENCIL_SOUND_TUNING_LOG.md).
export type PencilSoundSetting = 'off' | 'variant1' | 'variant2' | 'variant3'
const PENCIL_SOUND_STORAGE_KEY = 'pencilSoundVariant'

export function getPencilSoundSetting(): PencilSoundSetting {
  const raw = localStorage.getItem(PENCIL_SOUND_STORAGE_KEY)
  return raw === 'variant1' || raw === 'variant2' || raw === 'variant3' ? raw : 'off'
}

export function setPencilSoundSetting(value: PencilSoundSetting): void {
  localStorage.setItem(PENCIL_SOUND_STORAGE_KEY, value)
}

// Dev-only paper-grain fiber-variant comparison (see paperNoise.ts's
// ROUGH_VARIANTS / bakeRoughVariantTextures.ts) — same "own pair of
// functions instead of a boolean flag" reasoning as pencil sound above.
// 'off' means the real, shipped rough.paper asset; '1'..String(ROUGH_
// VARIANTS.length) overrides just the rough paper texture with that
// candidate's bake from public/paper-variants/ (see engine/index.ts's
// paperVariantUrl option) — never affects smooth/bristol, which have no
// variant bake at all. Validated against ROUGH_VARIANTS.length rather than
// a hardcoded literal union so adding an 11th (or 20th) variant there can't
// silently desync from what this accepts — a fixed list here once meant a
// freshly-added variant's own value failed validation and got quietly
// coerced back to 'off' on every reload, with no error anywhere.
export type PaperGrainVariant = string
const PAPER_GRAIN_VARIANT_STORAGE_KEY = 'paperGrainVariant'

export function getPaperGrainVariant(): PaperGrainVariant {
  const raw = localStorage.getItem(PAPER_GRAIN_VARIANT_STORAGE_KEY)
  if (raw === 'off') return 'off'
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n >= 1 && n <= ROUGH_VARIANTS.length ? raw! : 'off'
}

export function setPaperGrainVariant(value: PaperGrainVariant): void {
  localStorage.setItem(PAPER_GRAIN_VARIANT_STORAGE_KEY, value)
}

// Dev-only graphite-grain fiber-variant comparison (see DAB_FRAG's
// computeGrain) — same shape as PaperGrainVariant above, but this one's
// live-shader (u_grainMode), not a texture-asset swap, and applies to every
// paper type rather than just rough.
export type GraphiteGrainVariant = 'off' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
const GRAPHITE_GRAIN_VARIANT_STORAGE_KEY = 'graphiteGrainVariant'
const GRAPHITE_GRAIN_VARIANT_VALUES: readonly GraphiteGrainVariant[] =
  ['off', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

export function getGraphiteGrainVariant(): GraphiteGrainVariant {
  const raw = localStorage.getItem(GRAPHITE_GRAIN_VARIANT_STORAGE_KEY)
  return (GRAPHITE_GRAIN_VARIANT_VALUES as readonly string[]).includes(raw ?? '')
    ? (raw as GraphiteGrainVariant)
    : 'off'
}

export function setGraphiteGrainVariant(value: GraphiteGrainVariant): void {
  localStorage.setItem(GRAPHITE_GRAIN_VARIANT_STORAGE_KEY, value)
}

// Labels for '1'..'10', index 0 unused ('off' has no shader mode number) —
// mirrors DAB_FRAG's computeGrain's own u_grainMode branches 1-10 exactly;
// keep the two in sync if either changes. No shared TS source of truth is
// possible here the way ROUGH_VARIANTS is for paper, since these live as
// GLSL, not portable JS/TS functions.
export const GRAPHITE_GRAIN_LABELS: readonly string[] = [
  '',
  'Stronger fine noise',
  'Blotchy (low-freq)',
  'Streaky (tilt-aligned)',
  'Stipple',
  'Two-octave layered',
  'Edge-emphasized',
  'Posterized speckle',
  'Fixed-tilt chatter',
  'Kitchen sink',
  'Solid (no texture)',
]
