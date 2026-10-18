import {create,MACRO9_PAIR} from './macro9-integer-smooth'
import {EXACT_BOUNDED_DIVIDE} from './exact-bounded-divide'
import {singlePairSource} from './exact-pair-dispatch'
import {integerOption} from './contract'

/** Bounded exact program search: arithmetic/output preserved, no physics change. */
export function fastDivideSource(source:string){
 const anchors=[
  ['(m[c]*alpha+den/2u)/den','exactBoundedDiv(m[c]*alpha+den/2u,den)'],
  ['(c.m.a*absorbed+den/2u)/den','exactBoundedDiv(c.m.a*absorbed+den/2u,den)'],
  ['(c.m[k]*alpha+ma/2u)/ma','exactBoundedDiv(c.m[k]*alpha+ma/2u,ma)'],
  ['(donor.m.a*q+den/2u)/den','exactBoundedDiv(donor.m.a*q+den/2u,den)'],
  ['(donor.m[k]*alpha+ma/2u)/ma','exactBoundedDiv(donor.m[k]*alpha+ma/2u,ma)'],
 ]
 for(const [old,replacement] of anchors){if(source.split(old).length!==2)throw Error('Exact divider source anchor drift: '+old);source=source.replace(old,replacement)}
 return EXACT_BOUNDED_DIVIDE+source
}
export function exactProgramSource(program:number){
 if(!Number.isInteger(program)||program<0||program>3)throw Error('Exact program range')
 let source=MACRO9_PAIR
 if(program&2)source=fastDivideSource(source)
 if(program&1)source=singlePairSource(source)
 return source
}
export const exactProgramDefinitions=[{
 id:'wgsl-macro-integer-exact-program',label:'То же смешение — точные оптимизации программы',
 configs:[0,1,2,3].map(program=>({program,steps:128,smooth:1})),
 create:(device:GPUDevice,size:number,config:Record<string,number>={})=>{
  const program=integerOption(config.program??0,0,3,'program')
  return create(device,size,config,{pairSourceOverride:exactProgramSource(program)})
 }
}]
