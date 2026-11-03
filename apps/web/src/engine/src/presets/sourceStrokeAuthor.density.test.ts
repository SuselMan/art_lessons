import {describe,it,expect} from 'vitest'
import {isBrushLibrary,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE as D,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_MATERIAL_LIMITS,canonicalDefaultAutoSourceBinding,canonicalSourceComposition,type BrushDescriptor} from '@grafetto/shared'
import stock from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {sourceStrokeAuthorDescriptor} from './sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceStrokeAuthorState,type SourceStrokeAuthorStep} from './sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter,copySourceMaterialContext} from './sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder} from './sourceCanonicalFrameEncoder'

/** Synthetic density variation of validated retained Basic2; not Marker_Dry. */
function descriptor(density=.8):BrushDescriptor {
 const library:unknown={schemaVersion:1,assets:[],skipped:[],brushes:[{descriptor:structuredClone(stock.rows[0].descriptor),name:'synthetic-density',source:'behavior-test',warnings:[]}]}
 if(!isBrushLibrary(library))throw Error('Invalid retained fixture')
 const d=library.brushes[0].descriptor,s=d.sourceStamp
 if(s?.version!==2||s.source.kind!=='defaultAuto')throw Error('default fixture')
 d.sourceStamp={...s,source:{...s.source,density}}
 return d
}
const context={colorIdentity:'black',lodScale:1,coverageProfile:D,inputProfile:'krita-freehand-no-smoothing-v1' as const}
const packet=(x:number,t:number,pressure=1)=>({x,y:80,t,pressure,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})
function run(resume:boolean,flush:boolean,density=.8,workUnits=CANONICAL_MATERIAL_LIMITS.workUnits){
 const d=descriptor(density),compiled=sourceStrokeAuthorDescriptor(d,context)
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const program=compiled.program,author=new SourceStrokeAuthor(program),pin=canonicalDefaultAutoSourceBinding(d,'a'.repeat(64),D,G)
 let state=author.createState(1234,5678,0)
 const material={version:2 as const,assets:[],primarySource:pin,budget:{...CANONICAL_MATERIAL_LIMITS,workUnits}}
 const adapter=new SourceStrokeMaterialAdapter(program,material,state),policy=canonicalSourceComposition(d,G)
 if(!policy)throw Error('composition')
 const encoder=new SourceCanonicalFrameEncoder({rasterProfile:G,brush:d.id+'@'+d.version,strokeId:'density-behavior',pigmentRgb8:[0,0,0],composition:{...policy,alphaDarken:'creamy',outerResourceOpacity:1},material})
 const accepted:ReturnType<typeof encoder.encode>[]=[],steps:SourceStrokeAuthorStep[]=[]
 const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const c of chunks)accepted.push(encoder.encode(c.packed))}
 const consume=(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>)=>{
  while(true){const next=iterator.next();if(next.done){state=next.value;return}
   steps.push(next.value);accept(adapter.accept(next.value));if(flush){const part=adapter.flush();if(part)accept([part])}
   if(resume){const saved=structuredClone(next.value.state);iterator.return(saved);if(!saved.cursor){state=saved;return}iterator=new SourceStrokeAuthor(program).resume(saved)}
  }
 }
 for(const p of [packet(40,0,.4),packet(60,100,.8),packet(80,200,1)]){accept(adapter.beginInput(state));consume(author.plan(state,p))}
 accept(adapter.beginInput(state));consume(author.finish(state));accept(adapter.finish(state))
 return{state,program,pin,accepted,steps,material}
}
describe('explicit default auto seeded density author/material law (not pixel execution)',()=>{
 it('uses the normal descriptor author adapter and encoder with original density retained',()=>{
  const actual=run(false,true)
  expect(run(true,true)).toEqual(actual)
  const role=actual.program.roles[0]
  expect(role.materialPolicy).toBe('default-auto-fixed1-seeded-density-v1')
  expect(role.material.supportsCaching).toBe(false)
  expect(actual.pin.source.density).toBe(.8)
  const copied=copySourceMaterialContext(actual.material)
  expect(copied.primarySource).toEqual(actual.pin)
  expect(copied.budget).toEqual({workUnits:actual.material.budget.workUnits,outputBytes:actual.material.budget.outputBytes,drawPixels:actual.material.budget.drawPixels})
  expect(Object.keys(copied.budget).sort()).toEqual(['drawPixels','outputBytes','workUnits'])
  const material=actual.steps.filter(s=>s.kind==='material')
  expect(material.length).toBeGreaterThan(2)
  expect(material.every(s=>s.result!.material!.type==='Dab')).toBe(true)
  const recipes=actual.accepted.flatMap(a=>a.frame.draws.map(draw=>a.frame.definitions[draw.definition]))
  expect(recipes.length).toBe(material.length)
  expect(recipes.every(r=>'kind'in r&&r.kind==='defaultAuto'&&r.coverageProfile===D&&r.source.density===.8)).toBe(true)
  expect(actual.accepted.every(a=>a.envelope.materialPacked.startsWith('2|'))).toBe(true)
  expect(actual.state.ended).toBe(true)
 })
 it('does not consume author RNG or change accepted materials through packing and yield resumes',()=>{
  const a=run(false,true),b=run(true,false),full=run(false,true,1)
  const draws=(r:typeof a)=>r.accepted.flatMap(a=>a.frame.draws.map(d=>({recipe:a.frame.definitions[d.definition],...d,definition:undefined})))
  expect(draws(a)).toEqual(draws(b))
  expect(a.state.random).toEqual(full.state.random);expect(a.state.perStroke).toEqual(full.state.perStroke)
  expect(a.state.random.draws).toBe(0)
  expect(full.program.roles[0].material.supportsCaching).toBe(true)
 })
 it('splits at the uncached full per-dab work bound before encoding',()=>{
  const actual=run(false,false,.8,70000)
  expect(actual.accepted.flatMap(a=>a.frame.draws).length).toBeGreaterThan(2)
  expect(actual.accepted.every(a=>a.frame.draws.length<=1)).toBe(true)
  expect(run(true,false,.8,70000)).toEqual(actual)
 })
 it('keeps old profiles closed and rejects forged caching/policy/pin/checkpoint combinations',()=>{
  expect(sourceStrokeAuthorDescriptor(descriptor(),{...context,coverageProfile:'neon64-f32-fma-v1'}).supported).toBe(false)
  const actual=run(false,true),original=actual.program
  const program={...original,roles:original.roles.map(role=>({...role,material:{...role.material,supportsCaching:true}}))}
  expect(()=>new SourceStrokeAuthor(program)).toThrow()
  const old=sourceStrokeAuthorDescriptor(descriptor(1),{...context,coverageProfile:'neon64-f32-fma-v1'})
  if(!old.supported)throw Error('old profile')
  const saved=actual.steps.find(step=>step.kind==='material')!.state
  expect(()=>new SourceStrokeAuthor(old.program).resume(saved).next()).toThrow('checkpoint')
  const wrongPolicy={...original,roles:original.roles.map(role=>({...role,materialPolicy:'default-auto-fixed1-rng-free' as const}))}
  expect(()=>new SourceStrokeAuthor(wrongPolicy)).toThrow('profile/policy mismatch')
  expect(()=>new SourceStrokeMaterialAdapter(actual.program,{...actual.material,primarySource:{...actual.pin,source:{...actual.pin.source,density:.7}}},actual.state)).toThrow()
 })
})
