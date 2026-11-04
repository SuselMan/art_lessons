/** Native64 allocation-domain metadata ONLY for new destructive WASH shells.
 * No pixels, source/read grant or mutable typed array leaves this module. */
export interface CanonicalDestructiveFootprint {readonly kind:'canonical-destructive-64-domain-v1'}
type Rect=Readonly<{minX:number;minY:number;maxX:number;maxY:number}>
type Storage=Readonly<{x:number;y:number;width:number;height:number}>
interface Domain {x:number;y:number;columns:number;rows:number;first:Float64Array;pending:Uint8Array;version:number;storage:Storage;assertCurrent:()=>void}
const issued=new WeakMap<CanonicalDestructiveFootprint,Readonly<{state:Domain;cut:number}>>()
function grid(s:Storage){
 if(![s.x,s.y,s.width,s.height].every(Number.isSafeInteger)||s.width<1||s.height<1||s.width>4096||s.height>4096)throw new RangeError('Invalid destructive storage geometry')
 const x=Math.floor(s.x/64),y=Math.floor(s.y/64),columns=Math.floor((s.x+s.width-1)/64)-x+1,rows=Math.floor((s.y+s.height-1)/64)-y+1
 return{x,y,columns,rows,words:Math.ceil(columns*rows/32)}
}
export function canonicalDestructiveFootprintBytes(storage:Storage):number{return 128+grid(storage).columns*grid(storage).rows*9}
export function createCanonicalDestructiveFootprint(storageInput:Storage,assertCurrent:()=>void):Readonly<{snapshot:()=>CanonicalDestructiveFootprint;mark:(rect:Rect)=>void;stage:(rect:Rect)=>void;publishPending:()=>void}>{
 const storage=Object.freeze({...storageInput})
 const g=grid(storage),state:Domain={...g,first:new Float64Array(g.columns*g.rows),pending:new Uint8Array(g.columns*g.rows),version:0,storage:Object.freeze({...storage}),assertCurrent}
 const publish=(i:number)=>{if(state.first[i]!==0)return;const next=state.version+1;if(!Number.isSafeInteger(next)||next>state.first.length)throw new RangeError('Destructive domain cut overflow');state.first[i]=next;state.version=next}
 const apply=(rect:Rect,pending:boolean)=>{
  assertCurrent();if(![rect.minX,rect.minY,rect.maxX,rect.maxY].every(Number.isSafeInteger)||rect.maxX<rect.minX||rect.maxY<rect.minY)throw new RangeError('Invalid destructive DAB bounds')
  const left=Math.max(storage.x,rect.minX),top=Math.max(storage.y,rect.minY),right=Math.min(storage.x+storage.width,rect.maxX),bottom=Math.min(storage.y+storage.height,rect.maxY)
  if(right<=left||bottom<=top)return
  for(let y=Math.floor(top/64);y<=Math.floor((bottom-1)/64);y++)for(let x=Math.floor(left/64);x<=Math.floor((right-1)/64);x++){
   const i=(y-g.y)*g.columns+x-g.x;if(pending)state.pending[i]=1;else publish(i)
  }
 }
 return Object.freeze({snapshot(){assertCurrent();const view=Object.freeze({kind:'canonical-destructive-64-domain-v1'as const});issued.set(view,Object.freeze({state,cut:state.version}));return view},mark(rect:Rect){apply(rect,false)},stage(rect:Rect){apply(rect,true)},publishPending(){
  assertCurrent();for(let i=0;i<state.pending.length;i++)if(state.pending[i]){publish(i);state.pending[i]=0}
 }})
}

function data(view:CanonicalDestructiveFootprint):Readonly<{state:Domain;cut:number}>{const receipt=issued.get(view);if(!receipt)throw new TypeError('Unissued destructive footprint');receipt.state.assertCurrent();return receipt}
export function canonicalDestructiveCellCount(view:CanonicalDestructiveFootprint):number{const{state:s}=data(view);return s.columns*s.rows}
export function canonicalDestructiveCell(view:CanonicalDestructiveFootprint,index:number):Rect|undefined{
 const{state:s,cut}=data(view);if(!Number.isInteger(index)||index<0||index>=s.columns*s.rows)throw new RangeError('Invalid destructive domain cursor')
 if(s.first[index]===0||s.first[index]>cut)return undefined
 const x=(s.x+index%s.columns)*64,y=(s.y+Math.floor(index/s.columns))*64
 return Object.freeze({minX:Math.max(x,s.storage.x),minY:Math.max(y,s.storage.y),maxX:Math.min(x+64,s.storage.x+s.storage.width),maxY:Math.min(y+64,s.storage.y+s.storage.height)})
}
export function canonicalDestructiveExpandedBounds(rect:Rect):Rect{
 if(![rect.minX,rect.minY,rect.maxX,rect.maxY].every(Number.isSafeInteger)||rect.maxX<=rect.minX||rect.maxY<=rect.minY)throw new RangeError('Invalid native64 DAB rectangle')
 return Object.freeze({minX:Math.floor(rect.minX/64)*64,minY:Math.floor(rect.minY/64)*64,maxX:(Math.floor((rect.maxX-1)/64)+1)*64,maxY:(Math.floor((rect.maxY-1)/64)+1)*64})
}

export function canonicalDestructivePart(view:CanonicalDestructiveFootprint,index:number,width:number,height:number,clip:Rect):Readonly<{count:number;rect?:Rect}>{
 if(!Number.isSafeInteger(index)||index<0||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new RangeError('Invalid destructive part cursor')
 const columns=Math.ceil(64/width),rows=Math.ceil(64/height),per=columns*rows,count=canonicalDestructiveCellCount(view)*per
 if(index>=count)throw new RangeError('Destructive part cursor exceeds footprint')
 const cell=canonicalDestructiveCell(view,Math.floor(index/per));if(!cell)return{count}
 const local=index%per,x=cell.minX+(local%columns)*width,y=cell.minY+Math.floor(local/columns)*height
 const minX=Math.max(x,clip.minX),minY=Math.max(y,clip.minY),maxX=Math.min(x+width,cell.maxX,clip.maxX),maxY=Math.min(y+height,cell.maxY,clip.maxY)
 return maxX>minX&&maxY>minY?{count,rect:Object.freeze({minX,minY,maxX,maxY})}:{count}
}
export function isCanonicalDestructiveBlend(mode:string):boolean{return mode==='copy'||mode==='destinationIn'||mode==='destinationAtop'}
