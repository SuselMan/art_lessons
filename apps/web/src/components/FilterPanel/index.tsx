import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import type { LayerFilter, LayerFilterKind } from '@grafetto/shared'
import { LAYER_FILTER_KINDS, LAYER_FILTER_LIMITS } from '@grafetto/shared'

import { isIdentityFilter, normalizeLayerFilter } from '../../engine'
import { useT } from '../../i18n'
import type { TranslationKey } from '../../i18n'
import { claimModalSlot, releaseModalSlot, type ModalSlotEntry } from '../Modal/modalSlot'
import { NumberField } from '../NumberField'
import { OptionGroup } from '../OptionGroup'
import { OptionSelect } from '../OptionPicker'
import { PrecisionSlider } from '../PrecisionSlider'
import { Switch } from '../Switch'
import { CurveEditor } from './CurveEditor'
import {
  BALANCE_AXES, CURVE_CHANNELS, TONAL_RANGES, draftToFilter, initialDraft, resetKind,
  type CurveChannel, type FilterDraft, type TonalRange,
} from './filterDraft'
import styles from './FilterPanel.module.css'

interface FilterPanelProps {
  layerName: string
  /** Draws `filter` over the layer without applying it; `null` removes the
   *  preview. Synchronous and not cheap — the panel calls it once a setting
   *  has settled, not on every slider step. */
  onPreview: (filter: LayerFilter | null) => void
  onApply: (filter: LayerFilter) => void
  onClose: () => void
}

/** How long a setting has to stay put before the preview is recomputed. The
 *  preview runs the real filter over the whole layer (ADR 014), so doing it
 *  on every slider step would freeze the drag itself. */
const PREVIEW_DELAY_MS = 150

const KIND_LABEL: Record<LayerFilterKind, TranslationKey> = {
  gaussian_blur: 'filter.kind.gaussian_blur',
  motion_blur: 'filter.kind.motion_blur',
  hsl: 'filter.kind.hsl',
  curves: 'filter.kind.curves',
  color_balance: 'filter.kind.color_balance',
}

const CHANNEL_LABEL: Record<CurveChannel, TranslationKey> = {
  value: 'filter.channel.value', red: 'filter.channel.red',
  green: 'filter.channel.green', blue: 'filter.channel.blue',
}

const RANGE_LABEL: Record<TonalRange, TranslationKey> = {
  shadows: 'filter.range.shadows', midtones: 'filter.range.midtones', highlights: 'filter.range.highlights',
}

const AXIS_LABEL: Record<(typeof BALANCE_AXES)[number], TranslationKey> = {
  cyanRed: 'filter.cyanRed', magentaGreen: 'filter.magentaGreen', yellowBlue: 'filter.yellowBlue',
}

const signed = (v: number): string => (v > 0 ? `+${v}` : String(v))

interface RangeRowProps {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  format?: (v: number) => string
}

/** Label, exact number, slider — the shape of every numeric setting in the
 *  tool settings panel (SettingField's `panel` layout), so a filter reads like
 *  the rest of the app. */
function RangeRow({ label, value, min, max, onChange, format }: RangeRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <span className={styles.rowLabel}>{label}</span>
        <NumberField value={value} min={min} max={max} step={1} onChange={onChange} format={format} label={label} />
      </div>
      <PrecisionSlider
        className={styles.range}
        orientation="horizontal"
        value={value} min={min} max={max} step={1}
        onChange={onChange}
        formatValue={format}
        title={label}
      />
    </div>
  )
}

/** (#574) The filter dialog: pick a filter, set it, watch it on the canvas,
 *  apply or walk away.
 *
 *  A floating card over a transparent blocker rather than the app's Modal:
 *  Modal dims everything behind it, and behind this one is the preview — the
 *  thing the person is trying to judge. The blocker is still there, because a
 *  stroke on the layer while its preview floats over it would paint where
 *  nothing can be seen.
 *
 *  Settings of every filter are kept while the dialog is open, so switching
 *  from Curves to Blur and back does not lose the curve. */
export function FilterPanel({ layerName, onPreview, onApply, onClose }: FilterPanelProps) {
  const t = useT()
  const [draft, setDraft] = useState<FilterDraft>(() => initialDraft())
  const [channel, setChannel] = useState<CurveChannel>('value')
  const [range, setRange] = useState<TonalRange>('midtones')
  const [previewOn, setPreviewOn] = useState(true)
  const [busy, setBusy] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const filter = useMemo(() => normalizeLayerFilter(draftToFilter(draft)), [draft])
  const identity = isIdentityFilter(filter)

  // Read through a ref so the effects below re-run on the *settings*, not on
  // whether the parent handed down a new function this render.
  const onPreviewRef = useRef(onPreview)
  onPreviewRef.current = onPreview

  useEffect(() => {
    const wanted = previewOn && !identity ? filter : null
    setBusy(wanted !== null)
    const timer = setTimeout(() => {
      onPreviewRef.current(wanted)
      setBusy(false)
    }, wanted ? PREVIEW_DELAY_MS : 0)
    return () => clearTimeout(timer)
  }, [filter, previewOn, identity])

  // Whatever happens to the dialog, the preview goes with it.
  useEffect(() => () => onPreviewRef.current(null), [])

  useEffect(() => { cardRef.current?.focus() }, [])

  // Holds the app's one modal slot, although it is not a Modal: that is what
  // keeps the Room's hotkeys quiet while it is open (they check
  // isModalOpen), and what closes it if a real dialog opens over it.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const entry: ModalSlotEntry = { close: () => onCloseRef.current() }
    claimModalSlot(entry)
    return () => releaseModalSlot(entry)
  }, [])

  const set = (patch: Partial<FilterDraft>): void => setDraft(d => ({ ...d, ...patch }))

  const apply = (): void => {
    if (identity) return
    onApply(filter)
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    else if (e.key === 'Enter' && e.target === cardRef.current) { e.preventDefault(); apply() }
  }

  const L = LAYER_FILTER_LIMITS
  const kindOptions = LAYER_FILTER_KINDS.map(k => ({ value: k, label: t(KIND_LABEL[k]) }))

  let body: ReactNode = null
  switch (draft.kind) {
    case 'gaussian_blur':
      body = (
        <RangeRow
          label={t('filter.radius')} value={draft.gaussian.radius}
          min={L.blurRadius.min} max={L.blurRadius.max} format={v => `${v} px`}
          onChange={radius => set({ gaussian: { radius } })}
        />
      )
      break
    case 'motion_blur':
      body = (
        <>
          <RangeRow
            label={t('filter.angle')} value={draft.motion.angle} min={0} max={359} format={v => `${v}°`}
            onChange={angle => set({ motion: { ...draft.motion, angle } })}
          />
          <RangeRow
            label={t('filter.distance')} value={draft.motion.distance}
            min={L.motionDistance.min} max={L.motionDistance.max} format={v => `${v} px`}
            onChange={distance => set({ motion: { ...draft.motion, distance } })}
          />
        </>
      )
      break
    case 'hsl':
      body = (
        <>
          <RangeRow
            label={t('filter.hue')} value={draft.hsl.hue} min={-L.hue} max={L.hue} format={v => `${signed(v)}°`}
            onChange={hue => set({ hsl: { ...draft.hsl, hue } })}
          />
          <RangeRow
            label={t('filter.saturation')} value={draft.hsl.saturation} min={-L.percent} max={L.percent} format={signed}
            onChange={saturation => set({ hsl: { ...draft.hsl, saturation } })}
          />
          <RangeRow
            label={t('filter.lightness')} value={draft.hsl.lightness} min={-L.percent} max={L.percent} format={signed}
            onChange={lightness => set({ hsl: { ...draft.hsl, lightness } })}
          />
        </>
      )
      break
    case 'curves':
      body = (
        <>
          <OptionGroup
            variant="segmented"
            ariaLabel={t('filter.channel')}
            options={CURVE_CHANNELS.map(c => ({ id: c, label: t(CHANNEL_LABEL[c]) }))}
            active={channel}
            onSelect={setChannel}
          />
          <CurveEditor
            points={draft.curves[channel]}
            tone={channel}
            label={t(CHANNEL_LABEL[channel])}
            onChange={points => set({ curves: { ...draft.curves, [channel]: points } })}
          />
          <p className={styles.hint}>{t('filter.curveHint')}</p>
        </>
      )
      break
    case 'color_balance':
      body = (
        <>
          <OptionGroup
            variant="segmented"
            ariaLabel={t('filter.range')}
            options={TONAL_RANGES.map(r => ({ id: r, label: t(RANGE_LABEL[r]) }))}
            active={range}
            onSelect={setRange}
          />
          {BALANCE_AXES.map(axis => (
            <RangeRow
              key={axis}
              label={t(AXIS_LABEL[axis])} value={draft.balance[range][axis]}
              min={-L.percent} max={L.percent} format={signed}
              onChange={v => set({ balance: { ...draft.balance, [range]: { ...draft.balance[range], [axis]: v } } })}
            />
          ))}
          <Switch
            label={t('filter.preserveLuminosity')}
            checked={draft.balance.preserveLuminosity}
            onChange={preserveLuminosity => set({ balance: { ...draft.balance, preserveLuminosity } })}
          />
        </>
      )
      break
  }

  return (
    <>
      {/* Swallows pointer input to the canvas while the dialog is open; see
          the component's doc comment. */}
      <div className={styles.blocker} aria-hidden="true" />
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-label={t('filter.title')}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className={styles.head}>
          <span className={styles.title}>{t('filter.title')}</span>
          <span className={styles.layer}>{t('filter.layer', { name: layerName })}</span>
        </div>
        <div className={styles.body}>
          <OptionSelect
            options={kindOptions}
            value={draft.kind}
            label={t('filter.title')}
            onChange={kind => {
              const next = LAYER_FILTER_KINDS.find(k => k === kind)
              if (next) set({ kind: next })
            }}
          />
          {body}
        </div>
        <div className={styles.footer}>
          <Switch label={t('filter.preview')} checked={previewOn} onChange={setPreviewOn} />
          <span className={styles.busy} aria-live="polite">{busy ? t('filter.working') : ''}</span>
          <button type="button" className={styles.textButton} onClick={() => setDraft(d => resetKind(d))}>
            {t('filter.reset')}
          </button>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className={styles.confirm} onClick={apply} disabled={identity}>
            {t('filter.apply')}
          </button>
        </div>
      </div>
    </>
  )
}
