import { useState, type RefObject } from 'react'

import {
  CHARCOAL_FEEL, CHARCOAL_FEEL_SLIDERS, PENCIL_TILT, PENCIL_TILT_SLIDERS, SMUDGE_GRAIN, SMUDGE_GRAIN_SLIDERS,
  type CharcoalFeelConfig, type HapticGrainStats, type PencilEngineAPI, type PencilTiltConfig,
  type SmudgeGrainConfig, type StrokeDebugStats,
} from '../../engine'
import type { PencilSound } from '../../lib/PencilSound'
import { clearDiagLogs, getDiagLogs } from '../../lib/diagLog'
import { TAP_MOVE_THRESHOLD_PX } from '../../lib/tapThreshold'
import type { DrawingTool, EditorTool } from '../../stores/slices/toolSlice'
import { PencilSoundTuningPanel } from './PencilSoundTuningPanel'
import type { TapDebugInfo } from './useTapToggle'
import styles from './Room.module.css'

export interface DebugStackProps {
  /** The "Debug overlay" feature flag (#91, #100). */
  debugEnabled: boolean
  /** The haptic paper-grain experiment's flag. */
  hapticGrainEnabled: boolean
  /** Minimal UI's tap diagnostic — debug flag *and* minimal UI (#321). */
  tapDebugEnabled: boolean
  /** PencilSound's live-tuning panel (#153) — flag *and* sound on. */
  pencilSoundTuningEnabled: boolean
  strokeStats: StrokeDebugStats | null
  hapticStats: HapticGrainStats | null
  tapDebug: TapDebugInfo | null
  engineRef: RefObject<PencilEngineAPI | null>
  pencilSoundRef: RefObject<PencilSound | null>
  /** The tool in hand — the tuning blocks show for the tools they tune. */
  tool: EditorTool
  /** The drawing tool, which is what PencilSound voices. */
  drawingTool: DrawingTool
}

/** (#493) The developer overlays in the corner of the room: log capture,
 *  stroke latency, the paper-fill and tilt/grain tuning sliders, haptic and
 *  tap diagnostics, and PencilSound's tuning panel. Dev-only, and English on
 *  purpose (see the i18n rule in CLAUDE.md).
 *
 *  Out of Room's render, with the tuning sliders' own state: nothing else
 *  reads it. The engine keeps whatever was last pushed into it; these hold
 *  only what the sliders show.
 *
 *  The overlays share one positioning stack (.debugStack) so having more than
 *  one flag on at once doesn't render them on top of each other at the same
 *  fixed corner — exactly what happened while chasing #154's latency
 *  regression with hapticGrain still on from earlier testing. */
export function DebugStack({
  debugEnabled, hapticGrainEnabled, tapDebugEnabled, pencilSoundTuningEnabled,
  strokeStats, hapticStats, tapDebug, engineRef, pencilSoundRef, tool, drawingTool,
}: DebugStackProps): React.JSX.Element | null {
  // Dev-only live tuning (see PencilEngineAPI.setPaperFillThreshold) — a
  // debug-overlay slider that calls straight through to the engine on every
  // drag, no Save/reload round-trip: this one's meant to be dragged and
  // felt out in real time while actually drawing, not toggled once and
  // reloaded like every other Settings-panel control. Not persisted —
  // purely a session tuning aid; once a value's picked, it becomes the
  // engine's own hardcoded default instead of staying a runtime knob.
  const [paperFillThreshold, setPaperFillThresholdState] = useState(0)
  // Companion slider (see PencilEngineAPI.setPaperFillCap) — hard ceiling
  // on how far a single dab's own fill can push paperCatch toward 1.0.
  // Threshold alone couldn't express "impossible to fully flatten in one
  // pass, only through repeated passes" — some pressure always fully
  // triggered it eventually, no matter how close the threshold sat to 1.0.
  const [paperFillCap, setPaperFillCapState] = useState(0.35)
  // #305: charcoal's tilt ladder, seeded from the engine module's own current
  // values rather than a second hardcoded copy here — CHARCOAL_FEEL is the one
  // source of truth, and these sliders only ever push deltas back into it.
  const [charcoalFeel, setCharcoalFeelState] = useState<CharcoalFeelConfig>(() => ({ ...CHARCOAL_FEEL }))
  // #389: graphite's tilt curve, seeded and pushed the same way charcoal's
  // ladder above is.
  const [pencilTilt, setPencilTiltState] = useState<PencilTiltConfig>(() => ({ ...PENCIL_TILT }))
  // Smudge's own grain knobs (smudgeGrain.ts). Unlike the two above these are
  // read at paint time, so they land on the next *dab*, not the next stroke.
  const [smudgeGrain, setSmudgeGrainState] = useState<SmudgeGrainConfig>(() => ({ ...SMUDGE_GRAIN }))
  if (!(debugEnabled || hapticGrainEnabled || tapDebugEnabled || pencilSoundTuningEnabled)) return null

  return (
    <div className={styles.debugStack}>
      {/* On-device log capture (see lib/diagLog.ts) — for field reports
          from a device with no attached inspector (Android tablets,
          mainly): diagLog() calls throughout the tap-toggle/viewport
          gesture code (and roomContentReady transitions) feed an
          in-memory ring buffer; this copies it to the clipboard so it
          can be pasted back in chat instead of needing devtools. */}
      <div className={styles.debugOverlay} style={{ pointerEvents: 'auto' }}>
        <button
          type="button"
          onClick={() => { void navigator.clipboard.writeText(getDiagLogs()) }}
          style={{ font: 'inherit', color: 'inherit', background: 'none', border: '1px solid currentColor', borderRadius: 4, padding: '1px 6px', cursor: 'pointer', marginRight: 6 }}
        >
          copy logs
        </button>
        <button
          type="button"
          onClick={() => clearDiagLogs()}
          style={{ font: 'inherit', color: 'inherit', background: 'none', border: '1px solid currentColor', borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}
        >
          clear logs
        </button>
      </div>
      {/* Device performance readout (#91, extended #104) — ?debug=1
          only. Shows the last completed stroke's real input-sample
          rate, paint cost, and end-to-end (PointerEvent.timeStamp →
          _display()) input latency, so a tablet with no attached
          devtools can still report hard numbers. */}
      {debugEnabled && (
        <div className={styles.debugOverlay}>
          {strokeStats ? (
            <>
              {/* Trimmed to just the two latency lines while chasing
                  #154's DPR regression (see chat) — events/gap/dabs/
                  render were crowding out the numbers that actually
                  matter right now. Full stats are still in
                  StrokeDebugStats if needed again. */}
              <div>e2e latency: avg {strokeStats.avgE2eLatencyMs.toFixed(1)}ms / max {strokeStats.maxE2eLatencyMs.toFixed(1)}ms</div>
              <div>tip latency: avg {strokeStats.avgTipLatencyMs.toFixed(1)}ms / max {strokeStats.maxTipLatencyMs.toFixed(1)}ms</div>
              {/* rAF-anchored real display latency (replaces a prior
                  attempt at this via the browser's Event Timing API —
                  PerformanceObserver({type:'event'}) — which never
                  populated: the spec excludes exactly the continuous
                  event types we cared about, pointermove/touchmove/etc,
                  from ever generating an 'event' entry at all, so it
                  silently reported zero samples for the entire life of
                  that approach. See StrokeDebugStats.avgFrameLatencyMs
                  for what this actually measures and why it's a better
                  proxy for "did it hit the screen yet" than the two
                  JS-only lines above. */}
              <div>frame latency: avg {strokeStats.avgFrameLatencyMs.toFixed(1)}ms / max {strokeStats.maxFrameLatencyMs.toFixed(1)}ms</div>
            </>
          ) : (
            <div>draw a stroke to see stats</div>
          )}
          {/* Live paper-fill-threshold tuning (see chat) — applies to
              the very next dab painted, no Save/reload. */}
          {/* pointerEvents: 'auto' overrides .debugStack's own
              pointer-events: none (deliberate there — an informational
              overlay must never block drawing/touch on the canvas
              beneath it) — this is the one real control in that stack,
              so it alone needs to opt back in or no pointer/touch input
              ever reaches it at all. */}
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
            <span>fill @</span>
            <input
              type="range"
              min={0}
              max={0.999}
              step={0.001}
              value={paperFillThreshold}
              onChange={e => {
                const v = Number(e.target.value)
                setPaperFillThresholdState(v)
                engineRef.current?.setPaperFillThreshold(v)
              }}
              style={{ width: 90 }}
            />
            <span>{paperFillThreshold.toFixed(3)}</span>
          </div>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
            <span>fill cap</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={paperFillCap}
              onChange={e => {
                const v = Number(e.target.value)
                setPaperFillCapState(v)
                engineRef.current?.setPaperFillCap(v)
              }}
              style={{ width: 90 }}
            />
            <span>{paperFillCap.toFixed(2)}</span>
          </div>

          {/* #305: charcoal's tilt ladder. Only shown while charcoal is the
              active tool — these knobs do nothing for anything else, and
              the overlay is already crowded. Takes effect on the next
              stroke (shape is baked per dab at record time), so tuning is
              "draw, nudge, draw again" rather than live-morphing what's
              already on the page. */}
          {tool === 'charcoal' && (
            <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 6 }}>
              <div style={{ opacity: 0.7 }}>charcoal tilt (next stroke)</div>
              {CHARCOAL_FEEL_SLIDERS.map(s => (
                <div key={s.key} style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
                  <span style={{ width: 78 }}>{s.label}</span>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={charcoalFeel[s.key]}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setCharcoalFeelState(prev => ({ ...prev, [s.key]: v }))
                      engineRef.current?.setCharcoalFeel({ [s.key]: v })
                    }}
                    style={{ width: 90 }}
                  />
                  <span>{charcoalFeel[s.key].toFixed(s.step < 1 ? 2 : 0)}</span>
                </div>
              ))}
            </div>
          )}

          {/* How the smudge imprint settles into the paper's tooth
              (smudgeGrain.ts). Smudge only — the term exists nowhere
              else. `bite` at 0 is exactly the flat deposit this had
              before, which is what makes the pair an A/B rather than a
              one-way change; takes effect on the next dab, so it can be
              slid mid-drawing and compared on the same page. */}
          {tool === 'smudge' && (
            <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 6 }}>
              <div style={{ opacity: 0.7 }}>smudge grain (next dab)</div>
              {SMUDGE_GRAIN_SLIDERS.map(s => (
                <div key={s.key} style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
                  <span style={{ width: 78 }}>{s.label}</span>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={smudgeGrain[s.key]}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setSmudgeGrainState(prev => ({ ...prev, [s.key]: v }))
                      engineRef.current?.setSmudgeGrain({ [s.key]: v })
                    }}
                    style={{ width: 90 }}
                  />
                  <span>{smudgeGrain[s.key].toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {/* #389: graphite's tilt curve. Shown for every tool that rides
              PENCIL_DAB_SHAPING — eraser and smudge share the geometry, so
              the knobs are live for them too even though the lightening
              one only reaches graphite's own deposit. Same "next stroke"
              semantics as charcoal's block above. */}
          {(tool === 'pencil' || tool === 'eraser' || tool === 'smudge') && (
            <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 6 }}>
              <div style={{ opacity: 0.7 }}>pencil tilt (next stroke)</div>
              {PENCIL_TILT_SLIDERS.map(s => (
                <div key={s.key} style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
                  <span style={{ width: 78 }}>{s.label}</span>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={pencilTilt[s.key]}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setPencilTiltState(prev => ({ ...prev, [s.key]: v }))
                      engineRef.current?.setPencilTilt({ [s.key]: v })
                    }}
                    style={{ width: 90 }}
                  />
                  <span>{pencilTilt[s.key].toFixed(s.step < 1 ? 2 : 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Haptic-grain experiment diagnostic — always shown while the flag
          is on (not gated behind ?debug=1) so it's visible on a tablet
          with no attached devtools while chasing "vibrates from the test
          button but not while drawing" (see chat). cellsEntered=0 after
          drawing means the stroke never reached HapticGrain.sample() at
          all; bumpsHit=0 means it's reaching it but the density
          threshold never trips; vibrateOk < bumpsHit is now expected
          (see HapticGrain's minIntervalMs) — most grid hits during a
          real stroke land inside the same throttle window, so only some
          of them reach an actual navigator.vibrate() call; a call that
          browser-rejects instead of being throttled is indistinguishable
          here, but that was never observed while diagnosing this. */}
      {hapticGrainEnabled && (
        <div className={styles.debugOverlay}>
          {hapticStats ? (
            <>
              <div>cells entered: {hapticStats.cellsEntered}</div>
              <div>bumps hit: {hapticStats.bumpsHit}</div>
              <div>vibrate() ok: {hapticStats.vibrateOk}</div>
            </>
          ) : (
            <div>draw a stroke to see haptic stats</div>
          )}
        </div>
      )}

      {/* Minimal-UI tap diagnostic — see TapDebugInfo's docstring (chat:
          "works on Samsung, not on a Surface"). maxDistPx close to or
          over the threshold means that device's digitizer reports
          enough jitter on a stationary tap to read as a drag;
          concurrentTouches > 1 means a second touch (real or a stray
          palm contact) was down at the same time, disqualifying it as a
          single-finger tap. */}
      {tapDebugEnabled && (
        <div className={styles.debugOverlay}>
          {tapDebug ? (
            <>
              <div>pointerType: {tapDebug.pointerType}</div>
              <div>max move: {tapDebug.maxDistPx.toFixed(1)}px (threshold {TAP_MOVE_THRESHOLD_PX}px)</div>
              <div>concurrent touches: {tapDebug.concurrentTouches}</div>
              <div>was tap: {String(tapDebug.wasTap)}</div>
              <div>on control: {String(tapDebug.onControl)}</div>
              <div>taps: {tapDebug.tapsSoFar}/{tapDebug.tapsRequired}</div>
            </>
          ) : (
            <div>tap the canvas to see tap stats</div>
          )}
        </div>
      )}

      {pencilSoundTuningEnabled && <PencilSoundTuningPanel pencilSoundRef={pencilSoundRef} tool={drawingTool} />}
    </div>
  )
}
