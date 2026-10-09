/** Bounded offline strict-f32 operand/address oracle; NOT a GPU compiler oracle. */
import fs from 'node:fs'
import path from 'node:path'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {buildPaperCatch} from '../../../../apps/web/src/engine/src/paper/paperCatch'
const [capturePath,paperPath,outputPath]=process.argv.slice(2)
if(!capturePath||!paperPath||!outputPath||fs.existsSync(outputPath))throw Error('Explicit capture/paper/new output required')
const capture=JSON.parse(fs.readFileSync(capturePath,'utf8')),o=capture.operands.operands
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex')
const manifest=JSON.parse(fs.readFileSync(path.join(paperPath,'manifest.json'),'utf8'))
const height=new Uint8Array(gunzipSync(fs.readFileSync(path.join(paperPath,manifest.assets.fine.texture))))
if(height.length!==o.paperTextureWidth*o.paperTextureHeight||sha(buildPaperCatch(height,manifest.assets.fine.catchLut))!==o.paperSHA)throw Error('Actual paper bytes differ')
const lattice=Buffer.from(fs.readFileSync(new URL('../../../../apps/web/src/engine/src/raster/watercolorNoise.txt',import.meta.url),'utf8'),'base64'),rgba=new Uint8Array(lattice.length*4)
for(let i=0;i<lattice.length;i++)rgba.set([lattice[i],lattice[i],lattice[i],255],i*4)
if(lattice.length!==251*251||sha(rgba)!==o.noiseSHA)throw Error('Actual noise upload bytes differ')
if(o.stride!==1||o.width>8388608||o.height>8388608||o.scale!==1)throw Error('Actual captured coordinate contract unsupported')
const f=Math.fround,add=(a:number,b:number)=>f(f(a)+f(b)),mul=(a:number,b:number)=>f(f(a)*f(b)),div=(a:number,b:number)=>f(f(a)/f(b))
const mix=(a:number,b:number,t:number)=>add(mul(a,add(1,-t)),mul(b,t))
const mod=(n:number,d:number)=>((n%d)+d)%d
const pixel=(x:number,y:number):[number,number]=>[f(x+.5),f(f(o.height-y)-.5)]
function paperAt(px:readonly number[]):number{
 const g=px.map((v,i)=>add(mul(mul(div(add(v,o.paperOrigin[i]),o.paperTexSize[i]),o.paperScale),i?o.paperTextureHeight:o.paperTextureWidth),-.5))
 const base=g.map(Math.floor),t=g.map((v,i)=>f(v-base[i]))
 const sample=(x:number,y:number)=>f(height[mod(y,o.paperTextureHeight)*o.paperTextureWidth+mod(x,o.paperTextureWidth)]/255)
 return mix(mix(sample(base[0],base[1]),sample(base[0]+1,base[1]),t[0]),mix(sample(base[0],base[1]+1),sample(base[0]+1,base[1]+1),t[0]),t[1])
}
function noise(p:readonly number[]):number{
 const i=p.map(Math.floor),t=p.map((v,k)=>{const a=f(v-i[k]);return mul(mul(a,a),add(3,-mul(2,a)))})
 const s=(x:number,y:number)=>f(lattice[mod(y,251)*251+mod(x,251)]/255)
 return mix(mix(s(i[0],i[1]),s(i[0]+1,i[1]),t[0]),mix(s(i[0],i[1]+1),s(i[0]+1,i[1]+1),t[0]),t[1])
}
function climb(px:readonly number[]):number{
 const p=px.map((v,i)=>add(mul(add(v,o.paperOrigin[i]),.025),i?7:41))
 const n=add(mul(.63,noise(p)),mul(.37,noise(p.map((v,i)=>add(mul(v,2.7),i?17.9:31.4)))))
 const t=Math.max(0,Math.min(1,div(add(n,-.5),add(.64,-.5))))
 return mul(o.climb,add(1,mul(4,mul(mul(t,t),add(3,-mul(2,t))))))
}
const cache=new Map<string,readonly[number,number]>(),cached=(x:number,y:number)=>{const key=x+':'+y;let pair=cache.get(key);if(!pair){const p=pixel(x,y);pair=[paperAt(p),climb(p)];cache.set(key,pair)}return pair}
let points=0,neighbors=0,costCases=0
const offsets=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]
for(let j=0;j<33;j++)for(let i=0;i<33;i++){
 const qx=Math.round(i*(o.width-1)/32),qy=Math.round(j*(o.height-1)/32),p=pixel(qx,qy),h=paperAt(p),k=climb(p),pair=cached(qx,qy)
 if(!Object.is(h,pair[0])||!Object.is(k,pair[1]))throw Error('Center float operand differs');points++
 for(const [ox,oy] of offsets){const nx=qx+ox,ny=qy-oy;if(nx<0||ny<0||nx>=o.width||ny>=o.height)continue
  const old=[add(p[0],ox),add(p[1],oy)],next=pixel(nx,ny);if(old.some((v,k)=>!Object.is(v,next[k])))throw Error('Neighbor coordinate differs')
  const hi=paperAt(old),hc=cached(nx,ny)[0];if(!Object.is(hi,hc))throw Error('Neighbor bilinear float differs');neighbors++
  // Synthetic Q8 boundaries exercise unchanged relief/min arithmetic. The
  // actual previous cost/coverage textures were NOT read by this capture.
  for(const ci of [0,1/255,127/255,254/255])for(const film of [0,.5,1]){
   const step=(neighbor:number)=>{const relief=Math.max(f(o.floor),add(1,mul(k,add(h,-neighbor)))),edge=mul(ox&&oy?1.41421356:1,mul(relief,mix(o.dryCost,1,film)));return Math.round(Math.max(0,Math.min(1,div(Math.min(o.costMax,add(mul(ci,o.costMax),edge)),o.costMax)))*255)}
   if(step(hi)!==step(hc))throw Error('Synthetic Q8 output differs');costCases++
  }
 }
}
fs.writeFileSync(outputPath,JSON.stringify({verdict:'PASS_BOUNDED_CPU_STRICT_F32_OPERAND_ORACLE',source:capture.source,captureSHA:sha(fs.readFileSync(capturePath)),paperSHA:o.paperSHA,noiseSHA:o.noiseSHA,actualGeometry:{width:o.width,height:o.height,scale:o.scale,origin:o.paperOrigin,texSize:o.paperTexSize},points,neighbors,costCases,cacheFloatBytes:8*o.width*o.height,limitations:['Sampled actual static input bytes and uniforms, not actual mutable cost/coverage values','Strict-f32 arithmetic model; WGSL compiler contraction/FMA not proved','GPU intermediate Q8 material parity remains mandatory']},null,2)+'\n',{flag:'wx'})
console.info(JSON.stringify({points,neighbors,costCases,scope:'CPU only; no GPU parity claim'}))
