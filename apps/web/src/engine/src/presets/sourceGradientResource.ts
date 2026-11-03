import {mixWeightedRgba8,type Rgba8} from './mixWeightedRgba8'

/** Captured START resource. Functional straight sRGB8 interpolation; custom
 * ICC/native gradient conversion identity is deliberately outside this profile. */
export interface SourceGradientResource {
 readonly kind:'srgb8-linear-stops-v1'
 readonly stops:readonly Readonly<{position:number;rgba:Rgba8}>[]
}
function own(value:unknown,key:string):unknown {
 const d=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key):undefined
 if(!d||!Object.hasOwn(d,'value'))throw new TypeError('Source gradient requires own DATA')
 return d.value
}
function object(value:unknown,fields:number):void {
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==fields)throw new TypeError('Invalid source gradient DATA')
}
function length(value:unknown,max:number):number {
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw new TypeError('Invalid source gradient array')
 const count=own(value,'length')
 if(typeof count!=='number'||!Number.isSafeInteger(count)||count<1||count>max||Reflect.ownKeys(value).length!==count+1)throw new RangeError('Source gradient bound')
 for(let i=0;i<count;i++)own(value,String(i))
 return count
}
/** Validates checkpoints without cloning or calling resource getters. */
export function assertSourceGradientResource(value:unknown):asserts value is SourceGradientResource {
 object(value,2);if(own(value,'kind')!=='srgb8-linear-stops-v1')throw new RangeError('Unsupported source gradient profile')
 const stops=own(value,'stops'),count=length(stops,256);if(count<2)throw new RangeError('Source gradient needs two stops')
 let previous=-1
 for(let i=0;i<count;i++){
  const stop=own(stops,String(i));object(stop,2)
  const position=own(stop,'position'),rgba=own(stop,'rgba')
  if(typeof position!=='number'||!Number.isFinite(position)||Object.is(position,-0)||position<0||position>1||position<previous||length(rgba,4)!==4)throw new RangeError('Invalid source gradient stop')
  previous=position
  for(let k=0;k<4;k++){const c=own(rgba,String(k));if(typeof c!=='number'||!Number.isInteger(c)||c<0||c>255||Object.is(c,-0))throw new RangeError('Invalid source gradient channel')}
 }
}
export function captureSourceGradientResource(value:unknown):Readonly<SourceGradientResource>{
 assertSourceGradientResource(value)
 return Object.freeze({kind:'srgb8-linear-stops-v1',stops:Object.freeze(value.stops.map(s=>Object.freeze({position:s.position,rgba:Object.freeze([s.rgba[0],s.rgba[1],s.rgba[2],s.rgba[3]] as const)})))})
}
/** The caller holds the captured immutable table for this stroke. */
export function sourceGradientColor(resource:SourceGradientResource,position:number):Rgba8 {
 if(!Number.isFinite(position)||position<0||position>1)throw new RangeError('Source gradient position')
 const stops=resource.stops
 if(position<stops[0].position)return stops[0].rgba
 if(position>=stops[stops.length-1].position)return stops[stops.length-1].rgba
 let right=1
 while(right<stops.length-1&&position>=stops[right].position)right++
 const a=stops[right-1],b=stops[right]
 if(position===a.position)return a.rgba
 if(position===b.position)return b.rgba
 const fraction=(position-a.position)/(b.position-a.position),weight=Math.min(32767,Math.max(0,Math.floor(fraction*32767+.5)))
 return mixWeightedRgba8([a.rgba,b.rgba],[32767-weight,weight],32767)
}
