import { useState } from 'react'

import { useT } from '../../i18n'
import {
  FEATURE_FLAGS, getFeatureFlag, setFeatureFlag,
  getGraphiteGrainVariant, setGraphiteGrainVariant,
  getCharcoalGrainVariant, setCharcoalGrainVariant,
  type GrainVariant, GRAPHITE_GRAIN_LABELS,
} from '../../lib/featureFlags'
import { GRAPHITE_GRAIN_DEFAULT, CHARCOAL_GRAIN_STREAKY } from '../../engine'
import styles from './SettingsPanel.module.css'

/** The developer half of the settings panel (#321) — feature flags, the
 *  grain-variant A/B and a vibration probe. English on purpose, like every
 *  other dev-only surface in this app (#208): its contents churn with whatever
 *  is being investigated, and it is only ever read by us.
 *
 *  Hidden unless `?debug=1` has been used in this browser (see
 *  `lib/debugTools`), which is also why it isn't simply `import.meta.env.DEV`:
 *  most of these are set on a tablet, against production.
 *
 *  This is the one tab that keeps the old edit-a-draft-then-Save-reloads
 *  model, because it earns it: every flag here is read once at mount (the
 *  engine is constructed from them), so applying one really does mean
 *  reloading, and flipping several in a row shouldn't reload once per click. */
export function DebugTab() {
  const t = useT()
  // Ad-hoc diagnostic for the hapticGrain experiment: bypasses the hash-grid
  // entirely and calls navigator.vibrate() directly, so "did the whole feature
  // fail" and "does this device/browser honor vibrate() at all" can be told
  // apart. vibrate() never throws on rejection — it just returns false — so
  // the raw return value is the only signal available.
  const [vibrateResult, setVibrateResult] = useState<string | null>(null)
  const [grainVariant, setGrainVariantState] = useState<GrainVariant>(() => getGraphiteGrainVariant())
  const [charcoalGrainVariant, setCharcoalGrainVariantState] = useState<GrainVariant>(() => getCharcoalGrainVariant())
  const [pendingFlags, setPendingFlags] = useState<Record<string, boolean>>(
    () => Object.fromEntries(FEATURE_FLAGS.map(f => [f.key, getFeatureFlag(f.key)])),
  )

  const dirty = FEATURE_FLAGS.some(f => pendingFlags[f.key] !== getFeatureFlag(f.key))
    || grainVariant !== getGraphiteGrainVariant()
    || charcoalGrainVariant !== getCharcoalGrainVariant()

  function handleSave() {
    for (const flag of FEATURE_FLAGS) setFeatureFlag(flag.key, pendingFlags[flag.key])
    setGraphiteGrainVariant(grainVariant)
    setCharcoalGrainVariant(charcoalGrainVariant)
    window.location.reload()
  }

  return (
    <>
      <div className={styles.flagList}>
        {FEATURE_FLAGS.map(flag => (
          <label key={flag.key} className={styles.flagRow}>
            <input
              type="checkbox"
              checked={pendingFlags[flag.key]}
              onChange={e => setPendingFlags(p => ({ ...p, [flag.key]: e.target.checked }))}
            />
            <div>
              <div className={styles.flagLabel}>{flag.label}</div>
              <div className={styles.flagDescription}>{flag.description}</div>
            </div>
          </label>
        ))}

        {/* #304 follow-up: one selector per material, not one shared override.
            Their shipped defaults differ (graphite 10 "Solid", charcoal 3
            "Streaky"), so a single control couldn't express both — and
            auditioning a variant on one used to disturb the other. */}
        {([
          {
            label: 'Graphite grain variant (dev)',
            defaultMode: GRAPHITE_GRAIN_DEFAULT,
            value: grainVariant,
            onChange: setGrainVariantState,
          },
          {
            label: 'Charcoal grain variant (dev)',
            defaultMode: CHARCOAL_GRAIN_STREAKY,
            value: charcoalGrainVariant,
            onChange: setCharcoalGrainVariantState,
          },
        ] as const).map(row => (
          <div key={row.label} className={styles.flagRow} style={{ cursor: 'default' }}>
            <div style={{ width: '100%' }}>
              <div className={styles.flagLabel}>{row.label}</div>
              <div className={styles.flagDescription}>
                Overrides this tool's own mark texture (live in the shader, independent of paper)
                for comparison — applies to every paper type, unlike the paper-grain control above.
                Each tool keeps its own default and its own override.
              </div>
              <select
                className={styles.select}
                value={row.value}
                onChange={e => row.onChange(e.target.value as GrainVariant)}
              >
                <option value="off">
                  Default ({row.defaultMode}. {GRAPHITE_GRAIN_LABELS[row.defaultMode]})
                </option>
                {GRAPHITE_GRAIN_LABELS.map((label, i) => (
                  <option key={i} value={String(i)}>{i}. {label}</option>
                ))}
              </select>
            </div>
          </div>
        ))}

        <div className={styles.flagRow} style={{ cursor: 'default' }}>
          <button
            type="button"
            onClick={() => {
              if (!navigator.vibrate) { setVibrateResult('navigator.vibrate is undefined — no Vibration API on this browser'); return }
              const ok = navigator.vibrate(300)
              setVibrateResult(ok ? 'vibrate(300) returned true — browser accepted it' : 'vibrate(300) returned false — browser/OS rejected it')
            }}
          >
            Test vibration (300ms)
          </button>
          {vibrateResult && <div className={styles.flagDescription}>{vibrateResult}</div>}
        </div>
      </div>

      {/* Sticky rather than a sibling of the scroll area (its shape before
          #321): the save bar belongs to this tab alone now, and the other
          three have nothing to save. */}
      <div className={styles.saveBar}>
        <span className={styles.hint}>
          {t(dirty ? 'editorSettings.unsaved' : 'editorSettings.applyAfterSave')}
        </span>
        <button type="button" className={styles.saveBtn} disabled={!dirty} onClick={handleSave}>
          {t('common.save')}
        </button>
      </div>
    </>
  )
}
