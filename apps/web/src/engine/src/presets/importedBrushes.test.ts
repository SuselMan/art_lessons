import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrushLibrary } from '@grafetto/shared'

function library(): BrushLibrary {
  const hash = 'a'.repeat(64)
  return { schemaVersion: 1, skipped: [], assets: [{ id: `asset:${hash}`, size: 2, file: hash + '.bin' }], brushes: [{
    name: 'Original', source: 'original.abr', warnings: ['old warning'], descriptor: {
      id: 'imported-' + 'b'.repeat(16), version: 1, model: 'stamp', category: 'paint',
      tip: { kind: 'bitmap', mask: `asset:${hash}`, hardness: 1, aspect: 1, rotation: 'fixed', angle: 0 },
      paperInteraction: 0, spacing: .1, flow: 1, flowPer: 'pass', opacity: 1, pressureSmoothingPx: 0,
      sizeByPressure: [[0, 0], [1, 1]], flowByPressure: [[0, 0], [1, 1]], opacityByPressure: [[0, 0], [1, 1]],
    },
  }] }
}
beforeEach(() => vi.resetModules())
describe('immutable imported rendering data', () => {
  it('refreshes metadata while retaining descriptor identity and installed pixels', async () => {
    const registry = await import('./importedBrushes')
    const old = library()
    registry.installBrushLibrary(old)
    registry.installBrushPixels(old.assets[0].id, new Uint8Array([1, 2, 3, 4]))
    const descriptor = registry.importedBrushFromPreset(old.brushes[0].descriptor.id)
    const pixels = registry.importedAssetPixels(old.assets[0].id)
    const current = structuredClone(old)
    current.brushes[0].warnings = ['new diagnostics']
    current.brushes[0].name = 'Current name'
    current.brushes[0].source = 'current.abr'
    current.brushes[0].descriptor = Object.fromEntries(Object.entries(current.brushes[0].descriptor).reverse()) as typeof current.brushes[0]['descriptor']
    registry.installBrushLibrary(current)
    expect(registry.importedBrushes()[0].warnings).toEqual(['new diagnostics'])
    expect(registry.importedBrushes()[0].name).toBe('Current name')
    expect(registry.importedBrushFromPreset(old.brushes[0].descriptor.id)).toBe(descriptor)
    expect(registry.importedAssetPixels(old.assets[0].id)).toBe(pixels)
  })
  it('rejects historical rendering changes atomically', async () => {
    const registry = await import('./importedBrushes')
    const old = library()
    registry.installBrushLibrary(old)
    const previous = registry.importedBrushes()[0]
    const changed = structuredClone(old)
    changed.brushes[0].warnings = ['metadata should not land']
    changed.brushes[0].descriptor.flow = .5
    expect(() => registry.installBrushLibrary(changed)).toThrow('Brush version cannot be replaced')
    expect(registry.importedBrushes()[0]).toBe(previous)
  })
})

it('captures declared metadata before bytes and never infers metadata from legacy pixel-only installation',async()=>{
 const r=await import('./importedBrushes'),l=library(),id=l.assets[0].id,preset=l.brushes[0].descriptor.id
 r.installBrushPixels(id,new Uint8Array([1,2,3,4]));expect(r.importedBrushAssetMetadata(preset)).toBeUndefined()
 const pixels=r.importedAssetPixels(id);r.installBrushLibrary(l)
 const result=r.importedBrushAssetMetadata(preset)!;expect(result).toEqual([{id,size:2}]);expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result[0])).toBe(true);expect(r.importedAssetPixels(id)).toBe(pixels)
 l.assets[0].size=4;expect(r.importedBrushAssetMetadata(preset)).toEqual([{id,size:2}])
 r.clearImportedBrushPixels();expect(r.isBrushAssetReady(id)).toBe(false);expect(r.importedBrushAssetMetadata(preset)![0]).toBe(result[0])
 r.retainImportedBrushResources([]);expect(r.importedBrushAssetMetadata(preset)).toBeUndefined()
})
it('installs metadata without bytes and rejects a pixel side mismatch before replacing the resource',async()=>{
 const r=await import('./importedBrushes'),l=library(),id=l.assets[0].id,preset=l.brushes[0].descriptor.id
 r.installBrushLibrary(l);const meta=r.importedBrushAssetMetadata(preset)![0]
 expect(r.isBrushAssetReady(id)).toBe(false);expect(()=>r.importedAssetPixels(id)).toThrow('unavailable')
 expect(()=>r.installBrushPixels(id,new Uint8Array(16))).toThrow(/size/);expect(r.isBrushAssetReady(id)).toBe(false)
 r.installBrushPixels(id,new Uint8Array([1,2,3,4]));const pixels=r.importedAssetPixels(id)
 expect(()=>r.installBrushPixels(id,new Uint8Array([4,3,2,1]))).toThrow('cannot be replaced')
 r.installBrushLibrary(structuredClone(l));expect(r.importedBrushAssetMetadata(preset)![0]).toBe(meta);expect(r.importedAssetPixels(id)).toBe(pixels)
})
it('rejects a late asset conflict atomically before any earlier metadata or brush refresh lands',async()=>{
 const r=await import('./importedBrushes'),old=library();r.installBrushLibrary(old)
 const previous=r.importedBrushes()[0],metadata=r.importedBrushAssetMetadata(previous.descriptor.id)![0],next=structuredClone(old)
 const first={id:`asset:${'c'.repeat(64)}` as const,size:2,file:'new.bin'}
 next.assets=[first,{...next.assets[0],size:4}];next.brushes[0].name='Must not publish'
 expect(()=>r.installBrushLibrary(next)).toThrow(/size/);expect(r.importedBrushes()[0]).toBe(previous);expect(r.importedBrushAssetMetadata(previous.descriptor.id)![0]).toBe(metadata)
 // A failed first asset must not leave an invisible metadata record either.
 r.installBrushLibrary({schemaVersion:1,brushes:[],assets:[{...first,size:4}],skipped:[]})
})
it('rejects incompatible bytes-before-manifest and same-version descriptor changes without publishing metadata',async()=>{
 const r=await import('./importedBrushes'),l=library(),id=l.assets[0].id
 r.installBrushPixels(id,new Uint8Array(16));expect(()=>r.installBrushLibrary(l)).toThrow(/size/);expect(r.importedBrushes()).toEqual([]);expect(r.isBrushAssetReady(id,4)).toBe(true)
 r.clearImportedBrushPixels();r.installBrushLibrary(l);const changed=structuredClone(l),extra={id:`asset:${'d'.repeat(64)}` as const,size:2,file:'new.bin'}
 changed.assets.push(extra);changed.brushes[0].descriptor.flow=.25
 expect(()=>r.installBrushLibrary(changed)).toThrow('Brush version cannot be replaced')
 r.installBrushLibrary({schemaVersion:1,brushes:[],assets:[{...extra,size:4}],skipped:[]})
})
it('rejects asset accessors, inherited fields, holes, duplicates and invalid sides without invoking getters',async()=>{
 const r=await import('./importedBrushes'),get=vi.fn(()=>library().assets[0].id),l=library()
 const inherited=Object.create(l.assets[0]);const accessor=Object.defineProperty({...l.assets[0]},'id',{get})
 for(const assets of [[inherited],[accessor],Array<BrushLibrary['assets'][number]>(1),[l.assets[0],l.assets[0]],[{...l.assets[0],size:3}],[{...l.assets[0],id:'asset:bad'}],[{...l.assets[0],size:4096}]]){
  expect(()=>r.installBrushLibrary({...l,assets})).toThrow();expect(r.importedBrushes()).toEqual([])
 }
 expect(get).not.toHaveBeenCalled()
})
it('returns complete deduplicated descriptor order, missing metadata undefined and zero-source metadata empty',async()=>{
 const r=await import('./importedBrushes'),l=library(),a=l.assets[0],b={id:`asset:${'b'.repeat(64)}` as const,size:4,file:'b.bin'}
 l.brushes[0].descriptor.tip.animation={mode:'random',frames:[b.id,a.id,b.id]}
 r.installBrushLibrary(l);expect(r.importedBrushAssetMetadata(l.brushes[0].descriptor.id)).toBeUndefined()
 r.installBrushLibrary({schemaVersion:1,brushes:[],assets:[b],skipped:[]})
 expect(r.importedBrushAssetMetadata(l.brushes[0].descriptor.id)).toEqual([{id:a.id,size:2},{id:b.id,size:4}])
 const empty=structuredClone(l);empty.brushes[0].descriptor.id='imported-'+ 'f'.repeat(16);delete empty.brushes[0].descriptor.tip.mask;delete empty.brushes[0].descriptor.tip.animation
 r.installBrushLibrary(empty);expect(r.importedBrushAssetMetadata(empty.brushes[0].descriptor.id)).toEqual([])
})
it('does not publish earlier staged resources when a later brush copy fails',async()=>{
 const r=await import('./importedBrushes'),l=library(),second=structuredClone(l.brushes[0]);second.descriptor.id='imported-'+ 'e'.repeat(16);l.brushes.push(second)
 const clone=structuredClone,error=new Error('copy failed'),spy=vi.spyOn(globalThis,'structuredClone').mockImplementationOnce(value=>clone(value)).mockImplementationOnce(()=>{throw error})
 try{expect(()=>r.installBrushLibrary(l)).toThrow(error);expect(r.importedBrushes()).toEqual([])}finally{spy.mockRestore()}
 // No early metadata landed: a different declared side is still a fresh install.
 r.installBrushLibrary({schemaVersion:1,brushes:[],assets:[{...l.assets[0],size:4}],skipped:[]})
})
