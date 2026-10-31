/** Diagnostic-only reuse of production author/adapter/encoder. No renderer. */
import {canonicalSoftAutoSourceBinding,canonicalSourceComposition,type BrushDescriptor,type CanonicalStrokeRasterProfile} from '../../../../packages/shared/src/index'
import {sourceStrokeAuthorDescriptor} from '../../../../apps/web/src/engine/src/presets/sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceAuthorPacket} from '../../../../apps/web/src/engine/src/presets/sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter,type SourceStrokeMaterialContextV2} from '../../../../apps/web/src/engine/src/presets/sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder} from '../../../../apps/web/src/engine/src/presets/sourceCanonicalFrameEncoder'
export const targetGeometry={pageBounds:{minX:0,minY:0,maxX:64,maxY:64},tileWidth:64,tileHeight:64,maxTargets:4} as const
export const seeds={sequentialSeed:4321,perStrokeSeed:7654,strokeRandom:.3} as const
export function authored(descriptor:BrushDescriptor,index:number,descriptorSha256:string,rasterProfile:CanonicalStrokeRasterProfile,packets:readonly SourceAuthorPacket[]){
 const coverageProfile='neon64-f32-fma-v1' as const,pin=canonicalSoftAutoSourceBinding(descriptor,descriptorSha256,coverageProfile,0,rasterProfile)
 const policy=canonicalSourceComposition(descriptor,rasterProfile);if(!policy)throw Error('Source composition unavailable')
 const compiled=sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'generic-sc4-native-pigment',lodScale:1,coverageProfile})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const material:SourceStrokeMaterialContextV2={version:2,assets:[],primarySource:pin,targetGeometry,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}
 const rgb=[183,47,211] as const,composition={...policy,alphaDarken:'creamy' as const,outerResourceOpacity:.73}
 const brush=`brush:${descriptor.id}@${descriptor.version}`,strokeId='actual-soft-'+index,author=new SourceStrokeAuthor(compiled.program)
 let state=author.createState(seeds.sequentialSeed,seeds.perStrokeSeed,seeds.strokeRandom)
 const adapter=new SourceStrokeMaterialAdapter(compiled.program,material,state),encoder=new SourceCanonicalFrameEncoder({rasterProfile,brush,strokeId,pigmentRgb8:rgb,composition,material})
 const frames:ReturnType<typeof encoder.encode>[]=[],inputFrameCuts:number[]=[]
 const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const chunk of chunks)frames.push(encoder.encode(chunk.packed))}
 for(const packet of packets){accept(adapter.beginInput(state));const iterator=author.plan(state,packet);let steps=0
  while(true){if(++steps>10000)throw Error('Author step budget');const next=iterator.next();if(next.done){state=next.value;break}accept(adapter.accept(next.value));const cut=adapter.flush();if(cut)accept([cut])}
  inputFrameCuts.push(frames.length)
 }
 accept(adapter.finish(state))
 if(!encoder.ended||encoder.nextFrameOrdinal!==frames.length)throw Error('Incomplete author stream')
 return{pin,material,composition,rgb,brush,strokeId,frames,inputFrameCuts}
}
export function packet(x:number,y:number,i=0):SourceAuthorPacket{return{x,y,t:i*19,pressure:[.2,.6][i]??.2,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false}}
