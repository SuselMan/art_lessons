// Developer switches, and only those (#321). Anything here is English, needs
// a page reload to take effect, and lives behind the settings panel's Debug
// tab. Three former entries — minimal UI, interface sound and the marker's
// canvas-locked angle — were settings people actually set, and moved to
// `stores/settingsStore` where they apply immediately; the rule that decides
// which list something belongs in is whether a teacher would ever open it on
// purpose.

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
    key: 'hapticGrain',
    label: 'Haptic paper grain (experimental)',
    description: 'Vibrates in a fixed hash-grid pattern over the paper as the stroke crosses it, to try simulating paper texture by touch. Android Chrome only (no Vibration API on iOS); for-fun prototype, not tuned.',
    envVar: 'VITE_HAPTIC_GRAIN',
  },
  {
    key: 'pencilSoundTuning',
    label: 'Pencil sound tuning panel (dev only)',
    description: 'Collapsible live-tuning panel for every PencilSound/PENCIL_SOUND_VARIANT_3 knob (#153 round 13), plus a "copy config" button to hand tuned values back. Only shown while sound is on (General tab).',
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

// Sound used to live here as a four-way variant picker (off / variant 1 / 2 /
// 3). It is a plain on/off setting with a volume now (`settingsStore`), and
// the two legacy variants it chose between are gone (#321) — see
// PencilSound.ts.

// Dev-only mark-grain variant comparison (see DAB_FRAG's computeGrain) — a
// live shader mode (u_grainMode) rather than a texture swap, so it applies to
// every paper type.
//
// #304: charcoal has its own mark texture too, and the two materials get
// *separate* selectors rather than one shared override, because their shipped
// defaults genuinely differ now — graphite is GRAPHITE_GRAIN_DEFAULT (10,
// "Solid": no stroke-side texture at all), charcoal is CHARCOAL_PRESETS.grain
// (3, "Streaky"). One shared control couldn't express that, and auditioning a
// variant on one material would have kept disturbing the other.
//
// 'off' means "this tool's own shipped default", NOT mode 0 — which is why '0'
// is its own selectable value here: with neither default sitting at 0 anymore,
// there'd otherwise be no way to audition the fine-dither variant at all.
//
// The graphite storage key and the GRAPHITE_ prefixes are kept from the era
// when this was graphite-only: renaming a persisted localStorage key would
// silently reset an already-stored pick.
export type GrainVariant = 'off' | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
const GRAIN_VARIANT_VALUES: readonly GrainVariant[] =
  ['off', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

const GRAPHITE_GRAIN_VARIANT_STORAGE_KEY = 'graphiteGrainVariant'
const CHARCOAL_GRAIN_VARIANT_STORAGE_KEY = 'charcoalGrainVariant'

function readGrainVariant(storageKey: string): GrainVariant {
  const raw = localStorage.getItem(storageKey)
  return (GRAIN_VARIANT_VALUES as readonly string[]).includes(raw ?? '')
    ? (raw as GrainVariant)
    : 'off'
}

export function getGraphiteGrainVariant(): GrainVariant {
  return readGrainVariant(GRAPHITE_GRAIN_VARIANT_STORAGE_KEY)
}

export function setGraphiteGrainVariant(value: GrainVariant): void {
  localStorage.setItem(GRAPHITE_GRAIN_VARIANT_STORAGE_KEY, value)
}

export function getCharcoalGrainVariant(): GrainVariant {
  return readGrainVariant(CHARCOAL_GRAIN_VARIANT_STORAGE_KEY)
}

export function setCharcoalGrainVariant(value: GrainVariant): void {
  localStorage.setItem(CHARCOAL_GRAIN_VARIANT_STORAGE_KEY, value)
}

/** 'off' -> undefined (the engine falls back to the material's own default);
 *  any explicit variant -> its shader mode number. The single place this
 *  string->number narrowing happens, so both selectors and both engine options
 *  agree on what 'off' means. */
export function grainVariantToMode(value: GrainVariant): number | undefined {
  return value === 'off' ? undefined : Number(value)
}

// Labels indexed by shader mode — mirrors DAB_FRAG's computeGrain's own
// u_grainMode branches 0-10 exactly; keep the two in sync if either changes.
// No shared TS source of truth is possible here — these live as GLSL, not as
// portable JS/TS functions that a table could index.
export const GRAPHITE_GRAIN_LABELS: readonly string[] = [
  'Fine dither',
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
