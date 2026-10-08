import{expect,it}from'vitest'
import{TypedGlSourceReplayPrototype,type SourceFieldRole,type TypedGlSourcePort}from'./TypedGlSourceReplayPrototype'
import type{CanonicalDrawCommand}from'../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
const commands=()=>['coverage','solvent','pigment','color','halo'].map(phase=>({kind:'ribbon',phase,batch:{vertices:new Float32Array([1,-0,3,0,0,0,0,0,0,0,0]),inkBlend:'max',uniforms:{aaPx:1,washWater:1,waterRetain:1,bristleCombs:2,bristleInk:0,tau:[1,2,3],worldOrigin:[0,0],mottleSeed:[4,5],cloudDeposit:0,granDeposit:0,poolBlot:0,useAvailableWater:false}}}))as CanonicalDrawCommand[]
const makePort=(events:string[])=>{let version=0;const fields=Object.fromEntries(['coverage','coverageFilm','pigmentLoad','pigmentBase','pigmentFilm','colourLoad','colourBase','colourFilm','solventLoad','solventBase','solventFilm'].map(role=>[role,role+'@new']))as Record<SourceFieldRole,string>;const port:TypedGlSourcePort<string>={bindCurrentCanonical(){events.push('bind:'+version);return{landedVersion:version,fields}},clear:f=>events.push('clear:'+f),copy:(a,b)=>events.push('copy:'+a+'>'+b),draw:(c,f,_cov,blend)=>events.push('draw:'+c.phase+':'+f+':'+blend+':'+Array.from(new Uint32Array((c.kind==='ribbon'?c.batch.vertices:new Float32Array()).buffer)).join(',')),basePlusFilm:(d,a,b)=>events.push('sum:'+d+':'+a+'+'+b)};return{port,land(){version=1}}}
it('late binds actual predecessor fields and preserves init/source/land order with owned F32 inputs',()=>{
 const original=commands(),record=new TypedGlSourceReplayPrototype({segments:[{commands:original,rect:[1,2,3,4]}],expectedPredecessorVersion:1,film:true,captureRunningCoverage:true}),events:string[]=[],p=makePort(events)
 expect(()=>record.execute(p.port)).toThrow('not ready');p.land();if(original[2].kind==='ribbon')original[2].batch.vertices.fill(99);record.execute(p.port)
 expect(events.map(x=>x.split(':').slice(0,2).join(':'))).toEqual(['bind:0','bind:1','copy:coverage@new>coverageFilm@new','clear:pigmentFilm@new','copy:pigmentLoad@new>pigmentBase@new','clear:colourFilm@new','copy:colourLoad@new>colourBase@new','draw:coverage','clear:solventFilm@new','copy:solventLoad@new>solventBase@new','draw:solvent','sum:solventLoad@new','draw:pigment','draw:color','draw:halo','sum:pigmentLoad@new','sum:colourLoad@new'])
 expect(events.find(x=>x.startsWith('draw:pigment'))).toContain('1065353216,2147483648,1077936128');expect(()=>record.execute(p.port)).toThrow('single-use')
})
it('keeps every segment sum boundary; rejects flattened multi-segment order and blend changes',()=>{
 const c=commands();expect(()=>new TypedGlSourceReplayPrototype({segments:[{commands:[...c,...c],rect:null}],expectedPredecessorVersion:1,film:true,captureRunningCoverage:false})).toThrow('phase boundaries')
 const record=new TypedGlSourceReplayPrototype({segments:[{commands:c,rect:[0,0,1,1]},{commands:c,rect:[0,0,1,1]}],expectedPredecessorVersion:1,film:true,captureRunningCoverage:false}),events:string[]=[],p=makePort(events);p.land();record.execute(p.port);expect(events.filter(x=>x.startsWith('sum:'))).toHaveLength(6);expect(events.filter(x=>x.startsWith('clear:'))).toHaveLength(3)
 if(c[1].kind==='ribbon')c[1].batch.inkBlend='add';expect(()=>new TypedGlSourceReplayPrototype({segments:[{commands:c,rect:null}],expectedPredecessorVersion:1,film:true,captureRunningCoverage:false})).toThrow('blend/film mismatch')
})

it('water-only preserves V landing and never sums material P/C',()=>{const c=commands().slice(0,2),record=new TypedGlSourceReplayPrototype({segments:[{commands:c,rect:[0,0,1,1],waterOnly:true}],expectedPredecessorVersion:1,film:true,captureRunningCoverage:false}),events:string[]=[],p=makePort(events);p.land();record.execute(p.port);expect(events.filter(x=>x.startsWith('sum:'))).toEqual(['sum:solventLoad@new:solventBase@new+solventFilm@new'])})

 it('continuation retains predecessor chunk films and sums without any new clear/base copy',()=>{
 const events:string[]=[],p=makePort(events);p.land();
 const first=new TypedGlSourceReplayPrototype({segments:[{commands:commands(),rect:[0,0,1,1]}],expectedPredecessorVersion:1,film:true,captureRunningCoverage:true});first.execute(p.port);
 const split=events.length;
 const continuation=new TypedGlSourceReplayPrototype({segments:[{commands:commands(),rect:[0,0,1,1]}],expectedPredecessorVersion:1,film:true,captureRunningCoverage:false,initializeMaterialFilm:false,initializeSolventFilm:false});continuation.execute(p.port);
 const tail=events.slice(split);expect(tail.filter(x=>x.startsWith('clear:')||x.startsWith('copy:'))).toEqual([]);expect(tail.filter(x=>x.startsWith('draw:'))).toHaveLength(5);expect(tail.filter(x=>x.startsWith('sum:'))).toHaveLength(3);
 })
