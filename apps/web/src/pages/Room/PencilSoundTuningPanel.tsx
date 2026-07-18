import { useState } from 'react'
import type { RefObject } from 'react'

import { PENCIL_SOUND_VARIANT_3, PENCIL_SOUND_TUNING, type PencilSound, type GrainVariant, type PencilSoundTuning } from '../../lib/PencilSound'

import styles from './Room.module.css'

// Snapshotted once, at module load — before any slider in this panel has had
// a chance to mutate PENCIL_SOUND_VARIANT_3/PENCIL_SOUND_TUNING in place —
// so "reset" always means "back to what shipped," not "back to whatever it
// was a few drags ago."
const DEFAULT_GRAIN: GrainVariant = { ...PENCIL_SOUND_VARIANT_3, tap: { ...PENCIL_SOUND_VARIANT_3.tap! } }
const DEFAULT_TUNING: PencilSoundTuning = { ...PENCIL_SOUND_TUNING }

// Live-tuning debug panel for every PencilSound knob (#153 round 13's tuning
// history — see PENCIL_SOUND_TUNING_LOG.md — moved from "Claude nudges a
// number, Ilya listens, repeat" to "Ilya drags a slider himself and hears it
// instantly"). Two independent sources feed the sliders:
//   - `grain` (GrainVariant fields — floor/depth/tap/brightnessScale/etc.)
//     goes through `pencilSoundRef.current.retune()`, which also regenerates
//     the WaveShaper curve/tap buffer for the two fields that don't
//     otherwise pick up a live mutation (see PencilSound.retune()'s doc).
//   - `PENCIL_SOUND_TUNING` (deadzone/speed-curve/global filter ranges) is a
//     single mutable exported singleton, mutated directly here, then
//     `retuneGlobals()` re-applies the two fields that don't have an
//     existing per-block call site (shelf center frequencies).
// Only meaningful for variant3 (the only recipe with tap/brightnessScale/
// qScale/etc.) — gated on that in Room/index.tsx alongside the
// pencilSoundTuning feature flag, same pattern as hapticGrain/tapToHideUI.
export function PencilSoundTuningPanel({ pencilSoundRef }: { pencilSoundRef: RefObject<PencilSound | null> }): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(true)
  // Seeded from the exported constant/singleton rather than the ref, since
  // both are read before Room's own effect has necessarily constructed the
  // PencilSound instance yet — grain is the *same object* PencilSound ends
  // up holding (Room/index.tsx passes PENCIL_SOUND_VARIANT_3 straight
  // through, no clone), so this is never stale once the instance exists.
  const [grain, setGrain] = useState<GrainVariant>({ ...PENCIL_SOUND_VARIANT_3 })
  const [tap, setTap] = useState({ ...PENCIL_SOUND_VARIANT_3.tap! })
  const [, forceTuningRerender] = useState(0)
  const [copied, setCopied] = useState(false)

  function patchGrain(patch: Partial<GrainVariant>): void {
    setGrain(g => ({ ...g, ...patch }))
    pencilSoundRef.current?.retune(patch)
  }

  function patchTap(patch: Partial<typeof tap>): void {
    const next = { ...tap, ...patch }
    setTap(next)
    pencilSoundRef.current?.retune({ tap: next })
  }

  function patchTuning<K extends keyof typeof PENCIL_SOUND_TUNING>(key: K, value: number): void {
    PENCIL_SOUND_TUNING[key] = value
    pencilSoundRef.current?.retuneGlobals()
    forceTuningRerender(n => n + 1) // PENCIL_SOUND_TUNING itself isn't state — force a redraw so the slider reflects the new value
  }

  function handleCopy(): void {
    const payload = { grain, tuning: { ...PENCIL_SOUND_TUNING } }
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
      .catch(() => {})
  }

  function handleReset(): void {
    const resetGrain: GrainVariant = { ...DEFAULT_GRAIN, tap: { ...DEFAULT_GRAIN.tap! } }
    setGrain(resetGrain)
    setTap({ ...DEFAULT_GRAIN.tap! })
    // A full-object patch (not a diff) so retune()'s curvePower/tap checks
    // above both trigger unconditionally — every knob goes back at once,
    // not just whichever ones happen to differ from default right now.
    pencilSoundRef.current?.retune(resetGrain)
    Object.assign(PENCIL_SOUND_TUNING, DEFAULT_TUNING)
    pencilSoundRef.current?.retuneGlobals()
    forceTuningRerender(n => n + 1)
  }

  return (
    <div className={styles.debugOverlay} style={{ pointerEvents: 'auto', maxWidth: 320 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={() => setCollapsed(c => !c)} style={{ font: 'inherit', color: 'inherit', background: 'none', border: '1px solid currentColor', borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}>
          {collapsed ? '▸' : '▾'} pencil sound tuning
        </button>
        <button type="button" onClick={handleCopy} style={{ font: 'inherit', color: 'inherit', background: 'none', border: '1px solid currentColor', borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}>
          {copied ? 'copied!' : 'copy config'}
        </button>
        <button type="button" onClick={handleReset} style={{ font: 'inherit', color: 'inherit', background: 'none', border: '1px solid currentColor', borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}>
          reset
        </button>
      </div>
      {!collapsed && (
        <div style={{ marginTop: 6, maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
          <Section title="noise texture">
            <Row label="floor" value={grain.floor} min={0} max={1} step={0.01} onChange={v => patchGrain({ floor: v })} />
            <Row label="depth" value={grain.depth} min={0} max={3} step={0.01} onChange={v => patchGrain({ depth: v })} />
            <Row label="curvePower" value={grain.curvePower} min={0.5} max={6} step={0.1} onChange={v => patchGrain({ curvePower: v })} />
            <Row label="minHz" value={grain.minHz} min={1} max={50} step={1} onChange={v => patchGrain({ minHz: v })} />
            <Row label="maxHz" value={grain.maxHz} min={50} max={400} step={1} onChange={v => patchGrain({ maxHz: v })} />
            <CheckRow label="useNormGain" checked={grain.useNormGain} onChange={v => patchGrain({ useNormGain: v })} />
            <Row label="brightnessScale" value={grain.brightnessScale ?? 1} min={0.05} max={1.5} step={0.01} onChange={v => patchGrain({ brightnessScale: v })} />
            <Row label="qScale" value={grain.qScale ?? 1} min={0.05} max={2} step={0.01} onChange={v => patchGrain({ qScale: v })} />
            <Row label="brightnessRangeBoost" value={grain.brightnessRangeBoost ?? 1} min={1} max={3} step={0.05} onChange={v => patchGrain({ brightnessRangeBoost: v })} />
          </Section>
          <Section title="band mix (mid / body / hiss)">
            <Row label="midMix" value={grain.midMix ?? 1} min={0} max={1} step={0.01} onChange={v => patchGrain({ midMix: v })} />
            <Row label="bodyMix" value={grain.bodyMix ?? 0} min={0} max={2} step={0.01} onChange={v => patchGrain({ bodyMix: v })} />
            <Row label="hissMix" value={grain.hissMix ?? 0} min={0} max={2} step={0.01} onChange={v => patchGrain({ hissMix: v })} />
            <Row label="bodyFreqHz (lowpass cutoff)" value={PENCIL_SOUND_TUNING.bodyFreqHz} min={80} max={1200} step={10} onChange={v => patchTuning('bodyFreqHz', v)} />
            <Row label="bodyQ" value={PENCIL_SOUND_TUNING.bodyQ} min={0.3} max={4} step={0.05} onChange={v => patchTuning('bodyQ', v)} />
            <Row label="bodyPresenceFloor" value={PENCIL_SOUND_TUNING.bodyPresenceFloor} min={0} max={1} step={0.01} onChange={v => patchTuning('bodyPresenceFloor', v)} />
            <Row label="hissLowHz" value={PENCIL_SOUND_TUNING.hissLowHz} min={2000} max={14000} step={100} onChange={v => patchTuning('hissLowHz', v)} />
            <Row label="hissHighHz" value={PENCIL_SOUND_TUNING.hissHighHz} min={4000} max={18000} step={100} onChange={v => patchTuning('hissHighHz', v)} />
          </Section>
          <Section title="shared excitation (mid/body coupled to grain)">
            <Row label="midGrainCoupling" value={grain.midGrainCoupling ?? 0} min={0} max={1} step={0.01} onChange={v => patchGrain({ midGrainCoupling: v })} />
            <Row label="bodyGrainCoupling" value={grain.bodyGrainCoupling ?? 0} min={0} max={1} step={0.01} onChange={v => patchGrain({ bodyGrainCoupling: v })} />
            <Row label="bodyGrainSmoothHz" value={PENCIL_SOUND_TUNING.bodyGrainSmoothHz} min={2} max={100} step={1} onChange={v => patchTuning('bodyGrainSmoothHz', v)} />
          </Section>
          <Section title="distance-driven grain (Experiment Б, #153 round 13)">
            <Row label="distanceGrainMix" value={grain.distanceGrainMix ?? 0} min={0} max={2} step={0.01} onChange={v => patchGrain({ distanceGrainMix: v })} />
            <Row label="distanceGrainSpacingPx" value={PENCIL_SOUND_TUNING.distanceGrainSpacingPx} min={1} max={40} step={0.5} onChange={v => patchTuning('distanceGrainSpacingPx', v)} />
            <Row label="distanceGrainDecaySeconds" value={PENCIL_SOUND_TUNING.distanceGrainDecaySeconds} min={0.0005} max={0.02} step={0.0005} onChange={v => patchTuning('distanceGrainDecaySeconds', v)} />
          </Section>
          <Section title="speed → loudness">
            <Row label="speedPresenceFloor" value={grain.speedPresenceFloor ?? 1} min={0} max={1} step={0.01} onChange={v => patchGrain({ speedPresenceFloor: v })} />
            <Row label="outputGainScale" value={grain.outputGainScale ?? 1} min={0} max={2} step={0.01} onChange={v => patchGrain({ outputGainScale: v })} />
            <Row label="masterSpeedExponent" value={PENCIL_SOUND_TUNING.masterSpeedExponent} min={0.2} max={4} step={0.05} onChange={v => patchTuning('masterSpeedExponent', v)} />
            <Row label="pressureFloor" value={PENCIL_SOUND_TUNING.pressureFloor} min={0} max={1} step={0.01} onChange={v => patchTuning('pressureFloor', v)} />
            <Row label="pressureScale" value={PENCIL_SOUND_TUNING.pressureScale} min={0} max={2} step={0.01} onChange={v => patchTuning('pressureScale', v)} />
            <Row label="masterOutputScale" value={PENCIL_SOUND_TUNING.masterOutputScale} min={0} max={1} step={0.01} onChange={v => patchTuning('masterOutputScale', v)} />
            <Row label="gainCeiling" value={PENCIL_SOUND_TUNING.gainCeiling} min={0} max={1} step={0.01} onChange={v => patchTuning('gainCeiling', v)} />
            <Row label="maxSpeed" value={PENCIL_SOUND_TUNING.maxSpeed} min={1} max={15} step={0.1} onChange={v => patchTuning('maxSpeed', v)} />
            <Row label="speedDeadzone" value={PENCIL_SOUND_TUNING.speedDeadzone} min={0} max={1} step={0.01} onChange={v => patchTuning('speedDeadzone', v)} />
          </Section>
          <Section title="touchdown tap">
            <Row label="tap.minGain" value={tap.minGain} min={0} max={1} step={0.01} onChange={v => patchTap({ minGain: v })} />
            <Row label="tap.maxGain" value={tap.maxGain} min={0} max={1} step={0.01} onChange={v => patchTap({ maxGain: v })} />
            <Row label="tap.freqHz" value={tap.freqHz} min={1} max={800} step={0.5} onChange={v => patchTap({ freqHz: v })} />
            <Row label="tap.decaySeconds" value={tap.decaySeconds} min={0.005} max={0.15} step={0.001} onChange={v => patchTap({ decaySeconds: v })} />
            <Row label="tap.noiseMix" value={tap.noiseMix} min={0} max={1} step={0.01} onChange={v => patchTap({ noiseMix: v })} />
            <Row label="tap.pressureCurve" value={tap.pressureCurve} min={0.5} max={4} step={0.1} onChange={v => patchTap({ pressureCurve: v })} />
          </Section>
          <Section title="bandpass Q / brightness range">
            <Row label="qBase" value={PENCIL_SOUND_TUNING.qBase} min={0.1} max={3} step={0.05} onChange={v => patchTuning('qBase', v)} />
            <Row label="qPressureScale" value={PENCIL_SOUND_TUNING.qPressureScale} min={0} max={3} step={0.05} onChange={v => patchTuning('qPressureScale', v)} />
            <Row label="minFreq" value={PENCIL_SOUND_TUNING.minFreq} min={100} max={3000} step={10} onChange={v => patchTuning('minFreq', v)} />
            <Row label="maxFreq" value={PENCIL_SOUND_TUNING.maxFreq} min={500} max={8000} step={10} onChange={v => patchTuning('maxFreq', v)} />
            <Row label="brightnessRamp" value={PENCIL_SOUND_TUNING.brightnessRamp} min={0.02} max={0.5} step={0.01} onChange={v => patchTuning('brightnessRamp', v)} />
            <Row label="carrierHighpassHz" value={PENCIL_SOUND_TUNING.carrierHighpassHz} min={20} max={500} step={5} onChange={v => patchTuning('carrierHighpassHz', v)} />
          </Section>
          <Section title="hardness / tilt shelves">
            <Row label="hardnessShelfFreq" value={PENCIL_SOUND_TUNING.hardnessShelfFreq} min={500} max={5000} step={10} onChange={v => patchTuning('hardnessShelfFreq', v)} />
            <Row label="hardnessShelfMinDb" value={PENCIL_SOUND_TUNING.hardnessShelfMinDb} min={-20} max={0} step={0.5} onChange={v => patchTuning('hardnessShelfMinDb', v)} />
            <Row label="hardnessShelfMaxDb" value={PENCIL_SOUND_TUNING.hardnessShelfMaxDb} min={0} max={20} step={0.5} onChange={v => patchTuning('hardnessShelfMaxDb', v)} />
            <Row label="lowShelfFreq" value={PENCIL_SOUND_TUNING.lowShelfFreq} min={50} max={1000} step={10} onChange={v => patchTuning('lowShelfFreq', v)} />
            <Row label="lowShelfMinDb" value={PENCIL_SOUND_TUNING.lowShelfMinDb} min={0} max={10} step={0.5} onChange={v => patchTuning('lowShelfMinDb', v)} />
            <Row label="lowShelfMaxDb" value={PENCIL_SOUND_TUNING.lowShelfMaxDb} min={0} max={15} step={0.5} onChange={v => patchTuning('lowShelfMaxDb', v)} />
            <Row label="tiltMaxDeg" value={PENCIL_SOUND_TUNING.tiltMaxDeg} min={10} max={90} step={1} onChange={v => patchTuning('tiltMaxDeg', v)} />
            <Row label="tiltLowpassMaxHz" value={PENCIL_SOUND_TUNING.tiltLowpassMaxHz} min={2000} max={15000} step={100} onChange={v => patchTuning('tiltLowpassMaxHz', v)} />
            <Row label="tiltLowpassMinHz" value={PENCIL_SOUND_TUNING.tiltLowpassMinHz} min={300} max={5000} step={50} onChange={v => patchTuning('tiltLowpassMinHz', v)} />
          </Section>
          <Section title="misc">
            <Row label="rampFast" value={PENCIL_SOUND_TUNING.rampFast} min={0.005} max={0.2} step={0.005} onChange={v => patchTuning('rampFast', v)} />
            <Row label="rampSlow" value={PENCIL_SOUND_TUNING.rampSlow} min={0.01} max={0.3} step={0.005} onChange={v => patchTuning('rampSlow', v)} />
            <Row label="idleMs" value={PENCIL_SOUND_TUNING.idleMs} min={20} max={300} step={5} onChange={v => patchTuning('idleMs', v)} />
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ opacity: 0.7, marginBottom: 2 }}>— {title} —</div>
      {children}
    </div>
  )
}

function decimals(step: number): number {
  const dot = step.toString().indexOf('.')
  return dot === -1 ? 0 : step.toString().length - dot - 1
}

function Row({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ minWidth: 150, flexShrink: 0 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: 90, flexShrink: 0 }} />
      <span style={{ minWidth: 46, textAlign: 'right' }}>{value.toFixed(decimals(step))}</span>
    </div>
  )
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ minWidth: 150, flexShrink: 0 }}>{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
    </div>
  )
}
