import {it,expect} from 'vitest'
import {keepM70FixedGroup} from './M70FixedWindowSkip'
import {m70WindowGroups} from './M70WindowGroups'
import {capturePagedPuddleSource} from './PagedPuddleSource'
import {createPagedPuddleTarget} from './PagedPuddleTarget'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {MockGL} from '../../../testing/mockGL'

it('keeps only certified32 point-distance intersections across every fixed geometry, with unknown/foreign612 fallback',()=>{
 for(const [width,height]of [[1240,1754],[1754,1240],[1754,2480],[2480,1754],[2480,3508],[3508,2480]]){
 const page={width,height},s={x:1000,y:height-300,width:100,height:100},proof={...page,rect:s,rects:[s],noForeignStencil:true as const}
 let kept32=0,kept612=0
 for(const group of m70WindowGroups(page,{width:Math.max(1536,Math.ceil(width/256)*256),height:Math.max(1536,Math.ceil(height/256)*256)},612)){
 const before=JSON.stringify(group),top=height-s.y-s.height
 const expected=group.cores.some(c=>c.x<s.x+s.width+32&&c.x+c.width>s.x-32&&c.y<top+s.height+32&&c.y+c.height>top-32)
 const actual=keepM70FixedGroup(page,group,proof,32),baseline=keepM70FixedGroup(page,group,proof)
 expect(actual).toBe(expected);if(actual)expect(baseline).toBe(true)
 for(const unknown of [{...proof,noForeignStencil:undefined},{...proof,noForeignStencil:false}])expect(keepM70FixedGroup(page,group,unknown as any,32)).toBe(baseline)
 expect(JSON.stringify(group)).toBe(before);kept32+=Number(actual);kept612+=Number(baseline)
 }
 expect(kept32).toBeLessThan(kept612)
 }
})
it('capture trusts only explicit null/empty foreign metadata, never absent/foreign',()=>{
 for(const foreignSources of [null,[],undefined,[{gesture:'foreign'}]]){
 const source={foreignSources},target={allResident:()=>[]}
 const raw=capturePagedPuddleSource(source as any,target as any,{width:8,height:8},{} as any,{} as any)
 expect(raw.materialSupport?.noForeignStencil).toBe(foreignSources===null||(Array.isArray(foreignSources)&&foreignSources.length===0)?true:undefined)
 }
})
for(const mode of ['off','on','unknown','foreign','metadataMismatch','changed','cancel'])it('actual Paged inspector default/fallback/foreign revision handling '+mode,()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,make=(w:number,h:number,f:any)=>new AccumulationBuffer(gl,w,h,f),decisions:Array<{radius:number;noForeignStencil:boolean;kept:boolean}>=[]
 let metadata:any=mode==='metadataMismatch'?[{gesture:'foreign'}]:null
 const source={foreignSources:mode==='unknown'?undefined:mode==='foreign'?[{gesture:'foreign'}]:null,captureFinishMetadata:()=>({foreignSources:metadata})}
 let solver:ReturnType<typeof createPagedPuddleTarget>
 solver=createPagedPuddleTarget({gl,pool:{},passes:{}} as any,{width:2048,height:8},make,{tightMaterialSupport32:mode!=='off',skipEmptyFixedWindows:true,windowSupport(_field,_cores,d){decisions.push(d);if(mode==='changed')metadata=[{gesture:'new'}];if(mode==='cancel')solver.cancel()}})
 try{
 solver.resetFromScratch(source as any,{allResident:()=>[]} as any,1)
 if(mode==='changed')expect(()=>{for(let i=0;i<50&&!solver.state.done;i++)solver.step(1)}).toThrow('metadata changed')
 else{for(let i=0;i<50&&!solver.state.done;i++)solver.step(1);expect(solver.state.done).toBe(true)}
 expect(decisions.length).toBeGreaterThan(0)
 expect(decisions.every(d=>!d.kept)).toBe(true)
 const expected=['on','changed','cancel'].includes(mode)?32:612
 expect(decisions.every(d=>d.radius===expected)).toBe(true)
 }finally{solver.destroy()}
})

for(const at of ['last-window-yield','postphase'] as const)it(`rejects new foreign metadata at ${at} before publishing skipped material`,()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext
 let foreignSources:unknown=null,windows=0
 const page={width:2048,height:8},domain={width:2048,height:1536},total=m70WindowGroups(page,domain,612).length
 const source={foreignSources:null,captureFinishMetadata:()=>({foreignSources})}
 const solver=createPagedPuddleTarget({gl,pool:{},passes:{}} as any,page,(w,h,f)=>new AccumulationBuffer(gl,w,h,f),{
  tightMaterialSupport32:true,skipEmptyFixedWindows:true,
  windowSupport(){windows++},coarse(){if(at==='postphase')foreignSources=[{gesture:'new'}]},
 })
 try{
  solver.resetFromScratch(source as any,{allResident:()=>[]} as any,1)
  if(at==='last-window-yield'){
   for(let i=0;i<100&&windows<total;i++)solver.step(1)
   expect(windows).toBe(total)
   foreignSources=[{gesture:'new'}]
  }
  expect(()=>{for(let i=0;i<100&&!solver.state.done;i++)solver.step(1)}).toThrow('metadata changed')
 }finally{solver.destroy()}
})
