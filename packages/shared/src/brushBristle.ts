/** A fixed set of mask-derived hairs follows canonical author input knots. */
export interface BrushBristle {
 version:1
 hairs:[number,number,number][]
 scale:number
 shear:number
 random:number
 mousePressure:boolean
 threshold:boolean
 connected:boolean
 antialias:boolean
 compositing:boolean
}
export function isBrushBristle(value:unknown):value is BrushBristle{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>,n=(x:unknown,a:number,b:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b
 return Object.keys(v).every(k=>['version','hairs','scale','shear','random','mousePressure','threshold','connected','antialias','compositing'].includes(k))&&v.version===1&&n(v.scale,0,10)&&n(v.shear,-10,10)&&n(v.random,0,100)&&['mousePressure','threshold','connected','antialias','compositing'].every(k=>typeof v[k]==='boolean')&&Array.isArray(v.hairs)&&v.hairs.length>0&&v.hairs.length<=4096&&v.hairs.every(h=>Array.isArray(h)&&h.length===3&&n(h[0],-.5,.5)&&n(h[1],-.5,.5)&&n(h[2],0,1))&&(v.antialias===true||v.compositing===true)
}
