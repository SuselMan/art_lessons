/** Actual imported source-data fixture, test-only. No assets or pixel planes. */
import type { BrushDescriptor } from '@grafetto/shared'
import { canonicalGaussianAutoSourceBinding } from '@grafetto/shared'
import stock from '../../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.native'
import { SourceStrokeAuthor, type SourceAuthorPacket } from '../src/presets/sourceStrokeAuthor'
import { sourceStrokeAuthorDescriptor } from '../src/presets/sourceStrokeAuthorDescriptor'
import { SourceStrokeMaterialAdapter, type SourceStrokeMaterialContextV2 } from '../src/presets/sourceStrokeMaterialAdapter'
import { SourceCanonicalFrameEncoder } from '../src/presets/sourceCanonicalFrameEncoder'
export const GAUSSIAN_READY_STOCK = [2,5,6,7,10,11,22] as const
export function sourceGaussianCanonicalFixture(index:number,profile:'scalar-bionic-f64-fma-v1'|'neon64-f32-fma-v1',resume:boolean) {
  const row=stock.rows.find(r=>r.index===index)!,descriptor=row.descriptor as unknown as BrushDescriptor
  const compiled=sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'native-black',lodScale:1,coverageProfile:profile})
  if(!compiled.supported)throw Error(compiled.reasons.join(','))
  const pin=canonicalGaussianAutoSourceBinding(descriptor,row.descriptorSHA256,profile)
  const context:SourceStrokeMaterialContextV2={version:2,assets:[],primarySource:pin,
    budget:{workUnits:64*1024*1024,outputBytes:16*1024*1024,drawPixels:16*1024*1024},
    targetGeometry:{pageBounds:null,tileWidth:256,tileHeight:256,maxTargets:64}}
  let author=new SourceStrokeAuthor(compiled.program),state=author.createState(4321,7654,.3)
  let adapter=new SourceStrokeMaterialAdapter(compiled.program,context,state)
  const encoder=new SourceCanonicalFrameEncoder({brush:descriptor.id+'@'+descriptor.version,strokeId:'gaussian-gesture',pigmentRgb8:[12,34,56],
    composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:.8,outerBlend:'over'},material:context})
  const chunks:ReturnType<typeof adapter.finish>=[],accepted:ReturnType<typeof encoder.encode>[]=[]
  const submit=(next:typeof chunks)=>{chunks.push(...next);for(const c of next){const decoded=encoder.encode(c.packed);if(JSON.stringify(decoded.frame)!==JSON.stringify(c.frame))throw Error('decoded Gaussian frame differs');accepted.push(decoded)}}
  for(let i=0;i<30;i++) {
    submit(adapter.beginInput(state))
    const packet:SourceAuthorPacket={x:-8+i*.8,y:-4+Math.sin(i/4)*5,t:i*17,pressure:.15+.8*(i%9)/8,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:i>=12&&i<22,mirroredV:false,tiltDirectionOffset:0,hover:false}
    let iterator=author.plan(state,packet)
    while(true) {
      const next=iterator.next();if(next.done){state=next.value;break}
      submit(adapter.accept(next.value))
      // Same framing cuts in both runs; resume affects ownership only.
      const flush=i%2===0?adapter.flush():undefined;if(flush)submit([flush])
      if(resume) {
        const checkpoint=structuredClone(next.value.state),material=structuredClone(adapter.checkpoint());iterator.return(checkpoint)
        adapter=new SourceStrokeMaterialAdapter(structuredClone(compiled.program),context,checkpoint,material)
        if(!checkpoint.cursor){state=checkpoint;break}
        author=new SourceStrokeAuthor(structuredClone(compiled.program));iterator=author.resume(checkpoint)
      }
    }
  }
  submit(adapter.finish(state))
  return {chunks,accepted,context,pin,ended:encoder.ended,state}
}
