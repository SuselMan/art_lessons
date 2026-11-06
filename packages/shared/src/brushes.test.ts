import { describe, expect, it } from 'vitest'
import { brushAssetIds, brushRequiresRandomContext, isBrushLibrary, type BrushLibrary } from './brushes.js'

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
  it('accepts an actual PNG preview with byte-decoded dimensions',()=>{const data=library();data.brushes[0].preview='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';expect(isBrushLibrary(data)).toBe(true)})

  it('admits author input on the primary component and rejects unsupported independent child input', () => {
    const data=library(), parent=data.brushes[0].descriptor, child=structuredClone(parent)
    const strokeInput={version:1,initialDirection:'cursorHistory'} as const
    parent.behavior={version:2,strokeInput,dual:{brush:child,blendMode:'multiply',sampling:'independent'}}
    expect(isBrushLibrary(data)).toBe(true)
    child.behavior={version:2,strokeInput}
    expect(isBrushLibrary(data)).toBe(false)
    delete child.behavior.strokeInput
    expect(isBrushLibrary(data)).toBe(true)
  })

  it('requires recorded random context only for explicit native sensor capabilities', () => {
    const parent=library().brushes[0].descriptor,child=structuredClone(parent)
    const native={control:'strokeRandom' as const,minimum:0,jitter:0,randomSource:{kind:'qt5Taus88' as const,key:'RotationFuzzyStroke'}}
    expect(brushRequiresRandomContext(parent)).toBe(false)
    parent.behavior={version:2,dynamics:{angle:{control:'strokeRandom',minimum:0,jitter:0,randomStream:1}}}
    expect(brushRequiresRandomContext(parent)).toBe(false)
    child.behavior={version:2,rotation:{follow:0,random:'none',composition:{strength:1,additive:[native]}}}
    parent.behavior.dual={brush:child,blendMode:'multiply',sampling:'independent'}
    expect(brushRequiresRandomContext(parent)).toBe(true)
    delete parent.behavior.dual
    parent.model='mixer';parent.mixer={load:0,pickup:0,strength:1,pickupDynamics:[native]}
    expect(brushRequiresRandomContext(parent)).toBe(true)
    delete parent.mixer
    parent.behavior.dual={brush:parent,blendMode:'multiply'}
    expect(brushRequiresRandomContext(parent)).toBe(false)
    parent.behavior.spacing={mode:'kritaAuto',coefficient:1,dynamics:[native]}
    expect(brushRequiresRandomContext(parent)).toBe(true)
  })

  it('requires the circular band and max-alpha accumulation together', () => {
    const data=library(),d=data.brushes[0].descriptor
    d.tip={kind:'procedural',profile:{kind:'circleBand',antialias:true},hardness:1,aspect:1,angle:0,rotation:'fixed'}
    d.paperInteraction=0;d.flow=1;d.flowPer='stamp';d.flowByPressure=[[0,1],[1,1]];d.opacityByPressure=[[0,1],[1,1]]
    expect(isBrushLibrary(data)).toBe(false)
    d.behavior={version:2,rendering:{accumulation:'maxAlpha',mode:'buildUp',blendMode:'normal',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}
    expect(isBrushLibrary(data)).toBe(true)
    d.flow=.5;expect(isBrushLibrary(data)).toBe(false);d.flow=1
    d.opacityByPressure=[[0,0],[1,1]];expect(isBrushLibrary(data)).toBe(false);d.opacityByPressure=[[0,1],[1,1]]
    d.tip.aspect=2;expect(isBrushLibrary(data)).toBe(false);d.tip.aspect=1
    d.model='mixer';expect(isBrushLibrary(data)).toBe(false);d.model='stamp'
    d.behavior.dynamics={roundness:{control:'pressure',jitter:0,minimum:0}};expect(isBrushLibrary(data)).toBe(false);delete d.behavior.dynamics
    d.behavior.rotation={follow:0,random:'none',projection:true};expect(isBrushLibrary(data)).toBe(false);delete d.behavior.rotation
    d.behavior.dual={brush:structuredClone(d),blendMode:'multiply'}
    expect(isBrushLibrary(data)).toBe(false);delete d.behavior.dual
    const parent=library();parent.brushes[0].descriptor.behavior={version:2,dual:{brush:structuredClone(d),blendMode:'multiply'}}
    expect(isBrushLibrary(parent)).toBe(false)
    Object.assign(d.tip.profile!,{extra:true});expect(isBrushLibrary(data)).toBe(false)
  })

  it('requires a threshold when sharpness is driven by sensors', () => {
    const data=library(),d=data.brushes[0].descriptor
    d.behavior={version:2,modulations:{sharpness:[{control:'pressure',minimum:0,jitter:0}]}}
    expect(isBrushLibrary(data)).toBe(false)
    d.tip.alphaThreshold={value:1,softness:0}
    expect(isBrushLibrary(data)).toBe(true)
    d.behavior.modulations!.sharpness![0].minimum=2
    expect(isBrushLibrary(data)).toBe(false)
  })

  it('bounds radial lookup bytes, encoding and supported combinations', () => {
    const data=library(),d=data.brushes[0].descriptor
    data.assets[0].size=4
    d.tip={kind:'procedural',profile:{kind:'radialCurve',lookup:data.assets[0].id,resolution:2,encoding:'unorm32be',antialias:false},hardness:1,aspect:5,angle:0,rotation:'fixed'}
    d.behavior={version:2}
    expect(isBrushLibrary(data)).toBe(true)
    if(d.tip.profile?.kind!=='radialCurve')throw new Error('Expected radial curve')
    d.tip.profile.resolution=3;expect(isBrushLibrary(data)).toBe(false);d.tip.profile.resolution=2
    d.tip.alphaThreshold={value:1,softness:0};expect(isBrushLibrary(data)).toBe(false);delete d.tip.alphaThreshold
    Object.assign(d.tip.profile,{antialias:true});expect(isBrushLibrary(data)).toBe(false)
  })
  it('collects lookup and child resource references once without built-in tips', () => {
    const data=library(),d=data.brushes[0].descriptor,lookup=data.assets[0].id
    d.tip={kind:'procedural',profile:{kind:'radialCurve',lookup,resolution:2,encoding:'unorm32be',antialias:false},hardness:1,aspect:1,angle:0,rotation:'fixed'}
    const child=structuredClone(d);child.tip={kind:'round',mask:'chalk',hardness:1,aspect:1,angle:0,rotation:'fixed'}
    d.behavior={version:2,dual:{brush:child,blendMode:'multiply'}}
    expect(brushAssetIds(d)).toEqual([lookup])
    child.tip.mask=lookup
    expect(brushAssetIds(d)).toEqual([lookup])
    child.behavior={version:2,dual:{brush:d,blendMode:'multiply'}}
    expect(brushAssetIds(d)).toEqual([lookup])
  })

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


describe('integer image source grid', () => {
  it('validates actual texel extents independently of the drawing crop', () => {
    const data = library(), tip = data.brushes[0].descriptor.tip
    tip.imageSampling = { kind: 'integer-pyramid', signal: 'inverse-gray', sourceRect: { x: 1, y: 0, width: 1, height: 2 } }
    expect(isBrushLibrary(data)).toBe(true)
    for (const rect of [
      { x: 1, y: 0, width: 2, height: 2 },
      { x: 0, y: 1, width: 1, height: 2 },
      { x: .5, y: 0, width: 1, height: 2 },
      { x: 0, y: 0, width: 0, height: 2 },
      { x: 0, y: 0, width: 1, height: Infinity },
    ]) {
      tip.imageSampling.sourceRect = rect
      expect(isBrushLibrary(data)).toBe(false)
    }
  })

  it('does not interpret material or unknown signals as opaque gray', () => {
    for (const patch of [
      { signal: 'alpha' }, { kind: 'linear' }, { extra: true },
      { sourceRect: { x: 0, y: 0, width: 2, height: 2, extra: true } },
    ]) {
      const data = library(), tip = data.brushes[0].descriptor.tip
      Object.assign(tip, { imageSampling: { kind: 'integer-pyramid', signal: 'inverse-gray', sourceRect: { x: 0, y: 0, width: 2, height: 2 }, ...patch } })
      expect(isBrushLibrary(data)).toBe(false)
    }
    const data = library(), tip = data.brushes[0].descriptor.tip
    tip.imageSampling = { kind: 'integer-pyramid', signal: 'inverse-gray', sourceRect: { x: 0, y: 0, width: 2, height: 2 } }
    tip.material = { kind: 'lightness', gray: data.assets[0].id, strength: 1 }
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
