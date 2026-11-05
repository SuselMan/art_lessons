import { describe, expect, it } from 'vitest'
import type { BrushDefinition, ToolType } from '@grafetto/shared'

import { brushDefinitionForTool } from './brushDefinitions'
import { shapingForBrushDefinition, shapingForTool } from './dabShaping'
import { presetForBrushDefinition, presetForTool } from './resolvePreset'
import { PENCIL_GRADES, PENCIL_PRESETS } from './pencilPresets'

describe('one serialized brush definition for Grafetto models', () => {
  it('preserves every calibrated graphite grade as data', () => {
    for (const grade of PENCIL_GRADES) {
      const definition = brushDefinitionForTool('pencil', grade)
      expect(presetForBrushDefinition(definition)).toEqual(PENCIL_PRESETS[grade])
      expect(brushDefinitionForTool('pencil', grade)).toBe(definition)
    }
  })

  it.each<[ToolType, string]>([
    ['pencil', 'HB'], ['charcoal', 'vine'], ['marker', 'bullet'],
    ['marker', 'chisel'], ['liner', ''], ['brushPen', ''],
    ['eraser', 'HB'], ['smudge', 'HB'], ['digitalBrush', 'medium-round'],
  ])('executes %s after a JSON round trip without a room or tool owner', (tool, preset) => {
    const definition: BrushDefinition = JSON.parse(JSON.stringify(brushDefinitionForTool(tool, preset)))
    expect(presetForBrushDefinition(definition)).toEqual(presetForTool(tool, preset))
    const actual = shapingForBrushDefinition(definition), expected = shapingForTool(tool, preset)
    for (const pressure of [0, .1, .5, .9, 1]) {
      expect(actual.size(pressure, .4)).toBe(expected.size(pressure, .4))
      expect(actual.aspect(.4, pressure)).toBe(expected.aspect(.4, pressure))
      expect(actual.angle(36, 15, 25, .7, .3)).toBe(expected.angle(36, 15, 25, .7, .3))
    }
  })

  it('uses material configuration rather than looking up the toolbar again', () => {
    const definition = brushDefinitionForTool('pencil', 'HB')
    if (definition.model === 'digital') throw Error('Graphite definition required')
    const edited = {...definition, parameters: {...definition.parameters,
      deposit: {...definition.parameters.deposit, opacity: .73}}}
    expect(presetForBrushDefinition(edited).opacity).toBe(.73)
    expect(presetForTool('pencil', 'HB').opacity).toBe(.48)
  })

  it('uses digital descriptor curves without requiring a registered preset', () => {
    const definition = brushDefinitionForTool('digitalBrush', 'medium-round')
    if (definition.model !== 'digital') throw Error('Digital definition required')
    const edited: BrushDefinition = {...definition, parameters: {...definition.parameters,
      brush: {...definition.parameters.brush, sizeByPressure: [[0, .2], [1, .8]]}}}
    expect(shapingForBrushDefinition(edited).size(.5, 0)).toBe(.5)
  })
})
