import { expect,it,vi } from 'vitest'
import { CanonicalSourcePhaseExecutor } from './sourcePhaseExecutor'
import type { CanonicalDrawCommand } from '../dabs/canonicalStrokeChunk'

function fixture(){
 const events:string[]=[],backend={encodePreparedStamp:vi.fn((_encoder,stamp,phase,targets)=>{events.push(`${stamp.tag}:${phase}:${targets.pigment.label}:${targets.color.label}`);return[]}),encodePreparedRibbon:vi.fn(()=>[])} as any
 const buffer=(label:string)=>({width:32,height:32,owner:backend,field:{label},clear(){events.push(`clear:${label}`)},copyTo(out:any){events.push(`copy:${label}:${out.field.label}`)}})
 const e={coverage:buffer('cov'),inkLoad:buffer('P'),inkColor:buffer('C'),foreignSolventLoad:null} as any
 const film={strokeInk:buffer('Pf'),inkBase:buffer('Pb'),strokeColor:buffer('Cf'),colorBase:buffer('Cb')},solvent={load:buffer('V'),base:buffer('Vb'),film:buffer('Vf')}
 const pool={owner:backend,acquire:()=>buffer('tmp'),release:()=>events.push('release')}
 const scratch={pool,getOrCreate:()=>e,runningCoverage:()=>{},filmBuffers:()=>film,solventFilm:()=>solvent} as any
 const passes={fieldOp(out:any,a:any,b:any,mode:number){events.push(`field:${out.field.label}:${a.field.label}:${b.field.label}:${mode}`)}}
 const tile={originX:100,originY:200,buffer:buffer('tile')} as any
 return{events,backend,e,film,solvent,scratch,passes,tile,owner:new CanonicalSourcePhaseExecutor(backend,scratch,[tile],passes),buffer}
}
const stamp=(phase:CanonicalDrawCommand['phase'],tag=phase)=>({kind:'stamp',phase,stamp:{tag}} as unknown as CanonicalDrawCommand)
it('source phases land V before P/C and P/C only after halo, preserving material pair',()=>{
 const f=fixture();f.owner.execute({} as any,{commands:['coverage','solvent','pigment','color','halo'].map(p=>stamp(p as any)),rect:[1,2,3,4],film:true,waterOnly:false},1)
 expect(f.events).toEqual(['coverage:coverage:cov:cov','solvent:pigment:Vf:Vf','field:V:Vb:Vf:1','pigment:pigment:Pf:Cf','color:color:Pf:Cf','halo:pigment:Pf:Cf','field:P:Pb:Pf:1','field:C:Cb:Cf:1'])
})
it('water-only lands solvent without pigment/material rebuild',()=>{
 const f=fixture();f.owner.execute({} as any,{commands:[stamp('coverage'),stamp('solvent')],rect:[0,0,32,32],film:true,waterOnly:true},1)
 expect(f.events).toEqual(['coverage:coverage:cov:cov','solvent:pigment:Vf:Vf','field:V:Vb:Vf:1'])
})
it('foreign donor import uses production mode20 then independent solvent ADD, once per gesture',()=>{
 const f=fixture(),donor={coverage:f.buffer('donorCov'),solventLoad:f.buffer('donorV')} as any
 f.owner.importForeign(5,donor);f.owner.importForeign(5,donor)
 expect(f.events).toEqual(['field:tmp:cov:donorCov:20','copy:tmp:cov','clear:tmp','field:tmp:tmp:donorV:1','copy:tmp:tmp','release'])
})
it('rejects multi-tile and flattened multi-segment commands explicitly',()=>{
 const f=fixture();expect(()=>new CanonicalSourcePhaseExecutor(f.backend,f.scratch,[f.tile,f.tile],f.passes)).toThrow('exactly one')
 expect(()=>f.owner.execute({} as any,{commands:[stamp('coverage'),stamp('pigment'),stamp('coverage')],rect:null,film:true,waterOnly:false},1)).toThrow('multiple segments')
})
it('forwards world vertices unchanged; backend owns the single localization',()=>{
 const f=fixture(),vertices=new Float32Array([110,220,1,2,3,4,5,6,7,8,9]),original=vertices.slice()
 const command={kind:'ribbon',phase:'coverage',batch:{vertices,inkBlend:'max',uniforms:{}}} as CanonicalDrawCommand
 f.owner.execute({} as any,{commands:[command],rect:null,film:true,waterOnly:false},1)
 expect(f.backend.encodePreparedRibbon.mock.calls[0][1].vertices).toBe(vertices);expect(vertices).toEqual(original)
})
