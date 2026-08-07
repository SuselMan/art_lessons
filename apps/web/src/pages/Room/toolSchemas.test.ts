import { describe, expect, it } from 'vitest'

import {
  loadToolSettings, saveToolSettings, defaultToolSettings,
  LINER_SIZE_LABELS, linerSizeToPx, stepLinerSize,
  TOOL_SCHEMAS, COLOR_CAPABLE_TOOLS, isColorCapableTool, getToolColor,
  MAX_TOOL_SIZE_PX, toolSizeRange, degreesMinutesParse, formatDegreesMinutes,
  type UiToolId, type SettingValueType,
} from './toolSchemas'
import { TRANSFORM_MODES } from './transformMath'
import { expScale } from '../../components/PrecisionSlider/sliderScale'
import { DRAWING_TOOLS, NON_DRAWING_TOOLS } from '../../stores/slices/toolSlice'
import type { KeyValueStorage } from '../../lib/roomStorage'

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
  }
}

describe('toolSchemas load/save', () => {
  it('falls back to schema defaults when nothing is stored', () => {
    expect(loadToolSettings(memoryStorage(), 'room1')).toEqual(defaultToolSettings())
  })

  it('round-trips a saved value', () => {
    const storage = memoryStorage()
    const settings = defaultToolSettings()
    settings.pencil = { ...settings.pencil, size: 40, opacity: 0.5, grade: '2B' }
    settings.eraser = { ...settings.eraser, size: 60, opacity: 0.8 }
    saveToolSettings(storage, 'room1', settings)
    expect(loadToolSettings(storage, 'room1')).toEqual(settings)
  })

  it('keeps settings scoped per room', () => {
    const storage = memoryStorage()
    const settings = defaultToolSettings()
    settings.pencil = { ...settings.pencil, size: 40 }
    saveToolSettings(storage, 'room1', settings)
    expect(loadToolSettings(storage, 'room2')).toEqual(defaultToolSettings())
  })

  it('clamps an out-of-range numberRange value instead of trusting it', () => {
    const storage = memoryStorage()
    const settings = defaultToolSettings()
    settings.pencil = { ...settings.pencil, size: 99999, opacity: 5 }
    settings.eraser = { ...settings.eraser, size: -10, opacity: -1 }
    saveToolSettings(storage, 'room1', settings)
    const loaded = loadToolSettings(storage, 'room1')
    expect(loaded.pencil.size).toBe(MAX_TOOL_SIZE_PX)
    expect(loaded.pencil.opacity).toBe(1)
    expect(loaded.eraser.size).toBe(1)
    expect(loaded.eraser.opacity).toBe(0)
  })

  it('falls back to the default for a non-numeric field rather than throwing', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', JSON.stringify({
      v: 1, data: { toolSettings: { pencil: { size: 'huge' } } },
    }))
    expect(loadToolSettings(storage, 'room1')).toEqual(defaultToolSettings())
  })

  it('falls back to the default for an unknown enum option', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', JSON.stringify({
      v: 1, data: { toolSettings: { pencil: { grade: '9000B' } } },
    }))
    expect(loadToolSettings(storage, 'room1').pencil.grade).toBe(defaultToolSettings().pencil.grade)
  })

  it('ignores malformed JSON', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', '{not json')
    expect(loadToolSettings(storage, 'room1')).toEqual(defaultToolSettings())
  })

  it('falls back to the default for an unrecognized liner size label', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', JSON.stringify({
      v: 1, data: { toolSettings: { liner: { size: '999' } } },
    }))
    expect(loadToolSettings(storage, 'room1').liner.size).toBe(defaultToolSettings().liner.size)
  })
})

describe('toolSizeRange (#336)', () => {
  it('reports the schema range for every tool with a continuous px size', () => {
    for (const toolId of ['pencil', 'colorPencil', 'charcoal', 'marker', 'eraser', 'smudge'] as const) {
      expect(toolSizeRange(toolId)).toEqual({
        min: expect.any(Number) as number,
        max: MAX_TOOL_SIZE_PX,
      })
    }
  })

  it('returns null where there is no numeric size to step — the size hotkeys must not invent one', () => {
    expect(toolSizeRange('liner')).toBeNull() // fixed mm ladder (ADR 003)
    expect(toolSizeRange('ruler')).toBeNull() // no settings at all
    expect(toolSizeRange('eyedropper')).toBeNull()
  })
})

// (#405) Everything selectable draws its settings panel straight from
// TOOL_SCHEMAS (Room's `settingsToolId` is now just the selected tool), so the
// schema has to hold up its end for the four tools that used to be modes.
describe('the selectable tools all have a panel to show (#405)', () => {
  it('gives every selectable tool a schema entry', () => {
    for (const toolId of [...DRAWING_TOOLS, ...NON_DRAWING_TOOLS]) {
      expect(TOOL_SCHEMAS[toolId], toolId).toBeTruthy()
    }
  })

  // The ruler and the grid have nothing but these toggles, so an empty quick
  // column beside a selected one would read as a tool that failed to load.
  it('puts the ruler and grid controls, which are all they have, in the quick column', () => {
    for (const toolId of ['ruler', 'grid'] as const) {
      const quick = Object.entries(TOOL_SCHEMAS[toolId]).filter(([, d]) => d.quickAccess)
      expect(quick.length, toolId).toBe(Object.keys(TOOL_SCHEMAS[toolId]).length)
      expect(quick.length).toBeGreaterThan(0)
    }
  })

  // `show` is a master switch (a hidden ruler neither snaps nor moves). The
  // ruler's two defaults preserve the behaviour that existed before they were
  // settings — snapping was unconditional. The grid's does not: it used to
  // start off because its toolbar button *was* the switch, and now that the
  // button selects a tool instead, off would mean the first press of it does
  // nothing observable at all (the grid has no gesture of its own until #406).
  it('defaults the ruler to shown and snapping, and the grid to shown', () => {
    const defaults = defaultToolSettings()
    expect(defaults.ruler).toEqual({ show: true, snap: true })
    expect(defaults.grid).toEqual({ show: true })
  })
})

describe('color-capable tools', () => {
  // The guard against COLOR_CAPABLE_TOOLS (a hand-written list, so it can
  // carry a union type) drifting from the schemas it claims to describe —
  // add a tool with a `color` field and forget the list, and this fails.
  it('lists exactly the tools whose schema declares a color field', () => {
    const fromSchemas = (Object.keys(TOOL_SCHEMAS) as UiToolId[])
      .filter(id => Object.values(TOOL_SCHEMAS[id]).some(d => d.valueType.kind === 'color'))
    expect([...COLOR_CAPABLE_TOOLS].sort()).toEqual(fromSchemas.sort())
  })

  it('rejects tools that only modify existing pixels or have no settings', () => {
    expect(isColorCapableTool('eraser')).toBe(false)
    expect(isColorCapableTool('smudge')).toBe(false)
    expect(isColorCapableTool('eyedropper')).toBe(false)
    expect(isColorCapableTool('ruler')).toBe(false)
  })

  it('reads each color tool\'s own slot, not a shared one', () => {
    const settings = defaultToolSettings()
    settings.liner = { ...settings.liner, color: [0.1, 0.2, 0.3] }
    expect(getToolColor(settings, 'liner')).toEqual([0.1, 0.2, 0.3])
    expect(getToolColor(settings, 'pencil')).toEqual(TOOL_SCHEMAS.pencil.color.default)
    expect(getToolColor(settings, 'marker')).toEqual(TOOL_SCHEMAS.marker.color.default)
  })

  it('falls back to the schema default when the stored value is not an RGB triple', () => {
    const settings = defaultToolSettings()
    settings.marker = { ...settings.marker, color: 0.5 }
    expect(getToolColor(settings, 'marker')).toEqual(TOOL_SCHEMAS.marker.color.default)
  })
})

describe('liner size helpers (#243, ADR 003)', () => {
  it('LINER_SIZE_LABELS matches the engine\'s own fixed mm ladder', () => {
    expect(LINER_SIZE_LABELS).toEqual(['0.1', '0.2', '0.3', '0.5', '0.8'])
  })

  describe('linerSizeToPx', () => {
    it('maps every known label to a positive, ascending px diameter', () => {
      const pxValues = LINER_SIZE_LABELS.map(linerSizeToPx)
      expect(pxValues.every(px => px > 0)).toBe(true)
      for (let i = 1; i < pxValues.length; i++) expect(pxValues[i]).toBeGreaterThan(pxValues[i - 1])
    })

    it('falls back to the smallest size for an unrecognized label', () => {
      expect(linerSizeToPx('nonsense')).toBe(linerSizeToPx(LINER_SIZE_LABELS[0]))
    })
  })

  describe('stepLinerSize', () => {
    it('moves one notch up/down the ladder', () => {
      expect(stepLinerSize('0.3', 1)).toBe('0.5')
      expect(stepLinerSize('0.3', -1)).toBe('0.2')
    })

    it('clamps at either end instead of wrapping', () => {
      expect(stepLinerSize(LINER_SIZE_LABELS[0], -1)).toBe(LINER_SIZE_LABELS[0])
      expect(stepLinerSize(LINER_SIZE_LABELS.at(-1)!, 1)).toBe(LINER_SIZE_LABELS.at(-1))
    })

    it('starts from the bottom of the ladder for an unrecognized current value', () => {
      expect(stepLinerSize('nonsense', 1)).toBe(LINER_SIZE_LABELS[1])
    })
  })
})

describe('option pickers (#335, #391)', () => {
  const selectFields = (Object.keys(TOOL_SCHEMAS) as UiToolId[]).flatMap(toolId =>
    Object.entries(TOOL_SCHEMAS[toolId])
      .filter(([, d]) => d.uiControls[0] === 'select')
      .map(([key, d]) => ({ toolId, key, descriptor: d })),
  )

  it('covers exactly the fields that are picked from a list of choices', () => {
    expect(selectFields.map(f => `${f.toolId}.${f.key}`).sort()).toEqual(
      // Tool *types* — what the tool draws (#335) …
      ['charcoal.type', 'colorPencil.grade', 'marker.nib', 'pencil.grade',
        // … and the transform tool's working mode (#391), which is a mode
        // rather than a material but is chosen the same way.
        'transform.mode',
        // … and the tilt response (#409), on exactly the five tools whose dab
        // geometry reads the tilt curve. Spelled out rather than derived, so
        // adding the field to a sixth tool — a liner, say, whose shape ignores
        // tilt entirely — has to be a deliberate edit here.
        'charcoal.tiltResponse', 'colorPencil.tiltResponse', 'eraser.tiltResponse',
        'pencil.tiltResponse', 'smudge.tiltResponse'].sort(),
    )
  })

  // The picker's whole point is showing what an option draws, so a missing
  // asset is a blank row rather than a visible fallback — worth a test, since
  // the images are picked up from disk by filename (toolTypeImages.ts) and
  // nothing else would notice a renamed or forgotten file. It matters just as
  // much for the mode picker, whose quick-panel button has room for the
  // preview and nothing else.
  it('gives every option of every select field an image, an icon or a curve', () => {
    for (const { toolId, key, descriptor } of selectFields) {
      const { valueType } = descriptor
      expect(valueType.kind).toBe('enumOptions')
      if (valueType.kind !== 'enumOptions') continue
      for (const option of valueType.options) {
        // #409 added the third kind: a response is a function, so its preview
        // is its own curve rather than a picture of a mark. Two samples is the
        // least that draws a line at all (curveGraphPoints returns '' below
        // that) — an option carrying one point would render an empty box, the
        // exact failure this test exists to catch.
        const curve = descriptor.optionCurves?.[option]
        const visual = descriptor.optionImages?.[option] ?? descriptor.optionIcons?.[option]
          ?? (curve && curve.length >= 2 ? 'curve' : undefined)
        expect(visual, `${toolId}.${key} option "${option}" has no image, icon or curve`).toBeTruthy()
      }
    }
  })

  // Grades and mm widths are notation and stay untranslated on purpose; a
  // word is a word in some language, and the schema has to say which key
  // holds it (see SettingField's optionLabel).
  it('translates every option whose value is a word rather than notation', () => {
    for (const option of TRANSFORM_MODES) {
      expect(TOOL_SCHEMAS.transform.mode.optionLabelKeys?.[option], option).toBeTruthy()
    }
  })
})

describe('transient settings (#391)', () => {
  // A deliberate list, like the exponential-scale one above: opting a field
  // out of persistence is a product decision per field, so it should be
  // impossible to add one without this test noticing.
  it('exempts exactly the transform tool\'s mode and proportions lock', () => {
    const transient = (Object.keys(TOOL_SCHEMAS) as UiToolId[]).flatMap(toolId =>
      Object.entries(TOOL_SCHEMAS[toolId]).filter(([, d]) => d.transient).map(([key]) => `${toolId}.${key}`))
    expect(transient.sort()).toEqual(['transform.keepProportions', 'transform.mode'])
  })

  it('starts a transient field at its default however the room was left', () => {
    const storage = memoryStorage()
    const settings = defaultToolSettings()
    settings.transform = { mode: 'rotateSkew', keepProportions: false }
    settings.pencil = { ...settings.pencil, size: 40 }
    saveToolSettings(storage, 'room1', settings)

    const loaded = loadToolSettings(storage, 'room1')
    expect(loaded.transform).toEqual(defaultToolSettings().transform)
    expect(loaded.pencil.size).toBe(40) // …while its neighbours are still remembered
  })

  it('never writes a transient field to storage at all', () => {
    const storage = memoryStorage()
    const settings = defaultToolSettings()
    settings.transform = { mode: 'rotateSkew', keepProportions: false }
    saveToolSettings(storage, 'room1', settings)
    expect(storage.getItem('al_room_settings:room1')).not.toContain('rotateSkew')
  })

  // The other half of the same guarantee: a value left behind by a build that
  // predates the flag (or by a field that stops being transient later) must
  // not come back to life on load.
  it('ignores a transient value already sitting in storage', () => {
    const storage = memoryStorage()
    storage.setItem('al_room_settings:room1', JSON.stringify({
      v: 1, data: { toolSettings: { transform: { mode: 'rotateSkew' } } },
    }))
    expect(loadToolSettings(storage, 'room1').transform.mode).toBe('free')
  })
})

describe('degreesMinutesParse (#335)', () => {
  it('round-trips what formatDegreesMinutes produces', () => {
    for (const deg of [0, 45, 45.5, 180.25, 359.75]) {
      expect(degreesMinutesParse(formatDegreesMinutes(deg))).toBeCloseTo(deg, 6)
    }
  })

  it('reads a bare number as degrees', () => {
    expect(degreesMinutesParse('45')).toBe(45)
    expect(degreesMinutesParse('45.5')).toBe(45.5)
    expect(degreesMinutesParse('45,5')).toBe(45.5)
  })

  it('adds arc-minutes to the degrees when both are given', () => {
    expect(degreesMinutesParse('45°30′')).toBe(45.5)
    expect(degreesMinutesParse('45° 30')).toBe(45.5)
  })

  it('returns null when there is no number to read', () => {
    expect(degreesMinutesParse('')).toBeNull()
    expect(degreesMinutesParse('°′')).toBeNull()
  })
})

describe('slider scales (#390)', () => {
  const numberFields = (Object.keys(TOOL_SCHEMAS) as UiToolId[]).flatMap(toolId =>
    Object.entries(TOOL_SCHEMAS[toolId])
      .filter(([, d]) => d.valueType.kind === 'numberRange')
      .map(([key, d]) => ({ toolId, key, valueType: d.valueType as Extract<SettingValueType, { kind: 'numberRange' }> })),
  )

  // expScale takes a logarithm of min, so a field that picks it with min <= 0
  // silently falls back to linear rather than failing — which would be a
  // scale quietly not applying, the kind of thing nothing else notices.
  it('only puts an exponential scale on a range a logarithm can take', () => {
    for (const { toolId, key, valueType } of numberFields) {
      if (valueType.scale !== expScale) continue
      expect(valueType.min, `${toolId}.${key} is exponential but starts at ${valueType.min}`).toBeGreaterThan(0)
      expect(valueType.max).toBeGreaterThan(valueType.min)
    }
  })

  // Which fields are exponential is a deliberate list, not a property of the
  // numbers: every continuous px size, and nothing else. Opacity's min is 0
  // (no logarithm) and percentages/degrees are linear by meaning.
  it('makes exactly the continuous px size fields exponential', () => {
    const exponential = numberFields.filter(f => f.valueType.scale === expScale).map(f => `${f.toolId}.${f.key}`)
    expect(exponential.sort()).toEqual([
      'charcoal.size', 'colorPencil.size', 'eraser.size', 'marker.size', 'pencil.size', 'smudge.size',
    ])
  })

  it('leaves every other numeric field on the default linear scale', () => {
    for (const { toolId, key, valueType } of numberFields) {
      if (key === 'size') continue
      expect(valueType.scale, `${toolId}.${key} should be linear`).toBeUndefined()
    }
  })
})
