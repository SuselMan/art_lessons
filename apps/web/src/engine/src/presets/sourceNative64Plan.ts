import { sourceVector32Partition } from './sourceVector32'

/** Source-fixed RGBA8 input only: no selection/wrap/channel locks, no outer
 * device-to-device wash merge. Memory contracts are explicit source inputs;
 * no browser texture coordinate, GL tile or pointer probing is an authority. */
export interface SourceNative64Rect { readonly x:number; readonly y:number; readonly width:number; readonly height:number }
export type SourceNative64Memory =
  | {readonly kind:'android-lp64-new-array-v1'}
  | {readonly kind:'diagnostic-residue';readonly residue:0|4|8|12}
export interface SourceNative64Input {
  readonly profile:'native64-fixed-rgba8-v1'|'diagnostic-native64-fixed-rgba8-v1'
  readonly channelMode:'all-unlocked';readonly selection:'none';readonly wrap:'none'
  readonly source:{readonly rect:SourceNative64Rect;readonly rowStride:number;readonly byteLength:number;readonly memory:SourceNative64Memory}
  readonly destination:{readonly offsetX:number;readonly offsetY:number;readonly memory:{readonly kind:'krita-native64-pool16-v1'}|{readonly kind:'diagnostic-residue';readonly residue:0|4|8|12}}
  /** Ordered actual applyRects; the native painter intersects each with dab.
   * Overlapping painted intersections are invalid for this worker profile. */
  readonly workerRects:readonly SourceNative64Rect[]
  readonly budget?:{readonly pixels?:number;readonly calls?:number;readonly rows?:number}
}
export interface SourceNative64Row {
  readonly row:number;readonly y:number;readonly sourceByteOffset:number;readonly destinationByteOffset:number
  readonly sourceResidue:number|null;readonly destinationResidue:number
  readonly prefix:number;readonly vectors:number;readonly tail:number;readonly sourceAligned:boolean|null
}
export interface SourceNative64Call {
  readonly ordinal:number;readonly workerOrdinal:number;readonly x:number;readonly y:number;readonly cols:number;readonly rows:number
  readonly tileX:number;readonly tileY:number;readonly tileOriginX:number;readonly tileOriginY:number
  readonly sourceByteOffset:number;readonly sourceRowStride:number;readonly destinationByteOffset:number;readonly destinationRowStride:256
  readonly partitions:readonly SourceNative64Row[]
}
export const SOURCE_NATIVE64_LIMITS=Object.freeze({workers:256,sourceBytes:67108864,pixels:4194304,calls:4096,rows:65536})
const fail=():never=>{throw new RangeError('Invalid or over-budget native64 fixed-dab source context')}
const integer=(n:unknown,min:number,max:number):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max
function rect(r:SourceNative64Rect,source=false):void {
 if(!r||!integer(r.x,-100000000,100000000)||!integer(r.y,-100000000,100000000)
   ||!integer(r.width,source?1:0,source?4096:200000000)||!integer(r.height,source?1:0,source?4096:200000000)
   ||!Number.isSafeInteger(r.x+r.width)||!Number.isSafeInteger(r.y+r.height))fail()
}
function residue(memory:SourceNative64Input['source']['memory']|SourceNative64Input['destination']['memory'],diagnostic:boolean,nativeKind:string):number {
 if(!memory)fail()
 if(memory.kind===nativeKind)return 0
 if(memory.kind==='diagnostic-residue'&&diagnostic&&[0,4,8,12].includes(memory.residue))return memory.residue
 return fail()
}
function intersect(a:SourceNative64Rect,b:SourceNative64Rect):SourceNative64Rect {
 const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y)
 return {x,y,width:Math.max(0,Math.min(a.x+a.width,b.x+b.width)-x),height:Math.max(0,Math.min(a.y+a.height,b.y+b.height)-y)}
}
/** Metadata preflight completes BEFORE native tile/call/row enumeration. The
 * row dispatch is the existing installed generic-SIMD law, not a new loop.
 * Return values describe an explicit source context, never observed GUI calls. */
export function planSourceNative64FixedDab(input:SourceNative64Input):{
 readonly scope:'source-zero-origin'|'source-explicit-offset'|'diagnostic-memory-or-stride'
 readonly sourceVectorAlignmentRelevant:boolean;readonly sourceAlignmentKnown:boolean;readonly sourceMinimumAllocationBytes:number;readonly sourceFreshPooledBytes:number
 readonly costs:{readonly pixels:number;readonly calls:number;readonly rows:number}
 readonly workers:readonly {readonly ordinal:number;readonly firstCall:number;readonly callCount:number}[]
 readonly calls:readonly SourceNative64Call[]
} {
 if(!input||!['native64-fixed-rgba8-v1','diagnostic-native64-fixed-rgba8-v1'].includes(input.profile)
  ||input.channelMode!=='all-unlocked'||input.selection!=='none'||input.wrap!=='none'||!input.source||!input.destination
  ||!Array.isArray(input.workerRects)||input.workerRects.length>SOURCE_NATIVE64_LIMITS.workers)fail()
 const diagnostic=input.profile==='diagnostic-native64-fixed-rgba8-v1',s=input.source,d=input.destination
 rect(s.rect,true)
 if(!integer(s.rowStride,s.rect.width*4,SOURCE_NATIVE64_LIMITS.sourceBytes)||s.rowStride%4!==0
   ||!diagnostic&&s.rowStride!==s.rect.width*4||!integer(s.byteLength,1,SOURCE_NATIVE64_LIMITS.sourceBytes)
   ||!integer(d.offsetX,-100000000,100000000)||!integer(d.offsetY,-100000000,100000000))fail()
 const needed=(s.rect.height-1)*s.rowStride+s.rect.width*4
 if(!Number.isSafeInteger(needed)||needed>s.byteLength)fail()
 const sourceResidue=residue(s.memory,diagnostic,'android-lp64-new-array-v1'),destinationResidue=residue(d.memory,diagnostic,'krita-native64-pool16-v1')
 const minAllocation=Math.trunc(1.2*needed),alignmentRelevant=s.rect.width>=4,alignmentKnown=s.memory.kind==='diagnostic-residue'||needed>8
 // Source SIMD requires >=4 columns, hence required bytes>=16 and fresh pooled
 // new[] capacity>=19 (>8). Reused chunks are at least the requested size.
 if(alignmentRelevant&&(needed<=8||minAllocation<=8))fail()
 const budgets={pixels:input.budget?.pixels??SOURCE_NATIVE64_LIMITS.pixels,calls:input.budget?.calls??SOURCE_NATIVE64_LIMITS.calls,rows:input.budget?.rows??SOURCE_NATIVE64_LIMITS.rows}
 for(const k of ['pixels','calls','rows']as const)if(!integer(budgets[k],0,SOURCE_NATIVE64_LIMITS[k]))fail()
 const clipped:SourceNative64Rect[]=[],costs={pixels:0,calls:0,rows:0}
 for(const worker of input.workerRects){
  rect(worker);const c=intersect(worker,s.rect);clipped.push(c)
  if(!c.width||!c.height)continue
  const sourceOffset=(c.y-s.rect.y)*s.rowStride+(c.x-s.rect.x)*4,end=sourceOffset+(c.height-1)*s.rowStride+c.width*4
  if(!Number.isSafeInteger(end)||sourceOffset<0||end>s.byteLength)fail()
  const nx=Math.floor((c.x+c.width-1-d.offsetX)/64)-Math.floor((c.x-d.offsetX)/64)+1
  const ny=Math.floor((c.y+c.height-1-d.offsetY)/64)-Math.floor((c.y-d.offsetY)/64)+1
  costs.pixels+=c.width*c.height;costs.calls+=nx*ny;costs.rows+=nx*c.height
  for(const k of ['pixels','calls','rows']as const)if(!Number.isSafeInteger(costs[k])||costs[k]>budgets[k])fail()
 }
 for(let i=0;i<clipped.length;i++)for(let j=0;j<i;j++){
  const a=clipped[i],b=clipped[j];if(a.width&&a.height&&b.width&&b.height){const overlap=intersect(a,b);if(overlap.width&&overlap.height)fail()}
 }
 const calls:SourceNative64Call[]=[],workers:{ordinal:number;firstCall:number;callCount:number}[]=[]
 for(const [workerOrdinal,c]of clipped.entries()){
  const firstCall=calls.length
  if(c.width&&c.height)for(let y=c.y;y<c.y+c.height;){
   const tileY=Math.floor((y-d.offsetY)/64),tileOriginY=tileY*64+d.offsetY,rows=Math.min(c.y+c.height-y,tileOriginY+64-y)
   for(let x=c.x;x<c.x+c.width;){
    const tileX=Math.floor((x-d.offsetX)/64),tileOriginX=tileX*64+d.offsetX,cols=Math.min(c.x+c.width-x,tileOriginX+64-x)
    const sourceByteOffset=(y-s.rect.y)*s.rowStride+(x-s.rect.x)*4,destinationByteOffset=((y-tileOriginY)*64+x-tileOriginX)*4,partitions:SourceNative64Row[]=[]
    for(let row=0;row<rows;row++){
     const src=sourceByteOffset+row*s.rowStride,dst=destinationByteOffset+row*256,sr=(sourceResidue+src)%16,dr=(destinationResidue+dst)%16
     const dispatch=sourceVector32Partition(cols,dr,sr,false)
     if(!alignmentKnown&&dispatch.vectors!==0)fail()
     partitions.push({row,y:y+row,sourceByteOffset:src,destinationByteOffset:dst,destinationResidue:dr,...dispatch,sourceResidue:alignmentKnown?sr:null,sourceAligned:alignmentKnown?dispatch.sourceAligned:null})
    }
    calls.push({ordinal:calls.length,workerOrdinal,x,y,cols,rows,tileX,tileY,tileOriginX,tileOriginY,sourceByteOffset,sourceRowStride:s.rowStride,destinationByteOffset,destinationRowStride:256,partitions});x+=cols
   }
   y+=rows
  }
  workers.push({ordinal:workerOrdinal,firstCall,callCount:calls.length-firstCall})
 }
 return {scope:diagnostic?'diagnostic-memory-or-stride':d.offsetX===0&&d.offsetY===0?'source-zero-origin':'source-explicit-offset',sourceVectorAlignmentRelevant:alignmentRelevant,sourceAlignmentKnown:alignmentKnown,sourceMinimumAllocationBytes:needed,sourceFreshPooledBytes:minAllocation,costs,workers,calls}
}
