// Full physical storage captured FIRST; crop only by independently known page
// geometry. Codec clips right/bottom edge tiles; physical storage remains1024².
async function actualPageRasterProof(page,layerId,source="physical"){return page.evaluate(async({layerId,source})=>{
 const e=__engine,target=e._layers.get(layerId);if(!target)throw Error('Missing own layer');
 const {w:pageW,h:pageH}=e._paper.pageSize(),physical=(source==='canonical-goal'?[...e._puddle.layers.get(target).tiles.values()].map(s=>({...s.tile,buffer:s.goal})):target.allResident()).map(t=>({x:t.originX,y:t.originY,w:t.buffer.width,h:t.buffer.height,bytes:t.buffer.readPixels()}));
 const old=e.diagnosticM70HiddenReplay;let oracle;try{e.diagnosticM70HiddenReplay=false;oracle=e.bakeLayerByFullReplay(layerId)}finally{e.diagnosticM70HiddenReplay=old}if(!oracle)throw Error('Missing full replay oracle');
 const view=new DataView(oracle.buffer,oracle.byteOffset,oracle.byteLength),actual=oracle.slice();let offset=4,changed=0,max=0,alpha=0;const tiles=[];
 if(view.getUint32(0,true)!==physical.length)throw Error('Tile count mismatch');
 for(let n=0;n<physical.length;n++){
  const x=view.getInt32(offset,true),y=view.getInt32(offset+4,true),w=view.getUint32(offset+8,true),h=view.getUint32(offset+12,true);offset+=16;
  const t=physical.find(t=>t.x===x&&t.y===y);if(!t||w!==Math.min(t.w,pageW-x)||h!==Math.min(t.h,pageH-y))throw Error('Clipped page tile geometry mismatch');
  // Buffer bottom-up row0 may be below the finite sheet: surviving page rows
  // occupy the TOP h rows of a physical edge storage tile.
  const bottom=t.h-h;let tileChanged=0,tileAlpha=0;
  for(let row=0;row<h;row++)for(let col=0;col<w*4;col++){
   const a=t.bytes[((bottom+row)*t.w)*4+col],at=offset+row*w*4+col,d=Math.abs(a-oracle[at]);actual[at]=a;
   if(d){changed++;tileChanged++}max=Math.max(max,d);if(col%4===3&&a){alpha++;tileAlpha++}
  }
  tiles.push({x,y,w,h,storageW:t.w,storageH:t.h,changed:tileChanged,alpha:tileAlpha});offset+=w*h*4;
 }
 if(offset!==oracle.length)throw Error('Oracle trailing bytes');const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
 return{actualSource:source,actualCapturedBeforeOracle:true,page:{width:pageW,height:pageH},physicalChanged:changed,max,alpha,tiles,actualHash:await hash(actual),oracleHash:await hash(oracle),glError:e.gl.getError()};
},{layerId,source})}
module.exports={actualPageRasterProof};
