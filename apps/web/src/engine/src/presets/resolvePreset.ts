// (#494) Which preset a tool draws with, out of PencilEngine (seam С12 of the
// survey). Pure lookups on (tool, preset string) — no GL, no engine state:
// the engine keeps one-line private wrappers (_resolvePreset, _dabSizeScale,
// _nibScallops, _resolveGrainMode) so its call sites read as before, and
// previewDabShape (the brush cursor) asks the same functions without an
// engine at all, which is what keeps the outline and the mark agreeing.

import type { ToolType } from '@grafetto/shared'
import { BRUSH_PEN_PRESET } from './brushPenPresets'
import { charcoalNibFromPreset, charcoalPresetFor, type CharcoalPreset } from './charcoalPresets'
import { digitalBrushPresetFor, digitalBrushScallops } from './digitalBrushPresets'
import { LINER_PRESET } from './linerPresets'
import { markerNibFromPreset } from './markerPresets'
import { GRAPHITE_GRAIN_DEFAULT, PENCIL_PRESETS, isPencilGrade, type PencilPreset } from './pencilPresets'
import { WATERCOLOR_PRESET, watercolorNibFromPreset } from './watercolorPresets'

// Marker (#250, ADR 004; split per-nib in "Ревизия v1.5" — #268): a real
// marker has no hardness *scale* the way graphite's grades do (same
// reasoning LINER_PRESET's own comment gives: one physical material, not a
// per-grade spread), but bullet and chisel are still two different
// physical tips, not just two dab shapes — a chisel's own wider contact
// area means the same opacity number would read as darker per pass than
// bullet's, purely from covering more area per dab, not from actually
// being "more marker." Still uncalibrated first-pass numbers (same "verify
// by eye and retune" status every other first-pass constant in this
// codebase carries):
//  - opacity: moderate for both, well under liner's near-saturated 0.95 —
//    ADR 004 §5 deliberately relies on the composite's own asymptotic
//    darkening ("2-3 passes darkens toward a limit") rather than a single
//    stroke reaching full coverage the way a fineliner's first pass does.
//    Chisel's is lower than bullet's — same "wider contact, lower local
//    dose" reasoning as MARKER_CHISEL_ASPECT_RATIO's own effect on area.
//  - hardness: inert since #330. The marker's edge is geometry now, resolved
//    over a fixed canvas-pixel ramp (MARKER_EDGE_AA_PX), so no branch it
//    reaches ever reads this; PencilPreset simply requires the field.
//  - sizeMultiplier: 1 for both — no calibrated size step to derive this
//    from yet, same "no fudge factor" reasoning as LINER_PRESET's own.
const MARKER_BULLET_PRESET: PencilPreset = { opacity: 0.45, hardness: 0.78, sizeMultiplier: 1.0 }
const MARKER_CHISEL_PRESET: PencilPreset  = { opacity: 0.36, hardness: 0.68, sizeMultiplier: 1.0 }

/** Which `PencilPreset` a tool draws with, given the per-stroke preset string.
 *
 *  A free function rather than an engine method (#547) because two callers need
 *  it and only one of them is the engine: `previewDabShape` is a pure query the
 *  brush cursor uses without a GL context, and it has to answer with the same
 *  numbers the renderer will use, or the outline and the mark disagree. */
export function presetForTool(tool: ToolType, presetName: string): PencilPreset {
  if (tool === 'liner') return LINER_PRESET
  if (tool === 'marker') return markerNibFromPreset(presetName) === 'chisel' ? MARKER_CHISEL_PRESET : MARKER_BULLET_PRESET
  // #454, ADR 009 §9: near-opaque covering ink. One flat preset for the tool
  // — its presetName slot carries the pressure response, not a nib or a
  // grade, so there is nothing here to branch on (brushPenPresets.ts).
  if (tool === 'brushPen') return BRUSH_PEN_PRESET
  // #468, ADR 011 §5 — same story as the brush pen one line up: no size
  // ladder and no hardness grade, so `presetName` carries the pressure
  // response instead and there is nothing here to branch on
  // (watercolorPresets.ts).
  if (tool === 'watercolor') return WATERCOLOR_PRESET
  // #547, ADR 013 — unlike every branch above, this one genuinely varies with
  // the preset string: it *is* the brush. hardness comes out of the frozen
  // descriptor and is read twice downstream — by the stamp shader and by the
  // spacing rule — which is why it is resolved here once rather than parsed
  // again at either site.
  if (tool === 'digitalBrush') return digitalBrushPresetFor(presetName)
  if (tool === 'charcoal') return charcoalPresetFor(presetName)
  return isPencilGrade(presetName) ? PENCIL_PRESETS[presetName] : PENCIL_PRESETS['HB']
}

/** The multiplier between `Dab.size` and the mark this tool actually leaves.
 *
 *  The eraser's 1.0 is not a default standing in for a missing preset: it is the
 *  value the renderer uses, because an eraser is sized as it is asked to be
 *  rather than carrying a grade's own width. */
export function renderSizeScale(tool: ToolType, presetName: string): number {
  return tool === 'eraser' ? 1.0 : presetForTool(tool, presetName).sizeMultiplier
}

/** (#489/#501) Whether this stroke's nib takes #485's scallop bound — see
 *  DabSystem.nibScallop for the whole argument, including why the marker's
 *  own 5:1 chisel deliberately does not.
 *
 *  A property of the *nib*, not of the tool, which is why it is a lookup on
 *  the preset string rather than a list of tool names: the same tool spaces
 *  its round nib one way and its elongated one another, and the round ones
 *  have shipped. Two stated here rather than one flag per tool for the reason
 *  the engine's _paintDabs inkMode comment gives: two switches for one question
 *  drift apart. */
export function nibScallops(tool: ToolType, presetName: string): boolean {
  if (tool === 'watercolor') return watercolorNibFromPreset(presetName) !== 'round'
  if (tool === 'charcoal') return charcoalNibFromPreset(presetName) === 'chisel'
  // #547 — asked of the brush rather than hardcoded, because here the answer
  // is a property of the preset: the round four scallop no more than
  // watercolor's round nib does, and 'flat' is a 4:1 tip whose silhouette dips
  // between stamps exactly as every other elongated one here.
  if (tool === 'digitalBrush') return digitalBrushScallops(presetName)
  return false
}

/** Which computeGrain variant (DAB_FRAG's u_grainMode) this draw should use.
 *
 *  Each material carries its own shipped default — GRAPHITE_GRAIN_DEFAULT
 *  (10, "Solid") for graphite, CHARCOAL_PRESETS.grain (3, "Streaky") per
 *  charcoal type — and each has its own independent dev override
 *  (`grainMode` / `charcoalGrainMode` engine options, passed here as
 *  `graphiteOverride` / `charcoalOverride`), which is `undefined` when that
 *  selector sits at "default". Two separate overrides rather than one shared
 *  flag specifically so auditioning a variant on one material doesn't
 *  disturb the other (#304 follow-up). */
export function resolveGrainMode(
  charcoal: CharcoalPreset | null,
  graphiteOverride: number | undefined,
  charcoalOverride: number | undefined,
): number {
  return charcoal
    ? charcoalOverride ?? charcoal.grain
    : graphiteOverride ?? GRAPHITE_GRAIN_DEFAULT
}
