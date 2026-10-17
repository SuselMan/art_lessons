import {Buffer} from 'node:buffer'
import {expect,it,vi} from 'vitest'
import type {ILayerBuffer,PaintTarget} from '../../buffers/ILayerBuffer'
const memory=vi.hoisted(()=>({live:new Set<object>(),presentations:[] as Array<{shown:unknown}>,copies:0}))
vi.mock('../../buffers/AccumulationBuffer',()=>({AccumulationBuffer:class{
 width:number;height:number;pixels:Uint8Array;gl:unknown;destroyed=false
 constructor(gl:unknown,w:number,h:number){this.gl=gl;this.width=w;this.height=h;this.pixels=new Uint8Array(w*h*4);memory.live.add(this)}
 clear(){this.pixels.fill(0)}
 copyTo(other:{pixels:Uint8Array}){if(other.pixels.length!==this.pixels.length)throw Error('copy size');other.pixels.set(this.pixels);memory.copies++}
 copyRegionInto(other:{width:number;pixels:Uint8Array},sx:number,sy:number,dx:number,dy:number,w:number,h:number){for(let y=0;y<h;y++)other.pixels.set(this.pixels.slice(((sy+y)*this.width+sx)*4,((sy+y)*this.width+sx+w)*4),((dy+y)*other.width+dx)*4);memory.copies++}
 readPixels(){return this.pixels.slice()}
 writePixels(p:Uint8Array){this.pixels.set(p)}
 restorePixelsRect(_w:number,_h:number,p:Uint8Array){this.pixels.set(p)}
 destroy(){this.destroyed=true;memory.live.delete(this)}
}}))
vi.mock('./PuddlePresentation',async()=>{
 const {AccumulationBuffer}=await import('../../buffers/AccumulationBuffer')
 return{createPuddlePresentation:(gl:WebGLRenderingContext,size:{width:number;height:number},opts:{bufferFactory?:(w:number,h:number)=>InstanceType<typeof AccumulationBuffer>})=>{
 const buffers:Array<InstanceType<typeof AccumulationBuffer>>=[]
 const make=(w:number,h:number)=>{const b=opts.bufferFactory?.(w,h)??new AccumulationBuffer(gl,w,h);buffers.push(b);return b}
 try{
 const shown=make(size.width,size.height),target=make(size.width,size.height);for(let i=0;i<3;i++)make(size.width,size.height);for(let i=0;i<3;i++)make(Math.min(128,size.width),Math.min(128,size.height))
 const api={shown,invalidate(){},destroy(){for(const b of buffers)b.destroy()},reset(b:InstanceType<typeof AccumulationBuffer>){b.copyTo(shown)},
 acceptInput(before:InstanceType<typeof AccumulationBuffer>,after:InstanceType<typeof AccumulationBuffer>){const s=pixels(shown),b=pixels(before),a=pixels(after);for(let i=0;i<s.length;i++)s[i]=Math.min(255,Math.max(0,s[i]+a[i]-b[i]))},
 setTarget(b:InstanceType<typeof AccumulationBuffer>){b.copyTo(target)},tick(_dt:number,opt:{progress?:number}){if(opt.progress===1)target.copyTo(shown);return shown}}
 memory.presentations.push(api);return api
 }catch(e){for(const b of buffers)b.destroy();throw e}
 }}
})
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {RibbonScratchPool} from '../../buffers/RibbonScratchPool'
import {RibbonStrokeScratch} from '../../buffers/RibbonStrokeScratch'
import {PagedPuddleRoomController,type PagedPuddleRoomHost} from './PagedPuddleRoomController'
import {presentationRegion,renderPuddleRegion,type PresentationBounds,type PresentationRegion} from './PuddlePresentationRegion'
function pixels(b:AccumulationBuffer){return (b as unknown as {pixels:Uint8Array}).pixels}
interface State{region:PresentationRegion;raw:AccumulationBuffer;next:AccumulationBuffer;goal:AccumulationBuffer;presentation:{shown:AccumulationBuffer}}
function fixture(proven=true,tileSpecs=[{x:0,y:0,w:512,h:512}]){
 vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{})
 const gl={} as WebGLRenderingContext,pool=new RibbonScratchPool(gl),make=(w:number,h:number)=>new AccumulationBuffer(gl,w,h)
 const tiles:PaintTarget[]=tileSpecs.map(t=>{const b=make(t.w,t.h);pixels(b).fill(10);return {buffer:b,originX:t.x,originY:t.y,contentRect:null}})
 const target={allResident:()=>tiles,resolveForPaint:()=>tiles} as unknown as ILayerBuffer
 let current:RibbonStrokeScratch;const solver={state:{done:true},resetFromScratch(s:RibbonStrokeScratch){current=s;this.state.done=false},step(){this.state.done=true},buffers(tile:PaintTarget){const e=current.peek(tile.buffer)!;return {p:e.inkLoad!,c:e.inkColor!,coverage:e.coverage}},dry:()=>true,cancel:vi.fn(),destroy(){}}
 const origins:Array<{x:number;y:number;width:number;height:number}>=[]
 const host={createSolver:()=>solver,gl,size:{width:1024,height:1024},pool,makeBuffer:make,settlePlan:{prepare(){}},changed(){},released(){},drawing:()=>false,display(){},
 presentationBounds:proven?(s:RibbonStrokeScratch,c:{bounds:PresentationBounds})=>s.foreignSources?.length||s.foreignImportedGestures.size?null:c.bounds:undefined,
 render:(s:RibbonStrokeScratch,t:PaintTarget,_c:unknown,out:AccumulationBuffer,m:{p:AccumulationBuffer})=>{const original=s.peek(t.buffer)!.original;origins.push({x:t.originX,y:t.originY,width:out.width,height:out.height});const o=pixels(original),p=pixels(m.p),v=pixels(out);for(let i=0;i<v.length;i++)v[i]=Math.min(255,o[i]+p[i])},
 } as unknown as PagedPuddleRoomHost
 const controller=new PagedPuddleRoomController(host),profile={ink:true,normalizeDeposit:true} as Parameters<typeof controller.source>[2]
 const state=(tile=tiles[0])=>(Reflect.get(controller,'layers') as Map<ILayerBuffer,{tiles:Map<AccumulationBuffer,State>}>).get(target)!.tiles.get(tile.buffer)!
 const source=(gesture='g')=>controller.source(target,gesture,profile,1)
 function paint(bounds:PresentationBounds,gesture='g',value=20){const {scratch}=source(gesture);for(const tile of tiles){const e=scratch.getOrCreate(tile.buffer);for(let y=Math.max(tile.originY,bounds.minY);y<Math.min(tile.originY+tile.buffer.height,bounds.maxY);y++)for(let x=Math.max(tile.originX,bounds.minX);x<Math.min(tile.originX+tile.buffer.width,bounds.maxX);x++){const i=((tile.buffer.height-1-(y-tile.originY))*tile.buffer.width+x-tile.originX)*4;pixels(e.inkLoad!).fill(value,i,i+4);pixels(e.coverage).fill(255,i,i+4)}}
 scratch.noteFinish({target,bounds,preset:{},profile,color:[0,0,0],opacity:1,fieldSeed:[3,4],landedWet:0,wetPeak:1,radiusPx:40,dwellMs:0} as Parameters<typeof scratch.noteFinish>[0]);controller.finish(scratch);return scratch}
 const at=(b:AccumulationBuffer,x:number,y:number)=>pixels(b)[((b.height-1-y)*b.width+x)*4]
 function finish(){controller.destroy();pool.trimFree();expect(pool.bytes.live).toBe(0);for(const t of tiles)t.buffer.destroy();vi.unstubAllGlobals()}
 return{gl,pool,tiles,target,controller,profile,host,state,source,paint,at,finish,origins,solver}
}
it.each([{minX:20,minY:240,maxX:40,maxY:260},{minX:470,minY:240,maxX:490,maxY:260},{minX:240,minY:20,maxX:260,maxY:40},{minX:240,minY:470,maxX:260,maxY:490}])('expands ROI conservatively, preserving old raw and SHOWN while retiring old resources: %j',bounds=>{
 const f=fixture();try{
 f.paint({minX:240,minY:240,maxX:260,maxY:260});const old=f.state(),goal=old.goal
 const oldX=250-old.region.x,oldY=512-1-250-old.region.y;pixels(old.presentation.shown).fill(77,(oldY*old.region.width+oldX)*4,(oldY*old.region.width+oldX)*4+4)
 f.paint(bounds,'g2',40);const next=f.state()
 expect(next.goal).toBe(goal);expect(next.raw.width).toBe(next.region.width);expect(next.raw.height).toBe(next.region.height);expect(next.goal.width).toBe(512)
 expect(f.at(f.tiles[0].buffer,250,250)).toBe(77)
 expect(f.at(next.raw,250-next.region.x,250-(512-next.region.y-next.region.height))).toBe(30)
 expect((old.raw as unknown as {destroyed:boolean}).destroyed).toBe(true)
 expect(next.region.x).toBeLessThanOrEqual(old.region.x);expect(next.region.y).toBeLessThanOrEqual(old.region.y)
 expect(next.region.x+next.region.width).toBeGreaterThanOrEqual(old.region.x+old.region.width);expect(next.region.y+next.region.height).toBeGreaterThanOrEqual(old.region.y+old.region.height)
 expect(f.at(f.tiles[0].buffer,2,2)).toBe(10)
 }finally{f.finish()}
})
it('keeps canonical full-sized and commits erased dry base outside ROI without losing wet material',()=>{
 const f=fixture();try{
 f.paint({minX:240,minY:240,maxX:260,maxY:260});expect(f.state().raw.width).toBeLessThan(512)
 const canonical=f.controller.canonicalTiles(f.target);expect(canonical[0].buffer.width).toBe(512);expect(f.at(canonical[0].buffer,250,250)).toBe(30);expect(f.at(canonical[0].buffer,2,2)).toBe(10)
 f.controller.eraseDryBase(f.target,b=>pixels(b).fill(50));expect(f.at(f.tiles[0].buffer,2,2)).toBe(50)
 f.controller.close(f.target);expect(f.at(f.tiles[0].buffer,250,250)).toBe(70);expect(f.at(f.tiles[0].buffer,2,2)).toBe(50)
 }finally{f.finish()}
})
it('clips seams and partial edge textures, mapping bottom-up ROI back to exact world origin',()=>{
 const f=fixture(true,[{x:0,y:0,w:512,h:512},{x:512,y:0,w:120,h:512},{x:512,y:512,w:120,h:80}]);try{
 f.paint({minX:500,minY:500,maxX:530,maxY:530})
 for(const tile of f.tiles){const s=f.state(tile);expect(s.region.x+s.region.width).toBeLessThanOrEqual(tile.buffer.width);expect(s.region.y+s.region.height).toBeLessThanOrEqual(tile.buffer.height);expect(s.region.width).toBeGreaterThan(0)}
 const edge=f.state(f.tiles[2]);expect(edge.region).toEqual({x:0,y:0,width:120,height:80})
 expect(f.origins).toContainEqual({x:384,y:384,width:128,height:128})
 expect(f.at(f.tiles[1].buffer,5,505)).toBe(30);expect(f.at(f.tiles[2].buffer,5,5)).toBe(30)
 f.controller.close(f.target);expect(f.at(f.tiles[2].buffer,100,70)).toBe(10)
 }finally{f.finish()}
})
it('skips untouched tiles on accept and keeps previous wet state SHOWN until the shared goal completes',()=>{
 const f=fixture(true,[{x:0,y:0,w:512,h:512},{x:512,y:0,w:512,h:512}]);try{
 f.paint({minX:100,minY:100,maxX:120,maxY:120});expect(f.state(f.tiles[1])).toBeUndefined()
 const oldShown=f.state().presentation.shown,oldPresent=vi.spyOn(oldShown,'copyRegionInto')
 f.paint({minX:600,minY:100,maxX:620,maxY:120},'g2');expect(oldPresent).not.toHaveBeenCalled();expect(f.at(f.tiles[0].buffer,110,110)).toBe(30);expect(f.at(f.tiles[1].buffer,98,110)).toBe(30)
 expect(f.state(f.tiles[0]).raw.width).toBeLessThan(512)
 }finally{f.finish()}
})
it.each(['no-proof','foreign','invalid'] as const)('falls back to whole tiles for %s',kind=>{
 const f=fixture(kind!=='no-proof');try{
 const src=f.source().scratch;if(kind==='foreign')src.foreignImportedGestures.add('foreign');if(kind==='invalid')f.host.presentationBounds=()=>({minX:NaN,minY:0,maxX:20,maxY:20})
 f.paint({minX:240,minY:240,maxX:260,maxY:260});expect(f.state().region).toEqual({x:0,y:0,width:512,height:512})
 }finally{f.finish()}
})
it('retains proven wet-epoch bounds across beginStroke and CPU snapshot restore; old snapshots stay unknown',()=>{
 const f=fixture();let restored:RibbonStrokeScratch|undefined,legacy:RibbonStrokeScratch|undefined;try{
 const s=f.paint({minX:100,minY:100,maxX:120,maxY:120});f.paint({minX:300,minY:300,maxX:320,maxY:320},'g2')
 expect(s.retainedInputBounds).toEqual({minX:100,minY:100,maxX:320,maxY:320})
 const snap=f.controller.capture(f.target)!;restored=RibbonStrokeScratch.restoreCpu(f.pool,snap,f.target);expect(restored.retainedInputBounds).toEqual(s.retainedInputBounds)
 const old={...snap};delete old.retainedInputBounds;legacy=RibbonStrokeScratch.restoreCpu(f.pool,old,f.target);expect(legacy.retainedInputBounds).toBeUndefined();legacy.beginStroke();legacy.noteRetainedInputBounds({minX:1,minY:1,maxX:2,maxY:2});expect(legacy.retainedInputBounds).toBeUndefined()
 }finally{restored?.destroy();legacy?.destroy();f.finish()}
})
it('releases every ephemeral crop lease on render throw and succeeds on the next operation',()=>{
 const f=fixture();try{
 f.paint({minX:240,minY:240,maxX:260,maxY:260});const s=f.source().scratch,state=f.state(),entry=s.peek(f.tiles[0].buffer)!,before=f.pool.bytes.live
 const render=f.host.render;f.host.render=()=>{throw Error('render fault')}
 expect(()=>renderPuddleRegion(f.host,s,f.tiles[0],s.finishContext!,state.next,{p:entry.inkLoad!,c:entry.inkColor!,coverage:entry.coverage},state.region)).toThrow('render fault')
 expect(f.pool.bytes.live).toBe(before);f.host.render=render
 renderPuddleRegion(f.host,s,f.tiles[0],s.finishContext!,state.next,{p:entry.inkLoad!,c:entry.inkColor!,coverage:entry.coverage},state.region);expect(f.pool.bytes.live).toBe(before)
 }finally{f.finish()}
})
it.each([1,2,3,4,5,6,7,8,9,10])('does not publish a partially allocated expansion and preserves old display on failure %s',failAt=>{
 const f=fixture();try{
 f.paint({minX:240,minY:240,maxX:260,maxY:260});const old=f.state(),before=new Set(memory.live),make=f.host.makeBuffer!;let n=0
 f.host.makeBuffer=(...args)=>{if(++n===failAt)throw Error('budget');return make(...args)}
 expect(()=>f.paint({minX:20,minY:240,maxX:40,maxY:260},'g2')).toThrow('budget');expect(f.state()).toBe(old);expect(memory.live.size).toBe(before.size);expect(f.at(f.tiles[0].buffer,250,250)).toBe(30)
 f.host.makeBuffer=make;f.controller.accept(f.source('g2').scratch);expect(f.state()).not.toBe(old)
 }finally{f.finish()}
})
it('does not allocate readback storage for ROI rendering and rounds only inside physical bounds',()=>{
 const f=fixture();try{
 const read=vi.spyOn(AccumulationBuffer.prototype,'readPixels');f.paint({minX:240,minY:240,maxX:260,maxY:260});expect(read).not.toHaveBeenCalled()
 expect(presentationRegion(f.tiles[0],{minX:513,minY:0,maxX:520,maxY:10},0)).toBeNull()
 expect(f.state().raw.width%64).toBe(0);expect(f.state().raw.height%64).toBe(0)
 read.mockRestore()
 }finally{f.finish()}
})
it.each([1,2,3,4])('releases crop leases on partial scratch allocation failure %s',failAt=>{
 const f=fixture();try{
 const s=f.paint({minX:240,minY:240,maxX:260,maxY:260}),state=f.state(),e=s.peek(f.tiles[0].buffer)!,before=f.pool.bytes.live
 const acquire=f.pool.acquire.bind(f.pool);let n=0
 const spy=vi.spyOn(f.pool,'acquire').mockImplementation((w,h)=>{if(++n===failAt)throw Error('cache budget');return acquire(w,h)})
 expect(()=>renderPuddleRegion(f.host,s,f.tiles[0],s.finishContext!,state.next,{p:e.inkLoad!,c:e.inkColor!,coverage:e.coverage},state.region)).toThrow('cache budget')
 expect(f.pool.bytes.live).toBe(before);spy.mockRestore()
 renderPuddleRegion(f.host,s,f.tiles[0],s.finishContext!,state.next,{p:e.inkLoad!,c:e.inkColor!,coverage:e.coverage},state.region);expect(f.pool.bytes.live).toBe(before)
 }finally{f.finish()}
})
it('parks and awakens a cold source with the same small ROI using retained input metadata',()=>{
 const f=fixture(),extra:AccumulationBuffer[]=[];try{
 f.paint({minX:240,minY:240,maxX:260,maxY:260});const expected=f.state().region
 const makeTarget=()=>{const buffer=new AccumulationBuffer(f.gl,512,512);extra.push(buffer);return {allResident:()=>[{buffer,originX:0,originY:0,contentRect:null}],resolveForPaint:()=>[{buffer,originX:0,originY:0,contentRect:null}]} as unknown as ILayerBuffer}
 const second=makeTarget(),other=f.controller.source(second,'g2',f.profile,1).scratch
 other.getOrCreate(second.allResident()[0].buffer);other.noteFinish({target:second,bounds:{minX:240,minY:240,maxX:260,maxY:260},preset:{},profile:f.profile,color:[0,0,0],opacity:1,fieldSeed:[0,0],landedWet:0,wetPeak:1,radiusPx:40,dwellMs:0} as Parameters<typeof other.noteFinish>[0]);f.controller.finish(other)
 f.controller.source(makeTarget(),'g3',f.profile,1);expect(f.controller.state.parkedLayers).toBe(1)
 f.source();expect(f.state().region).toEqual(expected);expect(f.state().raw.width).toBeLessThan(512)
 }finally{f.finish();for(const b of extra)b.destroy()}
})
it('cancels an in-flight solver, closes Dry to full canonical pixels and releases ROI resources on clear',()=>{
 const f=fixture();try{
 const scratch=f.paint({minX:240,minY:240,maxX:260,maxY:260})
 const layer=(Reflect.get(f.controller,'layers') as Map<ILayerBuffer,unknown>).get(f.target)
 Reflect.get(f.controller,'start').call(f.controller,layer);f.controller.beforePaint(scratch);expect(f.solver.cancel).toHaveBeenCalledTimes(1)
 f.controller.dry(f.target);f.controller.finishDrying();expect(f.controller.has(f.target)).toBe(false);expect(f.at(f.tiles[0].buffer,250,250)).toBe(30);expect(f.at(f.tiles[0].buffer,2,2)).toBe(10)
 f.tiles[0].buffer.clear();expect(pixels(f.tiles[0].buffer).every(v=>v===0)).toBe(true)
 }finally{f.finish()}
})
it('keeps full canonical and source bytes identical to the whole-tile path across separate gestures',()=>{
 const run=(proof:boolean)=>{const f=fixture(proof);try{
 for(const [i,b]of [{minX:100,minY:100,maxX:120,maxY:120},{minX:360,minY:300,maxX:380,maxY:320},{minX:200,minY:200,maxX:225,maxY:225}].entries())f.paint(b,'g'+i,20+i*10)
 const source=f.source('g2').scratch,entry=source.peek(f.tiles[0].buffer)!
 const raw=[entry.inkLoad!,entry.inkColor!,entry.coverage].map(b=>pixels(b).slice())
 const canonical=f.controller.canonicalTiles(f.target).map(t=>pixels(t.buffer).slice())
 return {raw,canonical}
 }finally{f.finish()}}
 const a=run(true),b=run(false)
 for(const kind of ['raw','canonical'] as const)for(let i=0;i<a[kind].length;i++)expect(Buffer.compare(Buffer.from(a[kind][i]),Buffer.from(b[kind][i]))).toBe(0)
})
