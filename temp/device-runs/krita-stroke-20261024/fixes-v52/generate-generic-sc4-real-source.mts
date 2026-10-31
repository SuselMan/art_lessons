/** Bounded offline CPU source-law oracle. Native imports are external optional input. */
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import {CANONICAL_STROKE_RASTER_PROFILE as oldProfile,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as newProfile,isBrushLibrary,type BrushDescriptor,type CanonicalSoftAutoRecipe} from '../../../../packages/shared/src/index'
import {authored,packet,targetGeometry,seeds} from './generic-sc4-real-source-author.mts'
import {sourceAutoGeometry} from '../../../../packages/shared/src/sourceAutoGeometry'
import {compileSourceSoftCircleProgram,sourceSoftCircleDab} from '../../../../apps/web/src/engine/src/presets/sourceSoftCircleDab'
import {createSourcePrimaryComposition,advanceSourcePrimaryComposition} from '../../../../apps/web/src/engine/src/presets/sourcePrimaryComposition'
import {compositeSourceFused32} from '../../../../apps/web/src/engine/src/presets/sourceFused32'
import {compositeRgba8,SOURCE_RGBA8_GENERIC_SC_PROFILE} from '../../../../apps/web/src/engine/src/presets/sourceColorRgba8'
import type{Rgba8}from '../../../../apps/web/src/engine/src/presets/mixWeightedRgba8'
const root=new URL('./',import.meta.url),start=performance.now(),hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex'),path=process.argv[2]
if(!path)throw Error('Pass retained actual NEW soft-six-compiled-descriptors.json')
const inputBytes=fs.readFileSync(path);if(inputBytes.length!==209659||hash(inputBytes)!=='721d0c7ca7245dd3b561a6fa4a0d5974035d196e4ab4f497c016072c19600c13')throw Error('Wrong actual input')
const stock=JSON.parse(inputBytes.toString()),assets=new Map()
for(const row of stock.rows){const p=row.descriptor.tip.profile;if(p?.kind==='radialCurve'){let size=4;while(size*size<4*(p.resolution+2))size*=2;assets.set(p.lookup,{id:p.lookup,size,file:p.lookup.slice(6)+'.bin'})}}
if(!isBrushLibrary({schemaVersion:1,assets:[...assets.values()],brushes:stock.rows.map((r:any)=>({descriptor:r.descriptor,name:r.name,source:'krita-original-kpp',warnings:[]})),skipped:[]}))throw Error('Invalid real descriptor structural schema')
const totals={draws:0,maskPixels:0,workSamples:0,pointComposites:0},limits={milliseconds:120000,draws:512,maskPixels:16*1048576,workSamples:32*1048576,pointComposites:2*1048576}
function bound(){if(performance.now()-start>limits.milliseconds||totals.draws>limits.draws||totals.maskPixels>limits.maskPixels||totals.workSamples>limits.workSamples||totals.pointComposites>limits.pointComposites)throw Error('CPU oracle work/time limit')}
const fused=(src:Uint8Array,dst:Uint8Array,operator:'over'|'alphaDarkenCreamy'|'alphaDarkenHard',opacity:number,averageOpacity=opacity,flow=1)=>{totals.pointComposites++;if(!(totals.pointComposites&1023))bound();return compositeSourceFused32({profile:'installed-arm64-vector32-fused-fpcr0-v1',operator,source:src,destination:dst,cols:1,rows:1,sourceStride:4,destinationStride:4,maskStride:1,sourceAlignment:0,destinationAlignment:0,opacity,averageOpacity,flow}).pixels}
const normalized=(v:unknown):unknown=>Array.isArray(v)?v.map(normalized):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,normalized(v)])):v
const buffers:Record<string,string>={},save=(v:Uint8Array)=>{const h=hash(v);buffers[h]??=Buffer.from(v).toString('base64');return h},cases=[]
for(const row of stock.rows.filter((r:any)=>[3,60,61,62,63].includes(r.index))){
 const descriptor=row.descriptor as BrushDescriptor,rasterProfile=row.index===3?oldProfile:newProfile,descriptorSha256=hash(JSON.stringify(normalized(descriptor)))
 const probe=authored(descriptor,row.index,descriptorSha256,rasterProfile,[packet(0,32)]),first=probe.frames.flatMap(f=>f.frame.definitions).find(r=>r.kind==='softAuto')
 if(!first||first.kind!=='softAuto')throw Error('No first native geometry')
 const pin=probe.pin,q=pin.source,nativeGeometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:q.diameter,ratio:q.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle},{scale:first.scale,ratio:first.ratio,rotation:first.rotation},first.subX,first.subY)
 const x=Math.floor(nativeGeometry.hotSpot[0])-16,packets=[packet(x,32),packet(x+5,35,1)],actual=authored(descriptor,row.index,descriptorSha256,rasterProfile,packets)
 const soft=compileSourceSoftCircleProgram({kind:'auto',generator:'soft',shape:'circle',diameter:q.diameter,ratio:q.ratio,horizontalFade:q.horizontalFade,verticalFade:q.verticalFade,spikes:2,softness:1,randomness:0,density:1,antialias:false},{points:pin.radialCurve.source.points,coefficients:pin.radialCurve.coefficients},Math.floor(q.diameter*4+.5)+2)
 const original=Uint8Array.from({length:64*64*4},(_,i)=>{const p=Math.floor(i/4),x=p%64,y=Math.floor(p/64);return i%4===0?31+(x*7+y*3)%160:i%4===1?21+(x*5+y*11)%190:i%4===2?9+(x*13+y*2)%200:73+(x*17+y*19)%150}),local=new Uint8Array(original.length)
 let output=original.slice(),painter=createSourcePrimaryComposition(actual.composition).state,visiblePartial=0,visibleNonzero=0
 const masks=new Map<string,ReturnType<typeof sourceSoftCircleDab>>(),phases=[]
 for(let ordinal=0;ordinal<actual.frames.length;ordinal++){
  const f=actual.frames[ordinal].frame,result=advanceSourcePrimaryComposition(painter,{ordinal,frame:f})
  for(const d of result.draws){const r=f.definitions[d.definition];if(r.kind!=='softAuto')throw Error('Not soft data')
   const key=hash(JSON.stringify(r,(_k,v)=>typeof v==='number'&&Object.is(v,-0)?'F64:-0':v));let raster=masks.get(key)
   if(!raster){const a=r as CanonicalSoftAutoRecipe;raster=sourceSoftCircleDab({dialect:'krita-soft-circle-qt5-arm64-v1',program:soft,storedScale:a.brushScale,storedAngle:a.brushAngle,shape:{scale:a.scale,ratio:a.ratio,rotation:a.rotation},subpixelX:a.subX,subpixelY:a.subY,coverageProfile:a.coverageProfile,maxPixels:1048576,maxWorkSamples:16*1048576});masks.set(key,raster);totals.maskPixels+=raster.mask.length;totals.workSamples+=raster.mask.length*raster.samplesPerPixel;bound()}
   totals.draws++;bound()
   for(let y=Math.max(0,d.y);y<Math.min(64,d.y+r.height);y++)for(let x=Math.max(0,d.x);x<Math.min(64,d.x+r.width);x++){
    const sx=r.mirrorH?r.width-1-(x-d.x):x-d.x,sy=r.mirrorV?r.height-1-(y-d.y):y-d.y,a=raster.mask[sy*r.width+sx],at=(y*64+x)*4,c=d.controls
    if(a>0)visibleNonzero++;if(a>0&&a<255)visiblePartial++
    if(c.kind!=='localAlphaDarken')throw Error('Not wash')
    local.set(fused(new Uint8Array([...actual.rgb,a]),local.slice(at,at+4),c.variant==='hard'?'alphaDarkenHard':'alphaDarkenCreamy',c.opacity,c.averageOpacity,c.flow),at)
   }
  }
  if(result.commands.length){output=original.slice();for(let p=0;p<4096;p++){const at=p*4,src=local.slice(at,at+4),dst=original.slice(at,at+4),blend=actual.composition.outerBlend
   if(blend!=='over'){totals.pointComposites++;if(!(totals.pointComposites&1023))bound()}
   output.set(blend==='over'?fused(src,dst,'over',actual.composition.outerResourceOpacity):compositeRgba8([...src] as Rgba8,[...dst] as Rgba8,{mode:blend,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:actual.composition.outerResourceOpacity}),at)
  }}
  painter=result.state;phases.push({ordinal,derived:save(output),stable:save(painter.ended?output:original),ended:painter.ended,drawCount:painter.drawCount})
 }
 const changedBytes=output.reduce((n,v,i)=>n+Number(v!==original[i]),0);if(!changedBytes||!visiblePartial||!painter.ended)throw Error('Trivial or incomplete actual case')
 cases.push({index:row.index,name:row.name,kppSHA256:row.kppSHA256,descriptorSha256,descriptor,rasterProfile,packets,seeds,expectedEnvelopes:actual.frames.map(f=>f.envelope),inputFrameCuts:actual.inputFrameCuts,phases,original:save(original),final:save(output),changedBytes,visiblePartial,visibleNonzero,drawCount:painter.drawCount,capacity:{width:Math.max(1,...actual.frames.flatMap(f=>f.frame.definitions.map(r=>r.width))),height:Math.max(1,...actual.frames.flatMap(f=>f.frame.definitions.map(r=>r.height)))},nativePlacement:{hotSpot:nativeGeometry.hotSpot,maskSize:nativeGeometry.maskSize,firstX:x}})
}
const fixture={width:64,height:64,compositeSize:8,targetGeometry,cases,buffers},serialized=JSON.stringify(fixture,(_k,v)=>typeof v==='number'&&Object.is(v,-0)?{__qaF64NegativeZero:true}:v)
fs.writeFileSync(new URL('generic-sc4-real-source-host.json',root),serialized)
const proof={scope:'Actual NEW KPP source binding+seeded2-packet production author/adapter/encoder; native-derived soft mask/fused scalar/GenericSC point-law CPU oracle, not installedGUI whole-stroke or room activation. Legacy fallback catalog metadata structural only, CASbytes not used.',inputSHA256:hash(inputBytes),fixtureSHA256:hash(serialized),fixtureBytes:serialized.length,generatorSHA256:hash(fs.readFileSync(new URL(import.meta.url))),authorDriverSHA256:hash(fs.readFileSync(new URL('generic-sc4-real-source-author.mts',root))),totals,limits,elapsedMs:performance.now()-start,cases:cases.map(({descriptor,expectedEnvelopes,phases,packets,...c})=>({...c,frames:expectedEnvelopes.length,phases:phases.length,packets}))}
fs.writeFileSync(new URL('generic-sc4-real-source-host-proof.json',root),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({cases:cases.length,totals,elapsedMs:proof.elapsedMs,fixtureBytes:proof.fixtureBytes,rows:proof.cases.map(c=>({index:c.index,frames:c.frames,draws:c.drawCount,changed:c.changedBytes,partial:c.visiblePartial,capacity:c.capacity}))}))
