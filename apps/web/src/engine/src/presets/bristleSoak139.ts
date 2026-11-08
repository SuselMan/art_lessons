import type {BrushDescriptor,Dab} from '@grafetto/shared'
import type {CanonicalBeginBinding} from '../dabs/CanonicalBeginRuntime'
import type {BristleInitialization140} from './bristleInitialization140'
/** Detached bounded values only: structuredClone/scratch snapshots own their bytes. */
export interface BristleSoakState139 {readonly binding:CanonicalBeginBinding;readonly rgba:Uint8Array}
/** Pinned Qt5.15 qRound: half-up toward positive infinity, including negatives. */
export function bristleSoakRound139(value:number):number {
 if(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER-1)throw RangeError('Bristle source coordinate exceeds exact integer domain')
 return Math.floor(value+.5)
}
export function bristleSoakPoints139(brush:BrushDescriptor,anchor:Dab,initialization?:BristleInitialization140):readonly {x:number;y:number}[]{
 const b=brush.bristle
 if(!b||b.version!==2||!b.soak||b.hairs.length<1||b.hairs.length>4096||!Number.isInteger(b.soak.initialSide)||b.soak.initialSide<1||b.soak.initialSide>256)throw Error('Invalid Bristle Soak source geometry')
 // Raw initialization offsets precede scale, pressure, rotation, shear and RNG.
 const resize=b.soak.resizePolicy==='mask-population-v1'
 if(resize&&(!initialization||initialization.side!==anchor.sourceSize))throw Error('Bristle resized source points were not prepared')
 const side=resize?initialization!.side:b.soak.initialSide,hairs=resize?initialization!.hairs:b.hairs
 return hairs.map(([x,y])=>({x:bristleSoakRound139(anchor.x+Math.round(x*side)),y:bristleSoakRound139(anchor.y+Math.round(y*side))}))
}
export function bristleSoakStraight139(pma:Uint8Array,population:number):Uint8Array {
 if(!Number.isInteger(population)||population<1||population>4096||pma.length<population*4)throw RangeError('Invalid Bristle Soak readback')
 const rgba=new Uint8Array(population*4)
 for(let i=0;i<rgba.length;i+=4){const a=pma[i+3];rgba[i+3]=a;for(let c=0;c<3;c++)rgba[i+c]=a===0?0:Math.min(255,Math.floor(pma[i+c]*255/a+.5))}
 return rgba
}
export function bristleSoakHair139(state:BristleSoakState139,hair:number):readonly[number,number,number,number]{
 const at=hair*4
 if(!Number.isInteger(hair)||hair<0||at+3>=state.rgba.length)throw RangeError('Missing Bristle Soak hair')
 return[state.rgba[at]/255,state.rgba[at+1]/255,state.rgba[at+2]/255,state.rgba[at+3]/255]
}
