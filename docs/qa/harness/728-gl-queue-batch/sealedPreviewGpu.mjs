/** Bounded primitive fixture; synthetic material fields, not actual Room quality. */
import {SealedPreviewTransport,PREVIEW_BYTES} from './SealedPreviewTransport.mjs';
import {SealedPreviewGlPort} from './SealedPreviewGlPort.mjs';
import {createPreviewWaterDomain} from './PreviewWaterDomain.mjs';
export async function runSealedPreviewGpu(){
 const [{PencilEngine},{AccumulationBuffer}]=await Promise.all([import('/src/engine/index.ts'),import('/src/engine/src/buffers/AccumulationBuffer.ts')]);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;document.querySelector('#surface').replaceChildren(canvas);const e=new PencilEngine(canvas,{paper:'fine',pageWidth:1024,pageHeight:1024,userId:'preview-primitive'}),owned=[];let domain;
 const make=(size)=>{const f=new AccumulationBuffer(e.gl,size,size,'nearest');owned.push(f);f.clear();return f};
 const hash=async f=>{const bytes=f.readPixels();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')};
 const upload=(f,bytes)=>{e.gl.bindTexture(e.gl.TEXTURE_2D,f.texture);e.gl.texSubImage2D(e.gl.TEXTURE_2D,0,0,0,f.width,f.height,e.gl.RGBA,e.gl.UNSIGNED_BYTE,bytes)};
 try{await e.paperReady();const source=Object.fromEntries(['original','coverage','pigmentLoad','pigmentBase','colourLoad','colourBase','solventLoad','solventBase'].map(k=>[k,make(1024)]));const v=new Uint8Array(1024*1024*4),p=new Uint8Array(v.length),c=new Uint8Array(v.length);
 // Two wet ponds separated by >=4 preview cells; pigment only left pond.
 for(let y=256;y<768;y++)for(let x=128;x<896;x++){const i=(y*1024+x)*4;if(x<480||x>=544){v[i]=255;v[i+3]=255}if((x-320)**2+(y-512)**2<35**2){p.set([70,80,90,100],i);c.set([90,60,30,100],i)}}
 upload(source.solventLoad,v);upload(source.pigmentLoad,p);upload(source.colourLoad,c);
 const before=Object.fromEntries(await Promise.all(Object.entries(source).map(async([k,f])=>[k,await hash(f)])));
 const lease=Object.fromEntries(['p0','c0','p1','c1','water','coverage'].map(k=>[k,make(128)]));lease.pending=make(1024);lease.bytes=PREVIEW_BYTES;lease.release=()=>{};
 const transport=new SealedPreviewTransport({source,lease,token:1});domain=await createPreviewWaterDomain(e._watercolorPasses);const port=new SealedPreviewGlPort(e._watercolorPasses,{paperWidth:e._watercolorPasses.ctx.paperWorldSize().w,paperHeight:e._watercolorPasses.ctx.paperWorldSize().h,domainFromWater:domain});port.initialize(transport.seal());
 const measures=()=>{const bytes=lease[`p${transport.front}`].readPixels();let mass=0,right=0,nonzero=0;for(let y=0;y<128;y++)for(let x=0;x<128;x++){const a=bytes[(y*128+x)*4+3];mass+=a;nonzero+=a>0;if(x>=68)right+=a}return{mass,right,nonzero}};
 const initial=measures(), initialSha=await hash(lease.p0);for(let n=0;n<16;n++){const ticket=transport.begin();port.step(ticket);transport.complete(ticket)}const evolved=measures(), evolvedSha=await hash(lease[`p${transport.front}`]);transport.reset();port.initialize({token:1,epoch:transport.epoch,source,out:{p:lease.p0,c:lease.c0,water:lease.water,coverage:lease.coverage}});const footprintOnly=new Uint8Array(128*128*4);for(let y=0;y<128;y++)for(let x=0;x<128;x++)if((x-40)**2+(y-64)**2<4.375**2)footprintOnly[(y*128+x)*4+3]=255;upload(lease.coverage,footprintOnly);const footprintBefore=measures();for(let n=0;n<16;n++){const ticket=transport.begin();port.step(ticket);transport.complete(ticket)}const footprintAfter=measures();const fence=transport.retire();e.gl.finish();transport.releaseAfterFence(fence);
 const after=Object.fromEntries(await Promise.all(Object.entries(source).map(async([k,f])=>[k,await hash(f)])));return{sourceReadonly:JSON.stringify(before)===JSON.stringify(after),before,after,initial,evolved,initialSha,evolvedSha,materialMoved:initialSha!==evolvedSha,footprintBefore,footprintAfter,footprintExpansion:footprintAfter.nonzero-footprintBefore.nonzero,massDrift:evolved.mass-initial.mass,disconnected:evolved.right===0,faint70Nonzero:initial.nonzero>0,stats:port.stats,glError:e.gl.getError(),lost:e.gl.isContextLost(),scope:'synthetic 70px source; sparse fourtap approximation; no Room or canonical parity proof'};
 }finally{domain?.disposeAfterFence();for(const f of owned)f.destroy();e.destroy()}
}
