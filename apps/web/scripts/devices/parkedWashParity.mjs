// #702: byte-exact compact and whole-buffer parking on native GPUs.
// DEVBRIDGE_PORT=5288 node .../parkedWashParity.mjs laptop=<id> surface=<id> ipad=<id>
import { mkdirSync, writeFileSync } from 'node:fs'
import { ev } from './bridge.mjs'

const peers = process.argv.slice(2).map(arg => arg.split('='))
if (!peers.length || peers.some(p => p.length !== 2)) throw Error('Supply name=bridge-id peers')
const dir = new URL(`../../../../temp/device-runs/parked-wash-${Date.now()}/`, import.meta.url)
mkdirSync(dir, { recursive: true })
const results = []
for (const edge of [512, 1024]) for (const [name, id] of peers) {
  const result = await ev(id, `
    const {PencilEngine}=await import('/src/engine/index.ts');
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
    const edge=${edge}, E=new PencilEngine(canvas,{pageWidth:edge,pageHeight:edge,userId:'host'});
    try {
      await E._paper.ready();
      E.appendOperation({id:'layer',type:'layer_add',userId:'host',timestamp:0,layerId:'L',name:'L'});
      E.setCompositeOrder([{id:'L',opacity:1}]);
      const dab=(x,y,t)=>({x,y,t,size:8,pressure:.7,tiltX:0,tiltY:0,aspectRatio:1,angle:0,opacity:.4});
      E.appendOperation({id:'op',type:'stroke',userId:'peer',timestamp:0,layerId:'L',strokeId:'s1',washId:'w1',
        tool:'watercolor',preset:'normal:55:60:PB29:round',color:[.2,.3,.6],dabs:[dab(200,200,0),dab(220,204,20)]},'remote');
      E._completeSettle();
      const chunk=E._replayRibbonChunks.get('w1');chunk.scratch.releaseFilm();
      const bounds=chunk.scratch._storageBounds, entry=[...chunk.scratch._tiles.values()][0];
      const keys=['original','coverage','inkLoad','inkSettled','inkColor','colorSettled','inkDry','colorDry'];
      const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b.readPixels()))]
        .map(v=>v.toString(16).padStart(2,'0')).join('');
      const before={};
      for(const [ki,k] of keys.entries()) {
        const b=entry[k]??=E._ribbonScratchPool.acquire(edge,edge),p=new Uint8Array(edge*edge*4);
        for(let y=0;y<edge;y++)for(let x=0;x<edge;x++) {
          const wy=edge-1-y;
          if(k!=='original'&&(x<Math.floor(bounds.minX)||x>=Math.ceil(bounds.maxX)
            ||wy<Math.floor(bounds.minY)||wy>=Math.ceil(bounds.maxY)))continue;
          const i=(y*edge+x)*4;
          p[i]=(x+ki*17)%256;p[i+1]=(wy+ki*29)%256;p[i+2]=(x*3+wy*7)%256;
          p[i+3]=x%3?121:0; // Nonzero RGB under transparent pixels must survive.
        }
        b.writePixels(p);before[k]=await hash(b);
      }
      const gl=E.gl,native=gl.readPixels;let reads=0;
      gl.readPixels=function(...a){reads++;return native.apply(gl,a)};
      const start=performance.now();E._evictChunk('w1',true);
      const parkMs=performance.now()-start,bytes=E._spilledWashes.get('w1').spill.bytes;
      gl.enable(gl.SCISSOR_TEST);gl.scissor(0,0,1,1);
      const restored=E._replayChunkScratch(chunk.target,'s2','w1',[dab(400,400,0)],{});
      const readCount=reads;gl.readPixels=native;
      const after={},back=[...restored.scratch._tiles.values()][0];
      for(const k of keys)after[k]=await hash(back[k]);
      return {gpu:E.gpuInfo(),bounds,bytes,fullBytes:8*edge*edge*4,parkMs,readCount,
        scissorRestored:gl.isEnabled(gl.SCISSOR_TEST),equal:keys.every(k=>before[k]===after[k]),
        before,after,error:gl.getError()};
    }finally{E.destroy();E.gl.getExtension('WEBGL_lose_context')?.loseContext();}
  `, 60000)
  const pass = result.equal && result.readCount === 0 && result.error === 0 && result.scissorRestored
    && (edge === 512 ? result.bytes === result.fullBytes : result.bytes < result.fullBytes)
  writeFileSync(new URL(`${name}-${edge}.json`, dir), JSON.stringify(result, null, 2))
  results.push({ name, edge, pass, parkMs: result.parkMs, bytes: result.bytes })
}
console.log(JSON.stringify({ dir: dir.pathname, results }))
if (results.some(r => !r.pass)) process.exitCode = 1
