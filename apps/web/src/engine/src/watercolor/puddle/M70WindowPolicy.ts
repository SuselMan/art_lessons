/** Analysis/execution planning only: no alternate solver or artistic parameters.
 * Supports are L-infinity distances in the S=1 integer world-pixel grid.
 * Sources: raster/shaders.ts WC_FIELD_OP_FRAG (including carry and tide),
 * WC_DIFFUSE_FRAG; WatercolorFrontPaths.ts prefix8; WatercolorPasses.ts bindings.
 */
export type M70Read<Key> = {source: Key; radius: number}
export class M70DependencyGraph<Key> {
  private readonly extents = new Map<Key,number>()
  private maximum = 0
  private readonly linear: (key:Key)=>boolean
  constructor(linear:(key:Key)=>boolean) {this.linear=linear}
  radius(key: Key): number { return this.extents.get(key) ?? 0 }
  clear(key: Key): void { this.extents.set(key,0) }
  write(target: Key, reads: readonly M70Read<Key>[], preserveOutside = false): number {
    // Resolve all inputs BEFORE replacing target: ping-pong aliases are versions.
    let radius = preserveOutside ? this.radius(target) : 0
    for (const read of reads) {
      if (!Number.isFinite(read.radius) || read.radius < 0) throw new Error('Unbounded M70 sample support')
      radius = Math.max(radius,this.radius(read.source)+read.radius+(this.linear(read.source)?1:0))
    }
    this.extents.set(target,radius);this.maximum=Math.max(this.maximum,radius)
    return radius
  }
  get maxRadius(): number { return this.maximum }
}

type Options<Key> = {c?:Key;d?:Key;e?:Key;dir?:readonly number[];origin?:readonly number[];world?:readonly number[]}
/** Exact branches, conservative per-input supports. LINEAR support is added by
 * the graph, not hidden in these shader offsets. Unknown operators fail closed.
 */
export function m70FieldReads<Key>(mode:number,a:Key,b:Key,opts:Options<Key>={}):M70Read<Key>[] {
 const reads:M70Read<Key>[]=[]
 const add=(source:Key|undefined,radius=0)=>{if(source!==undefined)reads.push({source,radius})}
 const dir=Math.max(...(opts.dir??[0,0]).map(Math.abs))
 switch(mode){
  case 0:case 1:add(a);add(b);if((opts.world?.[2]??0)>0){add(opts.d,3*dir);if((opts.origin?.[0]??0)>0)add(opts.c,2*dir)}break
  case 2:case 4:case 19:add(a);break
  case 3:add(a);add(b);add(opts.c);break
  case 5:add(a,dir);break // 3x3 separable binomial, strides1/2/4/8/16.
  case 6:add(a);add(b,dir);add(opts.c);add(opts.d,10*dir);break // WC_TIDE_RING_TX=10.
  case 7:case 9:add(a);add(opts.d);break
  case 8:case 14:add(a);add(b);add(opts.c);add(opts.d);break
  case 10:add(a);add(b);break
  case 11:case 12:add(a);add(opts.d);break
  case 13:case 17:add(a);add(b);add(opts.d);break
  case 15:case 16:
   // Pigment/color reads one stride away. Incoming donor normalisation reads
   // pressure at donor+its neighbour (2 strides); capillary adds3 pixels.
   add(a,dir);add(b,dir);add(opts.c,dir);add(opts.d,2*dir+3);add(opts.e,2*dir);break
  case 18:add(a);add(b);add(opts.c);add(opts.d);add(opts.e);break
  case 20:add(a);add(b);break
  default:throw new Error(`Unproved M70 field operator ${mode}`)
 }
 return reads
}

export const M70_WINDOW_CANDIDATE = Object.freeze({radius:40,scale:1,halo:640,interior:256,field:1536,alignment:256})
/** Preconditions, not a claim that the current full-page adapter is tiled.
 * Keep the <=1024 monolithic route intact. Global coarse phases must finish
 * separately; all windows read the same immutable source version.
 */
export function m70WindowGeometry(provenRadius:number) {
 const p=M70_WINDOW_CANDIDATE
 if(!Number.isFinite(provenRadius)||provenRadius<0||Math.ceil(provenRadius)>p.halo)throw new Error('M70 dependency cone does not fit the candidate window')
 if(p.interior+2*p.halo>p.field||p.field%p.alignment||p.interior%p.alignment)throw new Error('Invalid M70 window grid')
 return p
}

export type M70WindowRect = {x:number;y:number;width:number;height:number}
/** domain is the explicitly chosen canonical FIELD extent, not the paper size.
 * Its outer edge must match the monolithic reference (skip/clamp); pixels
 * outside physical paper but inside domain are immutable zero source input.
 * Origin may be128 mod256: rounding applies to allocation SIZE only. S=1
 * requires integer world origins; forcing origin256 alignment wastes halo.
 */
export function m70Windows(page:{width:number;height:number},domain:{width:number;height:number},provenRadius:number):Array<{core:M70WindowRect;field:M70WindowRect}> {
 const policy=m70WindowGeometry(provenRadius)
 for(const axis of ['width','height'] as const){
  if(!Number.isSafeInteger(page[axis])||page[axis]<=0||!Number.isSafeInteger(domain[axis])||domain[axis]<page[axis]||domain[axis]%policy.alignment)throw new Error('M70 page/domain grid mismatch')
 }
 const width=Math.min(policy.field,domain.width),height=Math.min(policy.field,domain.height),windows=[]
 for(let y=0;y<page.height;y+=policy.interior)for(let x=0;x<page.width;x+=policy.interior){
  windows.push({core:{x,y,width:Math.min(policy.interior,page.width-x),height:Math.min(policy.interior,page.height-y)},field:{
   x:Math.min(Math.max(0,x-policy.halo),domain.width-width),
   y:Math.min(Math.max(0,y-policy.halo),domain.height-height),width,height,
  }})
 }
 return windows
}
