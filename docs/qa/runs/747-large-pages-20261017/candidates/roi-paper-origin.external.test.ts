import {expect,it,vi} from 'vitest'
import {renderPuddleRegion} from './PuddlePresentationRegion.roi.external'
import {RibbonPasses} from './RibbonPasses.roi.external'
import {MockGL} from '../../../../../apps/web/src/engine/testing/mockGL'
import {RibbonScratchPool} from '../../../../../apps/web/src/engine/src/buffers/RibbonScratchPool'
import {RibbonStrokeScratch} from '../../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'
import {AccumulationBuffer} from '../../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
for(const [ox,oy,x,y,w,h]of [[0,0,0,0,8,11],[300,400,0,0,4,5],[-300,400,4,6,4,5],[300,-400,0,6,4,5],[-300,-400,4,0,4,5],[0,0,7,9,1,2]])it('forwards independent paper/noise basis '+[ox,oy,x,y],()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,pool=new RibbonScratchPool(gl),source=new RibbonStrokeScratch(pool,true,true),buffer=new AccumulationBuffer(gl,8,11),out=new AccumulationBuffer(gl,w,h),entry=source.getOrCreate(buffer),render=vi.fn()
 source.compositeScalars(()=>({spreadPx:0,inkSmoothPx:0,water:1,migratePx:0,fieldSeed:[0,0],bristleRadiusPx:0}))
 const tile={buffer,originX:ox,originY:oy,contentRect:null},context={} as any
 renderPuddleRegion({pool,render} as any,source,tile,context,out,{p:entry.inkLoad!,c:entry.inkColor!,coverage:entry.coverage},{x,y,width:w,height:h})
 const args=render.mock.calls[0];expect(args[5]).toEqual([ox+x,-oy+y]);expect(args[1].originY).toBe(oy+11-y-h)
 // Independent mapping: local GL pixel + override == original physical GL pixel + origin.
 expect([.5+args[5][0],.5+args[5][1]]).toEqual([x+.5+ox,y+.5-oy])
 source.destroy();pool.destroy();buffer.destroy();out.destroy()
})
it('rect forwards optional origin unchanged and legacy default remains undefined',()=>{
 const forward=vi.fn(),args:any[]=[{}, {minX:0,minY:0,maxX:4,maxY:5},{},{},{},{},null,null,[1,0,0],1,[0,0],0,1,0,0,[0,0],12]
 RibbonPasses.prototype.drawRibbonCompositeRect.call({drawRibbonCompositeDab:forward} as any,...args as any)
 expect(forward.mock.calls[0][17]).toBeUndefined()
 const origin=[301,-47] as const;RibbonPasses.prototype.drawRibbonCompositeRect.call({drawRibbonCompositeDab:forward} as any,...[...args,origin] as any)
 expect(forward.mock.calls[1][17]).toBe(origin)
})
for(const origin of [undefined,[301,-47],[0,0]] as const)it('dab binds paper origin override/default '+origin,()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,uniform=vi.spyOn(gl,'uniform2f').mockImplementation(()=>{}),u=new Proxy({}, {get:(_,p)=>String(p)}),buffer=new AccumulationBuffer(gl,8,11),tex=new AccumulationBuffer(gl,8,11)
 const ctx={gl:()=>gl,wcAb:()=>({noSpread:false,noMigrate:false}),stamps:()=>({program:{},uniforms:u,bindNoise(){},positionLoc:0}),paperScale:()=>1,paperWorldSize:()=>({w:1024,h:1024}),paperTex:()=>tex.texture,paperFillThreshold:()=>0,paperFillCap:()=>1,wcDebugView:()=>0,quadBuf:()=>({})}
 for(const method of ['uniform1f','uniform1i','uniform3fv','drawArrays'] as const)vi.spyOn(gl,method).mockImplementation(()=>{});
 const passes=new RibbonPasses(ctx as any),profile=new Proxy({}, {get:()=>1}),dab={x:3,y:4,size:4,pressure:1,tiltX:0,tiltY:0,aspectRatio:1,angle:0,opacity:1,t:0}
 passes.drawRibbonCompositeDab({buffer,originX:12,originY:23,contentRect:null},dab,2,{hardness:1} as any,profile as any,tex,tex,tex,tex,[1,0,0],[0,0],0,1,0,0,[0,0],12,origin)
 const call=uniform.mock.calls.find(c=>c[0] as any==='u_paperOrigin');expect(call?.slice(1)).toEqual(origin??[12,-23]);buffer.destroy();tex.destroy()
})
