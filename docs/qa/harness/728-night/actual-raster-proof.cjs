// Read actual resident raster FIRST. No canonical export/oracle can repair it first.
async function actualRasterProof(page,layerId){
 return page.evaluate(async layerId=>{
  const e=__engine,target=e._layers.get(layerId);if(!target)throw Error('Missing layer');
  const material=e._puddle?.layers.get(target);if(material?.tile&&material.context)throw Error('Full physical proof requires a recorded dry boundary');
  const gl=e.gl,split=gl.READ_FRAMEBUFFER!==undefined,binding=gl.getParameter(gl.FRAMEBUFFER_BINDING),readBinding=split?gl.getParameter(gl.READ_FRAMEBUFFER_BINDING):binding;let physical;
  try{physical=target.allResident().map(t=>({x:t.originX,y:t.originY,w:t.buffer.width,h:t.buffer.height,bytes:t.buffer.readPixels()}))}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,binding);if(split)gl.bindFramebuffer(gl.READ_FRAMEBUFFER,readBinding)}
  const oracle=e.bakeLayerByFullReplay(layerId);if(!oracle)throw Error('Missing independent oracle');const live=oracle.slice();
  const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),v=>v.toString(16).padStart(2,'0')).join('');
  let targetChanged=0,physicalChanged=0,max=0,nonzeroAlpha=0;
  const view=new DataView(oracle.buffer,oracle.byteOffset,oracle.byteLength);let off=4;const count=view.getUint32(0,true);if(count!==physical.length)throw Error('Actual/oracle tile count mismatch');
  for(let n=0;n<count;n++){const x=view.getInt32(off,true),y=view.getInt32(off+4,true),w=view.getUint32(off+8,true),h=view.getUint32(off+12,true);off+=16;const t=physical.find(t=>t.x===x&&t.y===y);if(!t||t.w!==w||t.h!==h)throw Error('Actual/oracle tile identity mismatch');for(let k=0;k<w*h*4;k++){live[off+k]=t.bytes[k];const d=Math.abs(t.bytes[k]-oracle[off+k]);if(d){physicalChanged++;targetChanged++}max=Math.max(max,d);if(k%4===3&&t.bytes[k])nonzeroAlpha++}off+=w*h*4}
  if(off!==oracle.length)throw Error('Unexpected oracle trailing bytes');
  return{layerId,actualCapturedBeforeOracle:true,targetHash:await hash(live),oracleHash:await hash(oracle),targetChanged,physicalChanged,max,nonzeroAlpha,tiles:count,bytes:oracle.length,glError:gl.getError()};
 },layerId);
}
module.exports={actualRasterProof};
