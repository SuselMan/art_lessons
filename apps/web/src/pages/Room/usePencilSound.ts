import { useEffect, useRef, type RefObject } from 'react'

import type { PaperType } from '@grafetto/shared'

import { PENCIL_PRESETS, type PencilGradeName } from '../../engine'
import { PencilSound, TOOL_SOUND_CONFIGS } from '../../lib/sound/PencilSound'
import { useRoomStore } from '../../stores/roomStore'
import { useSettingsStore } from '../../stores/settingsStore'

/** (#493) Everything the pencil sound is, in one place.
 *
 *  Four effects that used to sit in the middle of Room's tool-sync block,
 *  interleaved with the ones that push tool state into the engine. They read
 *  the same values — which tool, which grade — and are otherwise unrelated to
 *  them: one set drives a canvas, the other an AudioContext, and the only
 *  reason they were neighbours is that both happen when the tool changes.
 *
 *  The handle is a ref rather than a value on purpose: the pointer callbacks
 *  inside the engine's mount effect call `start`/`update`/`stop` on it many
 *  times a second, from a closure built once per room. A value would have to
 *  be threaded back through that closure on every change; a ref is read at the
 *  moment of the call.
 *
 *  One consequence of handing it back rather than keeping it in Room:
 *  `react-hooks/exhaustive-deps` only knows a ref is stable where it can see
 *  the `useRef` call, so it now asks for `pencilSoundRef.current` in the
 *  dependencies of Room's engine-mount effect. That advice is wrong — taking
 *  it would rebuild the engine every time the sound instance changed — and
 *  there is a note at that dependency array saying so. Declaring the ref in
 *  Room instead was tried and is worse: it moves the same misunderstanding
 *  here and multiplies it, one warning per effect.
 *
 *  `paper` is `undefined` until the room's configuration arrives — the graph
 *  is not built before then, since which paper is under the pencil is half of
 *  what it sounds like. */
export function usePencilSound(paper: PaperType | undefined): RefObject<PencilSound | null> {
  const soundRef = useRef<PencilSound | null>(null)
  const soundEnabled = useSettingsStore(s => s.soundEnabled)
  const soundVolume = useSettingsStore(s => s.soundVolume)
  const drawingTool = useRoomStore(s => s.drawingTool)
  const pencilGrade = useRoomStore(s => s.toolSettings.pencil.grade) as PencilGradeName

  // (#321) Sound is a live setting, so its whole lifetime hangs off this one
  // effect rather than off the engine's: turning it on builds the graph,
  // turning it off tears it down (an AudioContext left open holds a real
  // audio device). Deliberately not keeping a silent instance around while
  // off — the graph is lazy anyway (PencilSound.ensureGraph runs on the first
  // stroke), so there is nothing to preserve, and "off" should mean nothing
  // is holding the speaker.
  //
  // Tool and grade are read at build time rather than being dependencies:
  // both have their own effects that push changes into the existing instance
  // (setActiveGrain/setHardness below), and rebuilding the graph on every
  // tool switch would drop the AudioContext mid-lesson.
  //
  // (#461) Keyed on the paper rather than on `config`, for the same reason the
  // mount-engine effect is: a rename is not a reason to drop an AudioContext
  // mid-lesson either.
  useEffect(() => {
    if (!soundEnabled || paper === undefined) return
    const { drawingTool: currentTool, toolSettings: currentSettings } = useRoomStore.getState()
    const grain = TOOL_SOUND_CONFIGS[currentTool]
    if (!grain) return
    const sound = new PencilSound(paper, grain)
    sound.setHardness(PENCIL_PRESETS[currentSettings.pencil.grade as PencilGradeName].hardness)
    sound.setVolume(useSettingsStore.getState().soundVolume)
    soundRef.current = sound
    return () => {
      sound.destroy()
      if (soundRef.current === sound) soundRef.current = null
    }
  }, [soundEnabled, paper])

  useEffect(() => {
    soundRef.current?.setHardness(PENCIL_PRESETS[pencilGrade].hardness)
  }, [pencilGrade])

  useEffect(() => {
    soundRef.current?.setVolume(soundVolume)
  }, [soundVolume])

  // #253: each tool has its own recipe; swapping it keeps the one graph and
  // only changes what drives it (see PencilSound.setActiveGrain).
  useEffect(() => {
    const grain = TOOL_SOUND_CONFIGS[drawingTool]
    if (grain) soundRef.current?.setActiveGrain(grain)
  }, [drawingTool])

  return soundRef
}
