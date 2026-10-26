import { describe, expect, it } from 'vitest'
import { isBrushLibrary, type BrushLibrary } from './brushes.js'

function library(): BrushLibrary {
  const hash = 'a'.repeat(64)
  return {
    schemaVersion: 1, assets: [{ id: `asset:${hash}`, size: 2, file: `${hash}.bin` }], skipped: [],
    brushes: [{ name: 'Watercolour', source: 'abr', warnings: [], descriptor: {
      id: 'imported-' + 'a'.repeat(16), version: 1, model: 'stamp', category: 'wet',
      tip: { kind: 'bitmap', mask: `asset:${hash}`, hardness: 1, aspect: 1, angle: 0, rotation: 'path' },
      paperInteraction: 0.5, spacing: 0.1, flow: 0.6, flowPer: 'pass', opacity: 1, pressureSmoothingPx: 0,
      sizeByPressure: [[0, 0], [1, 1]], flowByPressure: [[0, 0], [1, 1]], opacityByPressure: [[0, 0], [1, 1]],
    } }],
  }
}

describe('brush library contract', () => {
  it('bounds source spacing laws and responses independently of the legacy brush step', () => {
    const data=library(),d=data.brushes[0].descriptor
    d.behavior={version:2,spacing:{mode:'diameter',coefficient:.06,dynamics:[{control:'pressure',minimum:0,jitter:0,curve:[[0,1],[1,0]]}],isotropic:false}}
    expect(isBrushLibrary(data)).toBe(true)
    d.behavior.spacing!.coefficient=0;expect(isBrushLibrary(data)).toBe(true)
    d.behavior.spacing!.mode='kritaAuto';expect(isBrushLibrary(data)).toBe(false)
    d.behavior.spacing!.coefficient=.4;expect(isBrushLibrary(data)).toBe(true)
    Object.assign(d.behavior.spacing!,{isotropic:1});expect(isBrushLibrary(data)).toBe(false)
    d.behavior.spacing!.isotropic=true
    d.behavior.spacing!.dynamics=Array.from({length:5},()=>({control:'pressure',minimum:0,jitter:0}));expect(isBrushLibrary(data)).toBe(false)
    delete d.behavior.spacing!.dynamics;expect(isBrushLibrary(data)).toBe(true)
  })
  it('validates explicit uniform scatter placement without silently conflicting axes', () => {
    const data=library(),d=data.brushes[0].descriptor
    d.behavior={version:2,scatter:{countJitter:0,bothAxes:false,placement:'pathUniform'}}
    expect(isBrushLibrary(data)).toBe(true)
    d.behavior.scatter!.placement='normalUniform';expect(isBrushLibrary(data)).toBe(true)
    d.behavior.scatter!.placement='xyUniform';expect(isBrushLibrary(data)).toBe(false)
    d.behavior.scatter!.bothAxes=true;expect(isBrushLibrary(data)).toBe(true)
    Object.assign(d.behavior.scatter!,{placement:'native'});expect(isBrushLibrary(data)).toBe(false)
    delete d.behavior.scatter!.placement;expect(isBrushLibrary(data)).toBe(true)
  })
  it('keeps canvas foreground separate from reservoirs and bounds both sensor products', () => {
    const data=library(),d=data.brushes[0].descriptor
    d.model='mixer'
    d.mixer={load:0,initialLoad:0,pickup:1,strength:1,source:'previousCanvas',foreground:{rate:.2,dynamics:[{control:'pressure',minimum:0,jitter:0,curve:[[0,0],[1,1]]}]},sampling:{mode:'uniformMean',radius:.0923,radiusDynamics:[{control:'pressure',minimum:0,jitter:0}]}}
    expect(isBrushLibrary(data)).toBe(true)
    for(const rate of [-.01,1.01,Infinity,NaN]){d.mixer.foreground!.rate=rate;expect(isBrushLibrary(data)).toBe(false)}
    d.mixer.foreground!.rate=.2
    d.mixer.load=.1;expect(isBrushLibrary(data)).toBe(false)
    d.mixer.load=0;delete d.mixer.source;expect(isBrushLibrary(data)).toBe(false)
    d.mixer.source='previousCanvas';d.behavior={version:2,wetMix:{dilution:0,charge:1,attack:1,pull:0,grade:0,blur:0,blurJitter:0,wetnessJitter:0}}
    expect(isBrushLibrary(data)).toBe(false)
    delete d.behavior
    const dynamic={control:'pressure' as const,minimum:0,jitter:0}
    d.mixer.foreground!.dynamics=Array.from({length:5},()=>dynamic);expect(isBrushLibrary(data)).toBe(false)
    d.mixer.foreground!.dynamics=[dynamic]
    d.mixer.sampling!.radiusDynamics=Array.from({length:5},()=>dynamic);expect(isBrushLibrary(data)).toBe(false)
    d.mixer.sampling!.radiusDynamics=[dynamic];expect(isBrushLibrary(data)).toBe(true)
  })
  it('validates uniform size transfers recursively without allowing opacity above its range', () => {
    const data=library()
    data.brushes[0].descriptor.sizeByPressure={kind:'uniform',samples:[0,8]}
    expect(isBrushLibrary(data)).toBe(true)
    const child=structuredClone(data.brushes[0].descriptor)
    child.sizeByPressure={kind:'uniform',samples:[0,3.1838227176]}
    data.brushes[0].descriptor.behavior={version:2,dual:{brush:child,blendMode:'multiply',sampling:'independent'}}
    expect(isBrushLibrary(data)).toBe(true)
    child.opacityByPressure={kind:'uniform',samples:[0,3]}
    expect(isBrushLibrary(data)).toBe(false)
  })
  it('accepts empty metadata and an imported stamp descriptor', () => {
    expect(isBrushLibrary({ schemaVersion: 1, brushes: [], assets: [], skipped: [] })).toBe(true)
    expect(isBrushLibrary(library())).toBe(true)
  })
  it('rejects dangling resources and duplicate identities', () => {
    const data = library()
    data.brushes[0].descriptor.tip.mask = `asset:${'b'.repeat(64)}`
    expect(isBrushLibrary(data)).toBe(false)
    const duplicate = library()
    duplicate.brushes.push(structuredClone(duplicate.brushes[0]))
    expect(isBrushLibrary(duplicate)).toBe(false)
    const assets = library()
    assets.assets.push(structuredClone(assets.assets[0]))
    expect(isBrushLibrary(assets)).toBe(false)
  })
  it('rejects unsafe paths and non-power-of-two or oversized textures', () => {
    for (const size of [0, 2.5, 3, 4096, Infinity, NaN]) {
      const data = library()
      data.assets[0].size = size
      expect(isBrushLibrary(data), `size ${size}`).toBe(false)
    }
    const data = library()
    data.assets[0].file = '../secret.bin'
    expect(isBrushLibrary(data)).toBe(false)
  })
  it('validates every supplied mask reference even for round tips', () => {
    const data = library()
    data.brushes[0].descriptor.tip.kind = 'round'
    data.brushes[0].descriptor.tip.mask = `asset:${'b'.repeat(64)}`
    expect(isBrushLibrary(data)).toBe(false)
  })
  it('rejects non-finite rendering values and non-monotonic pressure curves', () => {
    const data = library()
    data.brushes[0].descriptor.flow = NaN
    expect(isBrushLibrary(data)).toBe(false)
    data.brushes[0].descriptor.flow = 0.5
    data.brushes[0].descriptor.sizeByPressure = [[1, 1], [0, 0]]
    expect(isBrushLibrary(data)).toBe(false)
  })
  it('rejects malformed optional dynamics and unsupported material models', () => {
    const data = library()
    data.brushes[0].descriptor.texture = { id: `asset:${'b'.repeat(64)}`, periodPx: 100, strength: 0.5 }
    expect(isBrushLibrary(data)).toBe(false)
    delete data.brushes[0].descriptor.texture
    data.brushes[0].descriptor.mixer = { load: 1, pickup: 0.5, strength: 1 }
    expect(isBrushLibrary(data)).toBe(false)
  })
  it('bounds total decoded resource memory', () => {
    const data = library()
    data.assets = Array.from({ length: 65 }, (_, n) => {
      const hash = n.toString(16).padStart(64, '0')
      return { id: `asset:${hash}`, size: 2048, file: `${hash}.bin` }
    })
    expect(isBrushLibrary(data)).toBe(false)
  })
  it('validates alpha operations and keeps a texture repeat grid inside its resource', () => {
    const data = library()
    const t: NonNullable<BrushLibrary['brushes'][number]['descriptor']['texture']> = {
      id: data.assets[0].id, periodPx: 2, strength: 0,
      application: { mode: 'subtract', soft: false }, patternSize: { width: 2, height: 1 },
      offset: { x: -2, y: 10, randomX: true, randomY: false },
    }
    data.brushes[0].descriptor.texture = t
    expect(isBrushLibrary(data)).toBe(true)
    t.patternSize!.width = 3
    expect(isBrushLibrary(data)).toBe(false)
    t.patternSize!.width = 2
    Object.assign(t.application!, { mode: 'height' })
    expect(isBrushLibrary(data)).toBe(false)
    t.application!.mode = 'multiply'
    Object.assign(t.offset!, { randomX: 1 })
    expect(isBrushLibrary(data)).toBe(false)
  })
  it('bounds initial mixer load and validates alpha smearing', () => {
    const data = library()
    data.brushes[0].descriptor.model = 'mixer'
    data.brushes[0].descriptor.mixer = { load: 0, initialLoad: 0, pickup: 1, strength: 1, smearAlpha: true }
    expect(isBrushLibrary(data)).toBe(true)
    data.brushes[0].descriptor.mixer.initialLoad = -1
    expect(isBrushLibrary(data)).toBe(false)
    data.brushes[0].descriptor.mixer.initialLoad = 0
    Object.assign(data.brushes[0].descriptor.mixer, { smearAlpha: 'true' })
    expect(isBrushLibrary(data)).toBe(false)
  })
  it('allows previous canvas sampling only for pure transfer', () => {
    const data = library()
    data.brushes[0].descriptor.model = 'mixer'
    const mixer = { load: 0, initialLoad: 0, pickup: 1, strength: 1, source: 'previousCanvas' as const }
    data.brushes[0].descriptor.mixer = mixer
    expect(isBrushLibrary(data)).toBe(true)
    mixer.load = 0.1
    expect(isBrushLibrary(data)).toBe(false)
    mixer.load = 0
    mixer.initialLoad = 0.5
    expect(isBrushLibrary(data)).toBe(false)
    mixer.initialLoad = 0
    Object.assign(mixer, { pickupDynamics: [{ control: 'pressure', minimum: 0, jitter: 0 }] })
    expect(isBrushLibrary(data)).toBe(true)
    Object.assign(mixer, { pickupDynamics: Array(5).fill({ control: 'pressure', minimum: 0, jitter: 0 }) })
    expect(isBrushLibrary(data)).toBe(false)
    Object.assign(mixer, { pickupDynamics: [] })
    data.brushes[0].descriptor.behavior = { version: 2, wetMix: { dilution: 0, charge: 1, attack: 1, pull: 1, grade: 0, blur: 0, blurJitter: 0, wetnessJitter: 0 } }
    expect(isBrushLibrary(data)).toBe(false)
  })
})

describe('Krita source rendering contracts', () => {
  it('retains size multipliers above two without allowing the same values for paint opacity', () => {
    const data = library()
    data.brushes[0].descriptor.sizeByPressure = [[0, 3.18], [1, 3.18]]
    expect(isBrushLibrary(data)).toBe(true)
    data.brushes[0].descriptor.opacityByPressure = [[0, 3.18], [1, 3.18]]
    expect(isBrushLibrary(data)).toBe(false)
  })

  it('validates every animation frame and requires the same storage dimensions', () => {
    const data = library()
    const second = `asset:${'b'.repeat(64)}` as const
    data.assets.push({ id: second, size: 2, file: `${second.slice(6)}.bin` })
    const tip = data.brushes[0].descriptor.tip
    tip.animation = { mode: 'incremental', frames: [data.assets[0].id, second] }
    expect(isBrushLibrary(data)).toBe(true)
    data.assets[1].size = 4
    expect(isBrushLibrary(data)).toBe(false)
    data.assets.pop()
    expect(isBrushLibrary(data)).toBe(false)
  })

  it('bounds mask crops and source defaults independently of rendering strength', () => {
    const data = library()
    data.brushes[0].sourceDefaults = { sizePx: 40, opacity: 0.6, flow: 0.4 }
    const tip = data.brushes[0].descriptor.tip
    tip.maskBounds = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
    expect(isBrushLibrary(data)).toBe(true)
    tip.maskBounds.width = 1
    expect(isBrushLibrary(data)).toBe(false)
    delete tip.maskBounds
    data.brushes[0].sourceDefaults.flow = 2
    expect(isBrushLibrary(data)).toBe(false)
  })
})


describe('tip alpha threshold', () => {
  it('accepts only a bounded complete threshold pair', () => {
    const data=library(),tip=data.brushes[0].descriptor.tip
    tip.alphaThreshold={value:1,softness:0}
    expect(isBrushLibrary(data)).toBe(true)
    for(const invalid of [{value:2,softness:0},{value:1,softness:-1},{value:NaN,softness:0},{value:1},{value:1,softness:0,extra:1}]) {
      Object.assign(tip,{alphaThreshold:invalid})
      expect(isBrushLibrary(data)).toBe(false)
    }
    delete tip.alphaThreshold
    expect(isBrushLibrary(data)).toBe(true)
  })
})
