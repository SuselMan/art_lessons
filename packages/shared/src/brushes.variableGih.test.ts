import importedRows from './fixtures/gihVariable.imported'
import { expect, it } from 'vitest'
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


it('variable GIH86 alone admits original frame dimensions and own resource sides',()=>{
 const l=library(),b=l.brushes[0].descriptor,second=`asset:${'b'.repeat(64)}`as const
 b.version=86;b.tip.maskBounds={x:0,y:0,width:1,height:1}
 l.assets[0].size=4;l.assets.push({id:second,size:8,file:'b'.repeat(64)+'.bin'})
 b.tip.animation={mode:'incremental',frames:[l.assets[0].id,second],geometry:{version:1,frames:[{sourceWidth:4,sourceHeight:2,maskBounds:{x:0,y:0,width:1,height:1}},{sourceWidth:8,sourceHeight:6,maskBounds:{x:0,y:0,width:1,height:1}}]}}
 expect(isBrushLibrary(l)).toBe(true)
 b.version=84;expect(isBrushLibrary(l)).toBe(false);b.version=86
 const g=b.tip.animation.geometry!;g.frames[1].sourceWidth=9;expect(isBrushLibrary(l)).toBe(false);g.frames[1].sourceWidth=8
 g.frames[1].maskBounds.width=.5;expect(isBrushLibrary(l)).toBe(false);g.frames[1].maskBounds.width=1
 delete b.tip.animation.geometry;expect(isBrushLibrary(l)).toBe(false)
})
it('variable GIH86 rejects paired RGB dimension mismatch and unsupported nested material',()=>{
 const l=library(),b=l.brushes[0].descriptor,second=`asset:${'b'.repeat(64)}`as const
 b.version=86;b.behavior={version:2};b.tip.maskBounds={x:0,y:0,width:1,height:1}
 l.assets[0].size=4;l.assets.push({id:second,size:8,file:'b'.repeat(64)+'.bin'})
 b.tip.animation={mode:'incremental',frames:[l.assets[0].id,second],geometry:{version:1,frames:[{sourceWidth:4,sourceHeight:2,maskBounds:{x:0,y:0,width:1,height:1}},{sourceWidth:8,sourceHeight:6,maskBounds:{x:0,y:0,width:1,height:1}}]}}
 b.tip.color={planes:[l.assets[0].id,l.assets[0].id,l.assets[0].id],frames:[[l.assets[0].id,l.assets[0].id,l.assets[0].id],[second,second,second]]}
 expect(isBrushLibrary(l)).toBe(true);b.tip.color.frames![1][2]=l.assets[0].id;expect(isBrushLibrary(l)).toBe(false)
 b.tip.color.frames![1][2]=second;b.model='mixer';b.mixer={load:0,pickup:0,strength:1};expect(isBrushLibrary(l)).toBe(false)
})

it('primary-only geometry cannot enter through an otherwise valid equal-resource nested child',()=>{
 const l=library(),parent=l.brushes[0].descriptor,second=`asset:${'b'.repeat(64)}`as const
 l.assets[0].size=4;l.assets.push({id:second,size:4,file:'b'.repeat(64)+'.bin'})
 const child=structuredClone(parent);child.id='imported-'+ 'b'.repeat(24);child.version=86;child.tip.maskBounds={x:0,y:0,width:1,height:1}
 child.tip.animation={mode:'incremental',frames:[l.assets[0].id,second],geometry:{version:1,frames:[{sourceWidth:4,sourceHeight:2,maskBounds:{x:0,y:0,width:1,height:1}},{sourceWidth:4,sourceHeight:4,maskBounds:{x:0,y:0,width:1,height:1}}]}}
 parent.version=86;parent.tip={kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'};parent.behavior={version:2,dual:{brush:child,sampling:'independent',blendMode:'multiply'}}
 expect(isBrushLibrary(l)).toBe(false);delete child.tip.animation.geometry;expect(isBrushLibrary(l)).toBe(true)
})

it('real Python imports of authored native L/RGBA/aliased GIH pass the same shared guard',()=>{
 expect(importedRows.map(r=>r.name)).toEqual(['l-unequal','rgba-unequal','rgba-shared-planes'])
 for(const row of importedRows){
  expect(row.authoredNativeFormat).toBe(true);expect(row.kppSha256).toMatch(/^[a-f0-9]{64}$/);expect(row.gihSha256).toMatch(/^[a-f0-9]{64}$/)
  const library:unknown=row.library;expect(isBrushLibrary(library),row.name).toBe(true)
  if(!isBrushLibrary(library))throw Error('Imported GIH failed shared validation: '+row.name)
  expect(library.brushes[0].descriptor.version).toBe(86);expect(library.brushes[0].descriptor.tip.animation?.geometry?.frames).toHaveLength(2)
 }
})

it.each(['spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'])('GIH86 library guard does not grant non-Pixel %s',family=>{
 const row=importedRows[0],data=structuredClone(row.library)
 expect(isBrushLibrary(data)).toBe(true)
 const descriptor=data.brushes[0].descriptor
 expect(isBrushLibrary({...data,brushes:[{...data.brushes[0],descriptor:{...descriptor,[family]:{}}}]})).toBe(false)
})
