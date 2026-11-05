// (#494) Which preset a tool draws with, out of PencilEngine (seam С12 of the
// survey). Pure lookups on (tool, preset string) — no GL, no engine state:
// the engine keeps one-line private wrappers (_resolvePreset, _dabSizeScale,
// _nibScallops, _resolveGrainMode) so its call sites read as before, and
// previewDabShape (the brush cursor) asks the same functions without an
// engine at all, which is what keeps the outline and the mark agreeing.

import type { BrushDefinition, ToolType } from '@grafetto/shared'
import { brushDefinitionForTool } from './brushDefinitions'
import { charcoalNibFromPreset, type CharcoalPreset } from './charcoalPresets'
import { digitalBrushScallops } from './digitalBrushPresets'
import { GRAPHITE_GRAIN_DEFAULT, type PencilPreset } from './pencilPresets'
import { watercolorNibFromPreset } from './watercolorPresets'

/** Material parameters come from the same serialized definition as geometry.
 * The tool/preset pair is retained only as the existing UI/log entry point. */
export function presetForTool(tool: ToolType, presetName: string): PencilPreset {
  return presetForBrushDefinition(brushDefinitionForTool(tool, presetName))
}

export function presetForBrushDefinition(definition: BrushDefinition): PencilPreset {
  if (definition.model !== 'digital') return definition.parameters.deposit
  const brush = definition.parameters.brush
  return {opacity: brush.opacity, hardness: brush.tip.hardness, sizeMultiplier: 1 / Math.max(brush.tip.aspect, 1)}
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
