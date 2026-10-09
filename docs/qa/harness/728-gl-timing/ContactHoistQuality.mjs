const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',value))].map(n=>n.toString(16).padStart(2,'0')).join('');
/** Canonical recorded-op quality only, separate from natural pointer latency. */
export async function contactHoistQuality({engineUrl,operations,hoisted}){
 if(typeof hoisted!=='boolean'||operations?.length!==2||operations.some(o=>o.type!=='stroke'||!o.dabsPacked||!o.strokeId))throw Error('Exact two recorded strokes required');
 window.__engine?.destroy(); // own QA room only; no overlapping GL engine owners
 const {PencilEngine}=await import(engineUrl),canvas=document.createElement('canvas');canvas.width=canvas.height=1024;document.body.replaceChildren(canvas);
 const e=new PencilEngine(canvas,{paper:'fine',pageWidth:1024,pageHeight:1024,userId:operations[0].userId,diagnosticHoistedContactRaster:hoisted});
 const payloads=[],saved=[],deadline=performance.now()+60000;let retained=0;
 try{
  await e.paperReady();if(e._settlePlan.diagnosticHoistedContactRaster!==hoisted)throw Error('Quality constructor flag');
  for(const name of ['uploadFlow','uploadForeign']){const uploads=e._settlePlan.ctx.uploads,original=uploads[name];if(typeof original!=='function')throw Error('Actual upload producer missing');uploads[name]=function(...args){const pixels=args.find(v=>v instanceof Uint8Array);if(pixels){retained+=pixels.byteLength;if(retained>16*1024*1024||payloads.length>=256)throw Error('Quality capture bounded');payloads.push({name,width:args[1],height:args[2],bytes:pixels.slice()})}return original.apply(this,args)};saved.push(()=>uploads[name]=original)}
  const layer=operations[0].layerId;if(operations.some(o=>o.layerId!==layer))throw Error('Single material layer required');
  e.appendOperation({id:'quality-layer',type:'layer_add',userId:operations[0].userId,layerId:layer,timestamp:operations[0].timestamp-1,name:'QA'},'remote');e.setActiveLayer(layer);e.setCompositeOrder([{id:layer,opacity:1}]);e.setLocked(false);
  for(const op of operations)e.appendOperation(structuredClone(op),'remote');
  while(e._settle||e._wcCanonical.pending||e._rebuildJobs.size||e._unsettledLayers.size){if(performance.now()>deadline||e.gl.isContextLost())throw Error('Quality idle deadline');await new Promise(requestAnimationFrame)}
  if(e._fieldReleaseTimer){clearTimeout(e._fieldReleaseTimer);e._fieldReleaseTimer=0}
  const fields=[];for(const [index,field] of e._fieldCache.entries())for(const role of ['a','b','c','ca','cb','cc','coverage','mask','pressure','band']){const b=field[role];fields.push({index,role,width:b.width,height:b.height,sha:await hash(b.readPixels())})}
  for(const tile of e._layers.get(layer).allResident()){const bytes=tile.buffer.readPixels();fields.push({role:'material',originX:tile.originX,originY:tile.originY,width:tile.buffer.width,height:tile.buffer.height,nonzero:bytes.reduce((n,v)=>n+Number(v!==0),0),sha:await hash(bytes)})}
  const uploads=[];for(const p of payloads)uploads.push({name:p.name,width:p.width,height:p.height,sha:await hash(p.bytes)});
  const blob=await e.exportPNG(true);if(!blob)throw Error('Quality export missing');const image=await createImageBitmap(blob),out=document.createElement('canvas');out.width=image.width;out.height=image.height;const ctx=out.getContext('2d');ctx.drawImage(image,0,0);image.close();const rgba=ctx.getImageData(0,0,out.width,out.height).data;let alpha=0;for(let i=3;i<rgba.length;i+=4)alpha+=rgba[i]!==0;const whole={width:out.width,height:out.height,sha:await hash(rgba),alphaNonzero:alpha};
  const consumption=e._settlePlan.hoistedContactRasterCalls;window.__contactHoistQualityPartial={hoisted,consumption,fields,uploads,whole};if(!alpha||!uploads.length||fields.length<11||!fields.some(f=>f.role==='material'&&f.nonzero>0)||(hoisted?consumption<1:consumption!==0))throw Error('Meaningful quality/consumption missing');
  return{hoisted,consumption,fields,uploads,whole,inputSha:await hash(new TextEncoder().encode(JSON.stringify(operations))),glError:e.gl.getError(),lost:e.gl.isContextLost(),scope:'Same immutable recorded packed/wet ops canonical replay; independent of natural latency, no normalization'};
 }finally{for(const restore of saved)restore();e.destroy()}
}
export function compareContactQuality(rows){return rows.length===2&&rows[0]?.hoisted===false&&rows[1]?.hoisted===true&&rows[0].consumption===0&&rows[1].consumption>0&&!rows.some(r=>r.glError||r.lost)&&rows[0].inputSha===rows[1].inputSha&&JSON.stringify(rows[0].whole)===JSON.stringify(rows[1].whole)&&JSON.stringify(rows[0].fields)===JSON.stringify(rows[1].fields)&&JSON.stringify(rows[0].uploads)===JSON.stringify(rows[1].uploads)}
