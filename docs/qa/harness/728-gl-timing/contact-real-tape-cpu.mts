// Match canonical entry's existing initialization order for preset cycles.
import '../../../../apps/web/src/engine/src/presets/watercolorPresets'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { strokeDabs } from '../../../../packages/shared/src/dabCodec'
import { presetForTool } from '../../../../apps/web/src/engine/src/presets/resolvePreset'
import { ribbonProfileFor } from '../../../../apps/web/src/engine/src/dabs/ribbonProfile'
import { prepareDrawableRibbonDabs, ribbonSegmentLength } from '../../../../apps/web/src/engine/src/dabs/ribbonDrawable'
import { prepareRibbonDelivery, createRibbonDeliveryState } from '../../../../apps/web/src/engine/src/dabs/ribbonDelivery'
import { wetAt } from '../../../../apps/web/src/engine/src/paper/paperWetness'
import { brushDragContactGroups, brushDragField } from '../../../../apps/web/src/engine/src/watercolor/brushDrag'
import { brushDragFieldHoisted } from '../../../../apps/web/src/engine/src/watercolor/brushDragHoisted'
const file=process.env.QA_CONTACT_INPUT,out=process.env.QA_CONTACT_OUT
if(!file||!out||fs.existsSync(out))throw Error('New explicit private fixture/output required')
const ops=JSON.parse(fs.readFileSync(file,'utf8'))
if(ops.length!==2||ops.some((o:any)=>o.type!=='stroke'||o.tool!=='watercolor'||!o.dabsPacked))throw Error('Exact two actual watercolor ops required')
const hash=(v:Uint8Array|string)=>crypto.createHash('sha256').update(v).digest('hex')
const strokes=ops.map((op:any)=>{
 const dabs=strokeDabs(op),preset=presetForTool(op.tool,op.preset),profile=ribbonProfileFor(op.tool,op.preset,wetAt(op.wet,0)),state=createRibbonDeliveryState()
 const {drawable,previous,wetOf}=prepareDrawableRibbonDabs(dabs,undefined,preset,profile,state,op.wet)
 prepareRibbonDelivery(drawable,previous,preset,profile,state,wetOf,wetAt(op.wet,0),'combined',true,true,{markerSegmentLength:ribbonSegmentLength,dabPool:()=>new WeakMap()}, {diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true})
 // The unclipped group's own rectangle is valid only after its generated flow
 // hashes/dimensions match actual captured canonical GPU upload inputs below.
 const groups=brushDragContactGroups(state.brushTravel,{x:-8192,y:-8192,w:16384,h:16384})
 return{op,dabs,drawable,travel:state.brushTravel,groups}
})
const generate=(fn:typeof brushDragField)=>strokes.map(s=>s.groups.map(g=>fn(g.travel,g.rect)!))
const coldArm=process.env.QA_CONTACT_COLD_ARM
const samples:{arm:string;ms:number}[]=[],results:any={}
if(coldArm){if(!['OFF','ON'].includes(coldArm))throw Error('Unknown cold arm');const begin=performance.now(),data=generate(coldArm==='OFF'?brushDragField:brushDragFieldHoisted);samples.push({arm:coldArm,ms:performance.now()-begin});results[coldArm]=data}
else{
 for(let round=0;round<10;round++)for(const arm of (round%2?['ON','OFF']:['OFF','ON'])){const begin=performance.now();results[arm]=generate(arm==='OFF'?brushDragField:brushDragFieldHoisted);if(round>=2)samples.push({arm,ms:performance.now()-begin})}
}
const sequence=(data:any)=>data.flatMap((fields:any[])=>[fields[0],...fields].map(f=>({name:'uploadFlow',width:f.width,height:f.height,sha:hash(f.pixels)})))
const actual=JSON.parse(fs.readFileSync(new URL('./contact-hoist-surface-pair-summary.json',import.meta.url),'utf8')),captured=actual.rows[0],actualActors=new Set(actual.httpActorTrace[0].map((r:any)=>r.httpActor).filter(Boolean));if(actualActors.size!==1)throw Error('Recorded source actor ambiguous')
const expected=captured.quality.uploads.filter((p:any)=>p.name==='uploadFlow')
const exact=Object.values(results).every(data=>JSON.stringify(sequence(data))===JSON.stringify(expected))
const inputExact=strokes.every((s:any,i:number)=>s.op.id===captured.inputPassport[i].id&&s.op.strokeId===captured.inputPassport[i].strokeId&&s.op.preset===captured.inputPassport[i].preset&&s.op.layerId===captured.inputPassport[i].layerId&&s.op.tool==='watercolor'&&actualActors.has(s.op.userId)&&JSON.stringify(s.op.color)===JSON.stringify(captured.inputPassport[i].color)&&hash(JSON.stringify(s.op.dabsPacked))===captured.inputPassport[i].dabsPackedSha&&hash(JSON.stringify(s.op.wet??null))===captured.inputPassport[i].wetSha)
function census(g:any){
 const width=Math.ceil(g.rect.w/4),height=Math.ceil(g.rect.h/4),sx=g.rect.w/width,sy=g.rect.h/height,visits=new Uint16Array(width*height);let candidates=0,contributions=0,activeDabs=0
 for(const d of g.travel){const length=Math.hypot(d.dx,d.dy);if(length<.01||d.water<=0)continue;activeDabs++;const rx=Math.max(d.radius*d.aspect,.5),ry=Math.max(d.radius,.5),c=Math.cos(d.angle),sin=Math.sin(d.angle),ex=Math.hypot(rx*c,ry*sin),ey=Math.hypot(rx*sin,ry*c),x0=Math.max(0,Math.floor((d.x-ex-g.rect.x)/sx)),x1=Math.min(width-1,Math.ceil((d.x+ex-g.rect.x)/sx)),y0=Math.max(0,Math.floor((d.y-ey-g.rect.y)/sy)),y1=Math.min(height-1,Math.ceil((d.y+ey-g.rect.y)/sy));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){candidates++;const px=g.rect.x+(x+.5)*sx-d.x,py=g.rect.y+(y+.5)*sy-d.y,r2=((px*c+py*sin)/rx)**2+((-px*sin+py*c)/ry)**2;if(r2>=1)continue;contributions++;visits[y*width+x]++}
 }
 const touched=visits.reduce((n,v)=>n+Number(v>0),0);return{width,height,activeDabs,candidateCells:candidates,expCalls:contributions,touchedCells:touched,overlapRecomputed:contributions-touched,maxDabsAtCell:visits.reduce((a,b)=>Math.max(a,b),0),outputCells:width*height,floatScratchBytes:width*height*12}
}
const report={scope:'VPS CPU exact recorded canonical contact producer replay; not natural UP timing or physical device',inputExact,actualCanonicalFlowSequenceExact:exact,fixtureSHA:hash(fs.readFileSync(file)),workspaceMode:'none; actual plan diagnosticReuseFlowRaster=false and no Engine/Room wiring',sourceSHA:['brushDrag','brushDragHoisted'].map(n=>({name:n,sha:hash(fs.readFileSync(new URL('../../../../apps/web/src/engine/src/watercolor/'+n+'.ts',import.meta.url)))})),samples,strokes:strokes.map((s:any)=>({strokeId:s.op.strokeId,dabCount:s.dabs.length,drawableCount:s.drawable.length,travelCount:s.travel.length,groups:s.groups.map((g:any)=>({dabCount:g.travel.length,rect:g.rect,cellCount:Math.ceil(g.rect.w/4)*Math.ceil(g.rect.h/4),boundingPixelDabUpper:Math.ceil(g.rect.w/4)*Math.ceil(g.rect.h/4)*g.travel.length,census:census(g)}))}))}
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({out,inputExact,exact,samples,strokes:report.strokes.map(s=>({dabs:s.dabCount,drawable:s.drawableCount,travel:s.travelCount,groups:s.groups.length}))}))
if(!exact||!inputExact)process.exitCode=1
