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
