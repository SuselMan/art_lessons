import {expect,it} from 'vitest'
import fixture from './fixtures/sourceRotationMix.native.json'
import {sourceRotationMixDegrees} from './sourceRotationMix'
const bits=(value:number)=>{const data=new DataView(new ArrayBuffer(8));data.setFloat64(0,value);return data.getBigUint64(0).toString(16).padStart(16,'0')}
it('matches pinned source C++ F64 circular interpolation, including wrap, antipodal ties and unchanged angles',()=>{
 expect(fixture.rows).toHaveLength(198)
 for(const row of fixture.rows)expect(bits(sourceRotationMixDegrees(row.a,row.b,row.t)),JSON.stringify(row)).toBe(row.bits)
})

import startup from './fixtures/sourceStrokeStartup.native.json'
import {sourceStrokeAuthorDescriptor} from './sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceAuthorPacket,type SourceStrokeAuthorState,type SourceStrokeAuthorStep} from './sourceStrokeAuthor'
import type {BrushDescriptor} from '@grafetto/shared'
const packet=(x:number,rotation:number,t:number):SourceAuthorPacket=>({x,y:0,t,pressure:.5,tiltX:0,tiltY:0,speed:0,rotation,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})
function drain(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>){
 const steps:SourceStrokeAuthorStep[]=[]
 while(true){const n=iterator.next();if(n.done)return {steps,state:n.value};steps.push(n.value)}
}
function authorProgram(){
 const p=sourceStrokeAuthorDescriptor(startup.row.descriptor as unknown as BrushDescriptor,{colorIdentity:'rotation-law-test',lodScale:1,coverageProfile:'neon64-f32-fma-v1',inputProfile:'krita-freehand-no-smoothing-v1'})
 if(!p.supported)throw Error(p.reasons.join(','))
 // Synthetic input-law witness: tighter spacing exercises repeated interpolation.
 // This is not a native GUI/preset pixel admission.
 return {...p.program,id:'rotation-law-test',roles:p.program.roles.map(r=>({...r,spacing:{...r.spacing,value:.001}}))}
}
it('interpolates changing pen rotation through the same native-profile author and preserves resumable checkpoints',()=>{
 const program=authorProgram(),author=new SourceStrokeAuthor(program)
 const initial=drain(author.plan(author.createState(4321,7654,0),packet(0,350,0))).state
 const result=drain(author.plan(initial,packet(4,10,100)))
 const paints=result.steps.filter(s=>s.query==='paint')
 expect(paints.length).toBeGreaterThan(3)
 let previous=packet(0,350,0)
 for(const paint of paints){
  const next=paint.packet!,fraction=(next.x-previous.x)/(4-previous.x)
  // Inverting mixed x recovers fraction only approximately; scalar fixture
  // above verifies the actual F64 law bit-for-bit independently.
  expect(next.rotation).toBeCloseTo(sourceRotationMixDegrees(previous.rotation,10,fraction),12)
  previous=next
 }
 expect(result.state.lastInput!.rotation).toBe(10)
 for(const [i,step]of result.steps.entries()){
  if(!step.state.cursor){expect(step.state).toEqual(result.state);continue}
  const resumed=drain(new SourceStrokeAuthor(program).resume(structuredClone(step.state)))
  expect(resumed.steps).toEqual(result.steps.slice(i+1));expect(resumed.state).toEqual(result.state)
 }
 expect(initial.lastInput!.rotation).toBe(350)
})
it('keeps the historical author profile rotation restriction',()=>{
 const program={...authorProgram(),inputProfile:undefined},author=new SourceStrokeAuthor(program)
 const state=drain(author.plan(author.createState(4321,7654,0),packet(0,350,0))).state
 expect(()=>author.plan(state,packet(4,10,100)).next()).toThrow('rotation')
})
