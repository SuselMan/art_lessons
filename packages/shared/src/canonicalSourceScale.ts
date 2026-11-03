/** Captured UI control data; original descriptor/SHA and resource limits remain fixed. */
export interface CanonicalSourceScaleOptions {readonly sourceScale?:number}
export function canonicalSourceScale(value:unknown):number {
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>1e6||Object.is(value,-0))throw new TypeError('Invalid source scale')
 return value
}
export function captureCanonicalSourceScaleOptions(value:unknown):Readonly<CanonicalSourceScaleOptions>{
 if(value===undefined)return Object.freeze({})
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new TypeError('Invalid source scale options')
 const keys=Reflect.ownKeys(value),field=Object.getOwnPropertyDescriptor(value,'sourceScale')
 if(keys.length===0)return Object.freeze({})
 if(keys.length!==1||keys[0]!=='sourceScale'||!field||!Object.hasOwn(field,'value'))throw new TypeError('Invalid source scale options')
 return Object.freeze({sourceScale:canonicalSourceScale(field.value)})
}
