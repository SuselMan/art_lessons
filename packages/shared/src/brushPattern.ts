/** Author canvas resource, never a preset texture or receiver selection. */
export type BrushPattern = Readonly<{version:1;kind:'none'}>|Readonly<{version:1;kind:'rgba';alpha:`asset:${string}`;planes:readonly[`asset:${string}`,`asset:${string}`,`asset:${string}`];side:number;sourceRect:Readonly<{x:number;y:number;width:number;height:number}>;sampling:'world-repeat-nearest-v1'}>
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const asset=(v:unknown):v is `asset:${string}`=>typeof v==='string'&&/^asset:[a-f0-9]{64}$/.test(v)
export function isBrushPattern(value:unknown):value is BrushPattern{
 if(!record(value)||value.version!==1)return false
 if(value.kind==='none')return Object.keys(value).length===2
 if(value.kind!=='rgba'||Object.keys(value).length!==7||!asset(value.alpha)||!Array.isArray(value.planes)||value.planes.length!==3||!value.planes.every(asset)||value.sampling!=='world-repeat-nearest-v1')return false
 const n=value.side,r=value.sourceRect
 return typeof n==='number'&&Number.isInteger(n)&&n>=2&&n<=512&&(n&(n-1))===0&&record(r)&&Object.keys(r).length===4&&['x','y','width','height'].every(k=>typeof r[k]==='number'&&Number.isInteger(r[k]))&&Number(r.width)>=1&&Number(r.height)>=1&&Math.max(Number(r.width),Number(r.height))<=n&&n===Math.max(2,2**Math.ceil(Math.log2(Math.max(Number(r.width),Number(r.height)))))&&r.x===Math.floor((n-Number(r.width))/2)&&r.y===Math.floor((n-Number(r.height))/2)
}
export function copyBrushPattern(value:BrushPattern):BrushPattern{
 if(!isBrushPattern(value))throw Error('Invalid captured canvas pattern')
 return value.kind==='none'?Object.freeze({version:1,kind:'none'}):Object.freeze({...value,planes:Object.freeze([...value.planes]) as typeof value.planes,sourceRect:Object.freeze({...value.sourceRect})})
}
export function brushPatternAssetIds(value:BrushPattern|undefined):`asset:${string}`[]{
 if(value===undefined)return []
 if(!isBrushPattern(value))throw Error('Invalid captured canvas pattern')
 return value.kind==='none'?[]:[...new Set([value.alpha,...value.planes])]
}
