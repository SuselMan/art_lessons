/** CPU-only QA isolation. Plane row orientation is preserved; no carrier conversion. */
export const nativePlaneKeys = ['p','c','coverage','solvent','foreign','original','paper'] as const
export type NativePlaneKey = typeof nativePlaneKeys[number]
export type NativeComponentPlanes = Record<NativePlaneKey, Uint8Array>
const materialKeys = ['p','c','coverage','solvent','foreign'] as const
async function sha(a: Uint8Array): Promise<string> {
 const copy = new Uint8Array(a)
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', copy)), x=>x.toString(16).padStart(2,'0')).join('')
}
async function hashes(planes: NativeComponentPlanes): Promise<Record<NativePlaneKey,string>> {
 const entries = await Promise.all(nativePlaneKeys.map(async k=>[k,await sha(planes[k])] as const))
 return Object.fromEntries(entries) as Record<NativePlaneKey,string>
}
export function partitionNativeComponents(actual: NativeComponentPlanes, width:number, height:number) {
 const n=width*height
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(n)||n>1024*1024) throw Error('Invalid bounded component dimensions')
 for(const k of nativePlaneKeys) if(!(actual[k] instanceof Uint8Array)||actual[k].length!==n*4) throw Error('Invalid native plane '+k)
 // Own snapshot prevents asynchronous hashing from observing a later source upload.
 const source=Object.fromEntries(nativePlaneKeys.map(k=>[k,new Uint8Array(actual[k])])) as NativeComponentPlanes
 const labels=new Int32Array(n).fill(-1), order=new Uint32Array(n)
 const components: {id:number;pixelCount:number;pigmented:boolean;start:number;end:number}[]=[]
 let used=0
 const wet=(i:number)=>source.solvent[4*i+3]+source.foreign[4*i+3]>0
 for(let start=0;start<n;start++) {
  if(!wet(start)||labels[start]>=0)continue
  const id=components.length,begin=used;let head=0,tail=1,pigmented=false
  order[begin]=start;labels[start]=id
  while(head<tail) {
   const i=order[begin+head],x=i%width,y=Math.floor(i/width),j=4*i;head++
   if(source.c[j]!==0||source.c[j+1]!==0||source.c[j+2]!==0||source.c[j+3]!==0)pigmented=true
   for(let direction=0;direction<4;direction++) {
    let v=-1
    if(direction===0&&x>0)v=i-1
    if(direction===1&&x+1<width)v=i+1
    if(direction===2&&y>0)v=i-width
    if(direction===3&&y+1<height)v=i+width
    if(v<0||labels[v]>=0)continue
    if(source.solvent[4*v+3]+source.foreign[4*v+3]===0)continue
    if(begin+tail>=n)throw Error('Native component queue overflow')
    labels[v]=id;order[begin+tail]=v;tail++
   }
  }
  used=begin+tail
  components.push(Object.freeze({id,pixelCount:tail,pigmented,start:begin,end:used}))
 }
 // Independent linear validation before any native solve: reject malformed partition,
 // never feed a partially trusted mask to the GPU. No device/JIT cause is presumed.
 const counts=new Uint32Array(components.length),coloured=new Uint8Array(components.length),orderSeen=new Uint8Array(n)
 let expectedWet=0,rangeEnd=0
 for(let i=0;i<n;i++){
  const id=labels[i],isWet=source.solvent[4*i+3]+source.foreign[4*i+3]>0
  if(!isWet){if(id!==-1)throw Error('Dry native pixel labelled');continue}
  expectedWet++
  if(id<0||id>=components.length)throw Error('Wet native pixel missing component')
  counts[id]++
  if(source.c[4*i]!==0||source.c[4*i+1]!==0||source.c[4*i+2]!==0||source.c[4*i+3]!==0)coloured[id]=1
 }
 for(let id=0;id<components.length;id++){
  const c=components[id]
  if(c.id!==id||c.start!==rangeEnd||c.end-c.start!==c.pixelCount||c.pixelCount!==counts[id]||c.pigmented!==(coloured[id]===1))throw Error('Native component range/count invariant failed')
  for(let q=c.start;q<c.end;q++){const i=order[q];if(i>=n||labels[i]!==id||orderSeen[i]!==0)throw Error('Native component membership invariant failed');orderSeen[i]=1}
  rangeEnd=c.end
 }
 if(rangeEnd!==used||used!==expectedWet||used>n)throw Error('Native component total invariant failed')

 function materialize(id:number) {
  const c=components[id];if(!c||c.id!==id)throw Error('Unknown native component')
  const mask=new Uint8Array(n),planes=Object.fromEntries(nativePlaneKeys.map(k=>[k,materialKeys.includes(k as typeof materialKeys[number])?new Uint8Array(n*4):new Uint8Array(source[k])])) as NativeComponentPlanes
  for(let q=c.start;q<c.end;q++){const i=order[q],j=i*4;mask[i]=1;for(const k of materialKeys)planes[k].set(source[k].subarray(j,j+4),j)}
  return {id,mask,planes}
 }
 function dryLiteral() {
  const planes=Object.fromEntries(materialKeys.map(k=>[k,new Uint8Array(n*4)])) as Record<typeof materialKeys[number],Uint8Array>
  for(let i=0;i<n;i++)if(labels[i]<0)for(const k of materialKeys)planes[k].set(source[k].subarray(i*4,i*4+4),i*4)
  return planes
 }
 return {
  width,height,partitionAudit:Object.freeze({expectedWetPixels:expectedWet,labelledPixels:used,contiguousRanges:true,membershipChecked:true}),components:Object.freeze(components),materialize,dryLiteral,
  async describe(id:number, expectedOriginalSHA?:Partial<Record<NativePlaneKey,string>>) {
   const originalSHA=await hashes(source)
   if(expectedOriginalSHA)for(const k of nativePlaneKeys)if(!expectedOriginalSHA[k]||expectedOriginalSHA[k]!==originalSHA[k])throw Error('Original native SHA mismatch '+k)
   const selected=materialize(id)
   return {width,height,id,pixelCount:components[id].pixelCount,pigmented:components[id].pigmented,originalSHA,maskSHA:await sha(selected.mask),maskedPlaneSHA:await hashes(selected.planes),sourceContract:'actual native material fork; original backdrop retained globally; outside component material zero; dry literal merged separately',policy:'original-solventA-plus-foreignA-positive-four-connected',backdrop:'original and paper preserved globally, not masked',zeroColourSkip:!components[id].pigmented}
  }
 }
}
