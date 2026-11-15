import{usesNativeSketchSpray}from'./nativeBrushFeatures'
import{hasSprayWash133Scope}from'./stationary195Scopes'
import{type BrushDescriptor}from'@grafetto/shared'
import type{BehaviorStamp,BrushBehaviorState}from'./brushBehavior'
import{sprayParticleColorControls}from'./sprayParticleColor'
export type SprayRequestState=BrushBehaviorState&{sprayPainterOpacity?:number}
export interface SprayRequestGeometry{readonly x:number;readonly y:number;readonly radius:number}
export interface PreparedSprayRequest{readonly stamps:readonly BehaviorStamp[];readonly geometry:SprayRequestGeometry}
/** Private request transaction, only for newly admitted source-colour options.
 * The caller's native expansion supplies the ACTUAL post-dynamics request
 * geometry even with zero particles; never invent an invisible placeholder.
 * Resource acquisition happens after this returns, before commit/target paint.
 */
export function stageSpraySourceRequest<T extends PreparedSprayRequest>(brush:BrushDescriptor,state:SprayRequestState,expand:(working:SprayRequestState)=>T){
 const spray=brush.spray
 if(!spray||!(spray.color.sampleInput||spray.color.mixBackground||spray.color.fillBackground||hasSprayWash133Scope(brush)||usesNativeSketchSpray(brush))||brush.behavior?.dual||brush.sketch||brush.bristle||brush.curveTrace||brush.particle||brush.experiment||brush.deform||brush.grid||brush.hatching||brush.clone||brush.filter||brush.mypaint||brush.tangentNormal||state.sketch||state.bristle||state.curveTrace||state.particle||state.experiment||state.deform||(state.pending?.length??0)>4096)throw Error('Spray request staging requires an isolated source-colour request')
 const entries=Object.entries(state),keys=Object.keys(state),execution=state.execution
 const{execution:_execution,...plain}=state
 const working:SprayRequestState={...structuredClone(plain),...(execution===undefined?{}:{execution})}
 const prepared=expand(working),g=prepared.geometry
 if(prepared.stamps.length>4096||![g.x,g.y,g.radius].every(Number.isFinite)||g.radius<0)throw new RangeError('Invalid prepared Spray request')
 const painterOpacity=state.sprayPainterOpacity??1
 if(!Number.isFinite(painterOpacity)||painterOpacity<0||painterOpacity>1)throw new RangeError('Invalid Spray painter opacity carry')
 if(prepared.stamps.length&&spray.color.randomOpacity)working.sprayPainterOpacity=sprayParticleColorControls(spray.color,state.seed,state.dabSequence??0,prepared.stamps.length-1).randomAlpha
 const background=spray.color.fillBackground?{...g,opacity:painterOpacity}:undefined
 let closed=false
 return{prepared,working,background,
  commit(){
   if(closed)throw Error('Spray request transaction is closed')
   if(Object.keys(state).length!==keys.length||entries.some(([key,value])=>Reflect.get(state,key)!==value))throw Error('Spray request state changed before commit')
   closed=true
   for(const key of keys)if(!Object.prototype.hasOwnProperty.call(working,key))Reflect.deleteProperty(state,key)
   Object.assign(state,working)
  },
  cancel(){closed=true},
 }
}
