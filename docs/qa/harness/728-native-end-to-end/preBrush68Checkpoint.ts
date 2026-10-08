import type {PencilEngine} from '../../../../apps/web/src/engine/index'
import {validateCommonSourcePayload,commonSourceShape} from './commonSourceContract'
import type {CommonSourcePayload} from './commonSourceBoundary'
export const BRUSH68_ROI={x:269,y:261,width:127,height:108} as const
export const BRUSH68_SCISSOR=[271,1169,123,104] as const
export const BRUSH68_FLOW_RECT=[272/1536,1170/1536,121/1536,102/1536] as const
const top=(raw:Uint8Array,w:number,h:number)=>{const out=new Uint8Array(raw.length);for(let y=0;y<h;y++)out.set(raw.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4);return out}
/** Diagnostic prefix only: exact durable GL source, original ops0..68, no full solver.
 * Inputs captured BEFORE original op68; both real oldP/oldC passes run before copyback.
 * Readbacks are tight ROI with two-pixel halo, not whole1536 fields. */
export function installPreBrush68Checkpoint(engine:PencilEngine,payload:CommonSourcePayload){
 const e=engine as any,planner=e._settlePlan,prepare=planner.prepare;let calls=0,prepared=false
 const rows:Array<{phase:'before'|'after';role:string;filter:string;width:1536;height:1536;bytes:Uint8Array}>=[],flows:Array<{width:number;height:number;bytes:Uint8Array}>=[],brushCalls:unknown[]=[]
 const uploads=planner.ctx.uploads,uploadFlow=uploads.uploadFlow
 uploads.uploadFlow=(texture:any,w:number,h:number,bytes:Uint8Array,reuse:boolean)=>{if(w*h*4>65536)throw Error('Bounded flow capture');flows.push({width:w,height:h,bytes:bytes.slice()});return uploadFlow(texture,w,h,bytes,reuse)}
 const capture=(phase:'before'|'after')=>{const f=e._fieldCache[0];if(f.w!==1536||f.h!==1536)throw Error('Actual1536 field required');for(const role of ['a','cc','coverage']){const b=f[role];if(b.width!==1536||b.height!==1536||b._baseFilter!=='nearest')throw Error('Brush source dimensions/filter mismatch');const r=BRUSH68_ROI;rows.push({phase,role,filter:b._baseFilter,width:1536,height:1536,bytes:top(b.readPixelsRegion(r.x,1536-r.y-r.height,r.width,r.height),r.width,r.height)})}}
 planner.prepare=function(...args:any[]){if(++calls!==1)throw Error('ONE original job only');const target=args[1][0];if(args[1].length!==1||target.originX!==0||target.originY!==0)throw Error('Single origin0 target required');const entry=args[0].peek(target.buffer);validateCommonSourcePayload(payload,commonSourceShape(entry,target.buffer))
  const m=args[12]??args[0],metadata=JSON.stringify({gesture:m.gesture,paints:Array.from(m.paints),brushTravel:m.brushTravel,wetContacts:m.wetContacts,foreignSources:m.foreignSources,dryCtx:m.dryCtx?{bounds:m.dryCtx.bounds,radiusPx:m.dryCtx.radiusPx,standing:m.dryCtx.standing}:null})
  if(payload.scalarsJson!==JSON.stringify(args.slice(2,10))||payload.metadataJson!==metadata||payload.materialGesture!==args[0].materialGesture||payload.pigmentInputsKnownZero!==args[0].pigmentInputsKnownZero)throw Error('Strict actual source CPU metadata mismatch')
  const written=new Set<number>();for(const field of payload.fields)if(field.presence==='field'&&!written.has(field.alias!)){const b=field.role==='target'?target.buffer:entry[field.role];b.writePixels(top(field.bytes!,1024,1024));written.add(field.alias!)}
  const job=prepare.apply(this,args);if(!job||job.ops.length<=68)throw Error('Actual job missing op68');const original=job.ops[68]
  job.ops=job.ops.slice(0,69);job.ops[68]=()=>{capture('before');const passes=planner.ctx.passes(),brush=passes.brushPass;passes.brushPass=(...a:any[])=>{const f=e._fieldCache[0];if(a[6]!==f.a||a[9]!==f.cc||a[4]!==[f.cc,f.a][brushCalls.length]||a[5]!==[f.band,f.pressure][brushCalls.length])throw Error('Original brush old P/C pair or output order mismatch');if(a[2]!==4||a[3]!==1||a[10]!==.6437950134277344||JSON.stringify(a[8])!==JSON.stringify(BRUSH68_SCISSOR)||JSON.stringify(a[7])!==JSON.stringify(BRUSH68_FLOW_RECT))throw Error('Actual firstbrush recipe mismatch');brushCalls.push({radius:a[2],scale:a[3],gain:a[10],scissor:a[8],flowRect:a[7],source:a[4]===e._fieldCache[0].cc?'cc':'a'});return brush.apply(passes,a)};try{original();capture('after');prepared=true}finally{passes.brushPass=brush}}
  return job
 }
 return{read(){if(!prepared||calls!==1||brushCalls.length!==2||flows.length!==2||flows[0].width!==31||flows[0].height!==26)throw Error('Actual prefix/flow/paired source guard '+JSON.stringify({prepared,calls,brushCalls:brushCalls.length,flows:flows.map(f=>[f.width,f.height]),rows:rows.length}));if(flows[0].bytes.length!==flows[1].bytes.length||flows[0].bytes.some((v,i)=>v!==flows[1].bytes[i]))throw Error('Original initial/contact flow uploads differ');return{roi:BRUSH68_ROI,rows,flow:flows[1],brushCalls,scope:'Actual original ops0..68 only; tight common oldP/oldC/water ROI and GLreference, no whole-final claim'}},detach(){planner.prepare=prepare;uploads.uploadFlow=uploadFlow}}
}
