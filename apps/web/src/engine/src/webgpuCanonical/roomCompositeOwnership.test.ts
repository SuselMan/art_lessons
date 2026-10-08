import {afterEach,expect,it,vi} from 'vitest'
import {CanonicalSingleTileFinish} from './finishTile'
import {CanonicalRoomWatercolorExecutor,type RoomNativePreparedChunk} from './roomWatercolorExecutor'
import {ribbonProfileFor} from '../dabs/ribbonProfile'
import type {CanonicalWatercolorWebGpu} from './backend'
import type {CanonicalGpuField} from './types'
afterEach(()=>vi.unstubAllGlobals())
it('actual Room source→live/preview/final composite binds only supplied owner records without standalone fields',()=>{
 vi.stubGlobal('GPUBufferUsage',{UNIFORM:1,COPY_DST:2})
 const order:string[]=[],groups:GPUBindGroupDescriptor[]=[],pass={setPipeline:vi.fn(),setBindGroup:vi.fn(),setScissorRect:vi.fn(),draw:()=>order.push('composite'),end:vi.fn()}
 const device={createShaderModule:()=>({}),createRenderPipeline:()=>({getBindGroupLayout:()=>({})}),createSampler:()=>({}),createBuffer:()=>({destroy:vi.fn()}),createBindGroup:(d:GPUBindGroupDescriptor)=>{groups.push(d);return{}},queue:{writeBuffer:vi.fn()}} as unknown as GPUDevice
 const field=(label:string):CanonicalGpuField=>({label,width:1024,height:1024,texture:{label} as GPUTexture,view:{label} as GPUTextureView,format:'rgba8unorm',filter:'nearest'})
 const paper=field('paper'),noise=field('noise'),output=field('output'),original=field('original'),coverage=field('coverage'),p=field('P'),c=field('C'),pd=field('dryP'),cd=field('dryC')
 const backend={device,paper:{field:paper,texSize:[1754,2480],scale:1},noise,get fields(){throw new Error('Room-owned backend has no standalone material fields')}} as unknown as CanonicalWatercolorWebGpu
 const buffer=(f:CanonicalGpuField)=>({owner:backend,width:f.width,height:f.height,field:f})
 const tile={buffer:buffer(output),originX:0,originY:0,contentRect:null},entry={original:buffer(original),coverage:buffer(coverage),inkLoad:buffer(p),inkColor:buffer(c),inkDry:buffer(pd),colorDry:buffer(cd),filmGesture:1}
 const tiles={pool:{owner:backend},peek:()=>entry}
 const finish=new CanonicalSingleTileFinish(backend,tiles as never,[tile as never])
 const live={profile:ribbonProfileFor('watercolor','normal:100:100:PB29:round'),opacity:1,fieldSeed:[.2,.3] as const,spreadPx:24,water:1,bristleRadiusPx:20,bounds:{minX:280,minY:280,maxX:380,maxY:330},inkSmoothPx:4}
 const encoder={beginRenderPass:()=>pass} as unknown as GPUCommandEncoder
 const source={execute:()=>{order.push('source');return[]}}
 const scratch={gesture:0,activateMaterialFilm:vi.fn(),paints:new Set(),delivery:{brushTravel:[],wetContacts:[]}}
 const owner=Object.create(CanonicalRoomWatercolorExecutor.prototype) as CanonicalRoomWatercolorExecutor
 Object.assign(owner,{retired:false,central:{isIdle:true},layerId:'real-room-layer',generation:1,scratch,source,finish,accepted:new Set(),adapter:{runQuantum:(f:(ctx:{encoder:GPUCommandEncoder})=>void)=>f({encoder}),retain:(buffers:GPUBuffer[])=>buffers.forEach(b=>b.destroy())}})
 const chunk={path:'live',layerId:'real-room-layer',generation:1,strokeId:'packed-op',ordinal:0,materialGesture:1,segment:{},metadata:{gesture:1,paints:[1],foreignSources:new Set(),dryCtx:null,brushTravel:[],wetContacts:[]},live} as unknown as RoomNativePreparedChunk
 expect(()=>owner.emitPrepared(chunk)).not.toThrow()
 expect(order).toEqual(['source','composite'])
 const bound=(n:number)=>groups[n].entries.filter(e=>e.binding>=1&&e.binding<=6).map(e=>e.resource)
 expect(bound(0)).toEqual([original.view,coverage.view,p.view,c.view,paper.view,noise.view])
 finish.encodePreview(encoder,live,{original:buffer(original),coverage:buffer(coverage),pigment:buffer(pd),color:buffer(cd)} as never).forEach(b=>b.destroy())
 finish.encode(encoder,{...live,settleComplete:true,settledGesture:1,materialGesture:1}).forEach(b=>b.destroy())
 expect(bound(1)).toEqual([original.view,coverage.view,pd.view,cd.view,paper.view,noise.view])
 expect(bound(2)).toEqual(bound(1))
 expect(()=>backend.fields).toThrow('no standalone')
})
