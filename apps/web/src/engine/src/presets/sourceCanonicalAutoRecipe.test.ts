import { expect, it } from 'vitest'
import { buildCanonicalMaterial, canonicalDefaultAutoSourceBinding, unpackCanonicalMaterial,
  type BrushDescriptor, type CanonicalDefaultAutoRecipe, type CanonicalMaterialContextV2 } from '@grafetto/shared'
import stock from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import { sourceStrokeAuthorDescriptor } from './sourceStrokeAuthorDescriptor'
import { SourceStrokeAuthor, type SourceAuthorPacket } from './sourceStrokeAuthor'

it('transports real seven descriptor generations through v2 with no CAS and no runtime-scale authority substitution', () => {
  let count = 0
  for (const row of stock.rows) {
    const descriptor = row.descriptor as unknown as BrushDescriptor
    const profile = 'neon64-f32-fma-v1' as const
    const compiled = sourceStrokeAuthorDescriptor(descriptor, {colorIdentity:'native-black',lodScale:1,coverageProfile:profile})
    if (!compiled.supported) throw new Error(compiled.reasons.join(','))
    const pin = canonicalDefaultAutoSourceBinding(descriptor,'a'.repeat(64),profile)
    const context:CanonicalMaterialContextV2={version:2,assets:[],primarySource:pin,
      budget:{workUnits:64*1024*1024,outputBytes:16*1024*1024,drawPixels:16*1024*1024}}
    const author = new SourceStrokeAuthor(compiled.program)
    let state = author.createState(4321,7654,.3)
    for (let i=0;i<30;i++) {
      const packet:SourceAuthorPacket={x:-8+i*.8,y:-4+Math.sin(i/4)*5,t:i*17,pressure:.15+.8*(i%9)/8,
        tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,
        mirroredH:i>=12&&i<22,mirroredV:false,tiltDirectionOffset:0,hover:false}
      const iterator=author.plan(state,packet)
      while(true){const next=iterator.next();if(next.done){state=next.value;break}
        const material=next.value.result?.material
        if(!material)continue
        const {opacity,flow}=next.value.result!
        if(typeof opacity!=='number'||typeof flow!=='number')throw Error('Missing resolved author strengths')
        const saved=material.resolvedSource,g=saved.geometry
        if(g?.kind!=='defaultAuto')throw Error('Missing saved auto geometry')
        const recipe:CanonicalDefaultAutoRecipe={kind:'defaultAuto',source:g.source,coverageProfile:g.coverageProfile,
          brushScale:saved.brush.scale,brushAngle:saved.brush.angle,scale:saved.shape.scale,ratio:saved.shape.ratio,rotation:saved.shape.rotation,
          subX:saved.key.subPixelX,subY:saved.key.subPixelY,width:saved.width,height:saved.height,
          mirrorH:saved.mirror.horizontal,mirrorV:saved.mirror.vertical}
        const result=buildCanonicalMaterial({masked:false,entry:{phase:'primary',group:1},draws:[{recipe,role:'primary',
          x:material.resolvedRect.x,y:material.resolvedRect.y,opacity,flow}],fences:[]},context)
        expect(atob(result.packed.slice(2)).charCodeAt(6)).toBe(0)
        const decoded=unpackCanonicalMaterial(JSON.parse(JSON.stringify(result.packed)),context)
        expect(decoded.definitions[0]).toEqual(recipe)
        expect(decoded.draws[0]!.x).toBe(material.resolvedRect.x)
        count++
      }
    }
  }
  expect(count).toBeGreaterThan(7*30)
})

import { SourceStrokeMaterialAdapter, type SourceStrokeMaterialContextV2 } from './sourceStrokeMaterialAdapter'
import { SourceCanonicalFrameEncoder } from './sourceCanonicalFrameEncoder'

it('feeds actual seven author programs through one v2 adapter and decoded encoder across every-yield resume',()=>{
  let draws=0
  for(const row of stock.rows){
    const descriptor=row.descriptor as unknown as BrushDescriptor,profile='neon64-f32-fma-v1' as const
    const compiled=sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'black',lodScale:1,coverageProfile:profile})
    if(!compiled.supported)throw Error(compiled.reasons.join(','))
    const context:SourceStrokeMaterialContextV2={version:2,assets:[],primarySource:canonicalDefaultAutoSourceBinding(descriptor,'a'.repeat(64),profile),
      budget:{workUnits:64*1024*1024,outputBytes:16*1024*1024,drawPixels:16*1024*1024},
      targetGeometry:{pageBounds:null,tileWidth:256,tileHeight:256,maxTargets:64}}
    const author=new SourceStrokeAuthor(compiled.program);let state=author.createState(4321,7654,.3)
    let adapter=new SourceStrokeMaterialAdapter(compiled.program,context,state)
    const whole=new SourceStrokeMaterialAdapter(compiled.program,context,state)
    const wholeChunks:ReturnType<typeof adapter.finish>=[],cutChunks:ReturnType<typeof adapter.finish>=[]
    const encoder=new SourceCanonicalFrameEncoder({brush:descriptor.id+'@'+descriptor.version,strokeId:'auto-gesture',pigmentRgb8:[12,34,56],
      composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:.8,outerBlend:'over'},material:context})
    const submit=(chunks:ReturnType<typeof adapter.finish>)=>{cutChunks.push(...chunks);for(const chunk of chunks){const accepted=encoder.encode(chunk.packed);expect(accepted.frame).toEqual(chunk.frame);expect(accepted.frame.definitions.every(d=>d.kind==='defaultAuto')).toBe(true);draws+=accepted.frame.draws.length}}
    for(let i=0;i<30;i++){
      submit(adapter.beginInput(state));wholeChunks.push(...whole.beginInput(state))
      const packet:SourceAuthorPacket={x:-8+i*.8,y:-4+Math.sin(i/4)*5,t:i*17,pressure:.15+.8*(i%9)/8,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false}
      const iterator=author.plan(state,packet)
      while(true){const next=iterator.next();if(next.done){state=next.value;break}
        submit(adapter.accept(next.value));wholeChunks.push(...whole.accept(next.value));const flushed=i%2===0?adapter.flush():undefined;if(flushed)submit([flushed])
        adapter=new SourceStrokeMaterialAdapter(compiled.program,context,next.value.state,adapter.checkpoint())
      }
    }
    submit(adapter.finish(state));wholeChunks.push(...whole.finish(state));expect(encoder.ended).toBe(true)
    const flatten=(chunks:typeof wholeChunks)=>{let count=0;const draws:unknown[]=[],fences:unknown[]=[],inputs:unknown[]=[]
      for(const c of chunks){draws.push(...c.frame.draws.map(d=>({...d,definition:undefined,recipe:c.frame.definitions[d.definition]})));fences.push(...c.frame.fences.map(f=>({...f,at:f.at+count})));inputs.push(...c.inputs);count+=c.frame.draws.length}return{draws,fences,inputs}}
    expect(flatten(cutChunks)).toEqual(flatten(wholeChunks))
  }
  expect(draws).toBeGreaterThan(210)
})
