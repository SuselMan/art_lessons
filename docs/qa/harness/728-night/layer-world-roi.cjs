// Layer readPixels is bottom-up within each tile. World coordinates are top-down.
// Capture physical bytes BEFORE invoking any independent replay or canonical hook.
async function layerWorldRoi(page,layerId,rect,{oracle=true}={}){
 return page.evaluate(async({layerId,rect,oracle})=>{
  const e=__engine,g=e.gl,target=e._layers.get(layerId),split=g.READ_FRAMEBUFFER!==undefined;
  const binding=g.getParameter(g.FRAMEBUFFER_BINDING),read=split?g.getParameter(g.READ_FRAMEBUFFER_BINDING):binding;
  let tiles;try{tiles=target.allResident().map(t=>({x:t.originX,y:t.originY,w:t.buffer.width,h:t.buffer.height,bytes:t.buffer.readPixels().slice()}))}finally{g.bindFramebuffer(g.FRAMEBUFFER,binding);if(split)g.bindFramebuffer(g.READ_FRAMEBUFFER,read)}
  const at=(tiles,x,y,c)=>{const t=tiles.find(t=>x>=t.x&&x<t.x+t.w&&y>=t.y&&y<t.y+t.h);return t?.bytes[((t.h-1-(y-t.y))*t.w+x-t.x)*4+c]??0};
  const crop=tiles=>{const out=new Uint8Array(rect.w*rect.h*4);let n=0;for(let y=rect.y;y<rect.y+rect.h;y++)for(let x=rect.x;x<rect.x+rect.w;x++)for(let c=0;c<4;c++)out[n++]=at(tiles,x,y,c);return out};
  let redBounds=null;for(const t of tiles)for(let y=0;y<t.h;y++)for(let x=0;x<t.w;x++){const i=((t.h-1-y)*t.w+x)*4,a=t.bytes;if(a[i]>20&&a[i]>a[i+1]*2&&a[i]>a[i+2]*2&&a[i+3]>20){const px=x+t.x,py=y+t.y;redBounds=redBounds?{x0:Math.min(redBounds.x0,px),y0:Math.min(redBounds.y0,py),x1:Math.max(redBounds.x1,px),y1:Math.max(redBounds.y1,py)}:{x0:px,y0:py,x1:px,y1:py}}}
  const bytes=crop(tiles),sha=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');let nonzeroAlpha=0;for(let i=3;i<bytes.length;i+=4)if(bytes[i])nonzeroAlpha++;
  const out={rect,physicalHash:await sha(bytes),nonzeroAlpha,redBounds,actualCapturedBeforeOracle:true,glError:g.getError(),rgba:Array.from(bytes)};
  if(oracle){const previousHidden=e.diagnosticM70HiddenReplay;let encoded;try{e.diagnosticM70HiddenReplay=false;encoded=e.bakeLayerByFullReplay(layerId)}finally{e.diagnosticM70HiddenReplay=previousHidden}const{decodeLayerTiles}=await import('/src/engine/src/oplog/snapshotCodec.ts'),decoded=decodeLayerTiles(encoded,0).tiles.map(t=>({x:t.originX,y:t.originY,w:t.width,h:t.height,bytes:t.pixels})),expected=crop(decoded);out.oracleHash=await sha(expected);out.changed=0;out.max=0;for(let i=0;i<bytes.length;i++){const d=Math.abs(bytes[i]-expected[i]);if(d)out.changed++;out.max=Math.max(out.max,d)}}return out;
 },{layerId,rect,oracle});
}
module.exports={layerWorldRoi};
