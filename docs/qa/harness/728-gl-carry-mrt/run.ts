import {WatercolorPasses} from '../../../../apps/web/src/engine/src/raster/WatercolorPasses'
import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import {adaptDiagnosticWebgl2} from '../../../../apps/web/src/engine/src/raster/diagnosticWebgl2'
import type {StampPainter} from '../../../../apps/web/src/engine/src/dabs/StampPainter'
const difference=(a:Uint8Array,b:Uint8Array)=>{let changed=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);changed+=+(d>0);max=Math.max(max,d)}return{changed,max}}
/** Actual original modes16→15 vs two-target MRT; every Q8 iteration captured. */
export async function runCarryMrtPrimitive({sizes=[[31,29],[32,40]],iterations=4}:{sizes?:[number,number][];iterations?:number}={}){
 if(iterations<1||iterations>16||!Number.isInteger(iterations)||sizes.some(([w,h])=>!Number.isInteger(w)||!Number.isInteger(h)||w<8||h<8||w*h>1536*1536))throw Error('Bounded fixture exceeded')
 const rows=[]
 for(const[w,h]of sizes){
  const canvas=document.createElement('canvas'),raw=canvas.getContext('webgl2',{antialias:false})!;if(!raw)throw Error('GL2 unavailable');const gl=adaptDiagnosticWebgl2(raw),screen=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,screen);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
  const passes=new WatercolorPasses({gl:()=>gl,screenBuf:()=>screen,paperTex:()=>null as unknown as WebGLTexture,paperScale:()=>1,paperWorldSize:()=>({w:1024,h:1024}),stamps:()=>({})as StampPainter});passes.initFieldPrograms();passes.initSettlePrograms();passes.initFieldUniforms();passes.initFieldAttributes();passes.initDiffusionAttributes()
  const buffers=Array.from({length:8},(_,i)=>new AccumulationBuffer(gl,w,h,i===2?'linear':'nearest')), [p,c,cost,fixed,oldP,oldC,newP,newC]=buffers
  const put=(target:AccumulationBuffer,bytes:Uint8Array)=>{gl.bindTexture(gl.TEXTURE_2D,target.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes)}
  const pigment=new Uint8Array(w*h*4),colour=new Uint8Array(w*h*4),water=new Uint8Array(w*h*4)
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=(y*w+x)*4,mass=30+(x*23+y*19)%180;pigment.set([Math.floor(mass*.5),Math.floor(mass*.7),Math.floor(mass*.9),mass],j);colour.set([Math.floor(mass*(x%2?.2:.8)),Math.floor(mass*.6),Math.floor(mass*(y%2?.7:.1)),mass],j);water.set([x<w/3?0:Math.floor(x/(w-1)*180),(x*17+y*3)&255,0,255],j)}
  put(p,pigment);put(c,colour);put(cost,water);fixed.clear()
  try{for(let i=0;i<iterations;i++){
   const stride=1+i%3,opts={d:cost,e:cost,dir:[stride,stride]as[number,number],origin:[stride,.35]as[number,number],size:[2,17]as[number,number],band:[.8,1]as[number,number],tau:[.01,.8,1]as[number,number,number],...(i===2?{scissor:[2,3,w-4,h-6]as[number,number,number,number]}:{})}
   oldP.clear();oldC.clear();newP.clear();newC.clear()
   passes.fieldOp(oldC,c,fixed,16,.25,{...opts,c:p});passes.fieldOp(oldP,p,fixed,15,.25,opts)
   passes.diagnosticCarryMrt=true;if(!passes.carryPair(newP,p,newC,c,fixed,.25,opts))throw Error('MRT not exercised')
   const a=oldP.readPixels(),b=newP.readPixels(),ac=oldC.readPixels(),bc=newC.readPixels()
   rows.push({w,h,iteration:i,stride,scissor:opts.scissor??null,pigment:difference(a,b),colour:difference(ac,bc),transport:difference(p.readPixels(),a),stats:{...passes.carryPairStats},glError:gl.getError()})
   // Both arms consumed identical OLD values; next original Q8 output becomes input.
   put(p,a);put(c,ac)
  }}finally{passes.destroy();buffers.forEach(x=>x.destroy());gl.deleteBuffer(screen);raw.getExtension('WEBGL_lose_context')?.loseContext()}
 }
 return{valid:rows.every(x=>x.pigment.changed===0&&x.colour.changed===0&&x.glError===0)&&rows.some(x=>x.transport.changed>0),rows,limitations:['Primitive actualGL2 only, not whole Room or device timing','Original Q8 boundaries retained; same-output software does not establish cross-GPU precision']}
}
Object.assign(window,{runCarryMrtPrimitive})
