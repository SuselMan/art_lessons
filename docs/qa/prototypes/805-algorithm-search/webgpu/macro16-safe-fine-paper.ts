import type {FixedWetFineOptions} from './fixed-wet-fine-hooks'
import {create as createFine,MACRO11_FINE_PACK,type FineConfig,type FineOverrides} from './macro11-fine-paper'
import {SAFE_REMAINDER_WGSL} from './macro15-safe-integer-dither'
import {mobilitySource} from './macro13-mobility-calibration'
import {integerOption,type Candidate} from './contract'
const anchor='randomCode(gid.x,gid.y,p.seed)%257u'
if(MACRO11_FINE_PACK.split(anchor).length!==2||MACRO11_FINE_PACK.split('@compute ').length!==2)throw Error('Safe fine pack source drift')
export const MACRO16_SAFE_FINE_PACK=MACRO11_FINE_PACK.replace('@compute ',SAFE_REMAINDER_WGSL+'@compute ').replace(anchor,'mod257ByteFold(randomCode(gid.x,gid.y,p.seed))')
export async function create(device:GPUDevice,size:number,config:FineConfig={},options:FineOverrides={}):Promise<Candidate>{
 if(options.packSourceOverride!==undefined)throw Error('Safe fine owns pack source')
 const base=await createFine(device,size,config,{...options,packSourceOverride:MACRO16_SAFE_FINE_PACK})
 return{get metadata(){return{...base.metadata,fineQuantization:'u32 exact bytefold shared-threshold display dither (no constant-remainder path)'}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export async function createMobility(device:GPUDevice,size:number,config:FineConfig&{mobilityGain?:number}={},options:FixedWetFineOptions={}):Promise<Candidate>{
 const gain=integerOption(config.mobilityGain??3,1,8,'mobilityGain')
 const base=await create(device,size,config,{...options,basePairSourceOverride:mobilitySource(gain)})
 return{get metadata(){return{...base.metadata,basePhysicalModel:'macro13 water-conductance mobility',mobilityGain:gain}},upload:i=>base.upload(i),run:()=>base.run(),readback:()=>base.readback(),destroy:()=>base.destroy()}
}
export const safeFineDefinitions=[
 {id:'wgsl-macro-integer-safe-fine-paper',label:'Мелкая бумага: безопасное целочисленное округление',create,configs:[{steps:128,fineSteps:12,paperGain:3,dither:1},{steps:128,fineSteps:12,paperGain:0,dither:1},{steps:128,fineSteps:0,paperGain:0,dither:1}]},
 {id:'wgsl-macro-mobility-safe-fine-paper',label:'Подвижность воды и консервативная мелкая бумага',create:createMobility,configs:[{steps:256,fineSteps:12,paperGain:3,dither:1,mobilityGain:3},{steps:256,fineSteps:12,paperGain:0,dither:1,mobilityGain:3}]}
]
