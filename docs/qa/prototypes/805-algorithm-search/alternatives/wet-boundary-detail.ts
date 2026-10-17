import type {AlgorithmInput,GLAlgorithm,GLDefinition} from '../protocol'
import {GPU,head,sample,copy,number,resolution,reduce} from './gpu'
/** Static receiver affinity at the ORIGINAL wet boundary, not a far cost halo.
 * Paper is supplied byte terrain, not float hash/noise generated in a shader. */
const preference=head+`uniform sampler2D aux;uniform vec2 n;uniform float rim,grain;void main(){vec2 e=1./n;vec4 a=texture2D(aux,uv);float dx=texture2D(aux,uv+vec2(e.x,0.)).r-texture2D(aux,uv-vec2(e.x,0.)).r;float dy=texture2D(aux,uv+vec2(0.,e.y)).r-texture2D(aux,uv-vec2(0.,e.y)).r;float edge=clamp((abs(dx)+abs(dy))*1.5,0.,1.);float wet=smoothstep(.002,.04,a.r);float affinity=clamp(.15+rim*edge+grain*(1.-a.g),.05,1.);gl_FragColor=vec4(affinity,wet,a.g,1.);}`;
/** Four/eight face donor fractions. Every donor's total outgoing <=share,
 * receiver affinity drives accumulation; no local gain multiplier is used.
 * Opposite face fluxes cancel before RGBA8 quantization/saturation. */
const flux=head+`uniform sampler2D source,preference;uniform vec2 n;uniform float share;void main(){vec4 own=texture2D(source,uv),a=texture2D(preference,uv),result=own;for(int k=0;k<FACES;k++){vec2 d;if(k==0)d=vec2(1.,0.);else if(k==1)d=vec2(-1.,0.);else if(k==2)d=vec2(0.,1.);else if(k==3)d=vec2(0.,-1.);else if(k==4)d=vec2(1.,1.);else if(k==5)d=vec2(-1.,-1.);else if(k==6)d=vec2(1.,-1.);else d=vec2(-1.,1.);vec2 q=uv+d/n;if(q.x<0.||q.y<0.||q.x>1.||q.y>1.)continue;vec4 b=texture2D(preference,q),other=texture2D(source,q);float gate=min(a.g,b.g)*share/float(FACES);result-=gate*b.r*own;result+=gate*a.r*other;}result=clamp(result,0.,1.);gl_FragColor=vec4(min(result.rgb,vec3(result.a)),result.a);}`;
/** Reconstruct ONLY high-frequency original detail; coarse changes remain.
 * This bounded high-pass injection is NOT a conservation proof: clipping and
 * spatial fade can alter mass, which the harness must measure explicitly. */
const reconstruct=head+`uniform sampler2D source,initial,original,aux;uniform vec2 n;uniform float detail;${sample}void main(){vec4 old=texture2D(original,uv),a=texture2D(aux,uv);if(a.r<=.002){gl_FragColor=old;return;}vec4 low=bilerp(source,uv,n),start=bilerp(initial,uv,n);float body=smoothstep(.01,.35,a.r);vec4 delta=(old-start)*detail*(.35+.65*body);vec4 c=clamp(low+delta,0.,1.);gl_FragColor=vec4(min(c.rgb,vec3(c.a)),c.a);}`;
export function create(gl:WebGLRenderingContext,size:number,config:Record<string,number>):GLAlgorithm{
 if(size!==1024)throw Error('wet-boundary/detail requires1024')
 const n=resolution(config),steps=Math.floor(number(config,'steps',8,1,24)),fullSteps=Math.floor(number(config,'fullSteps',2,0,4)),rim=number(config,'rim',.7,0,1),grain=number(config,'grain',.35,0,.8),detail=number(config,'detail',.65,0,1),share=number(config,'share',.4,0,.75),gpu=new GPU(gl)
 try {
  const initial=gpu.target(n),aux=gpu.target(n),lowPref=gpu.target(n),low=[gpu.target(n),gpu.target(n)],original=gpu.target(size),fullAux=gpu.target(size),fullPref=gpu.target(size),full=[gpu.target(size),gpu.target(size)]
  const cp=gpu.program(copy,['source']),pref=gpu.program(preference,['aux','n','rim','grain']),lowFlux=gpu.program('#define FACES 8\n'+flux,['source','preference','n','share']),fullFlux=gpu.program('#define FACES 4\n'+flux,['source','preference','n','share']),restore=gpu.program(reconstruct,['source','initial','original','aux','n','detail'])
  let ready=false
  return {
   metadata:{family:'original wet-boundary donor redistribution + soft detail + full-resolution terrain granulation',resolution:n,passes:4+steps+fullSteps,conservation:'paired donor flux before UNORM8; high-pass reconstruction/clipping NOT mass-certified',extraFullResolutionPasses:2+fullSteps},
   upload(input:AlgorithmInput){
    ready=false
    const r=reduce(input,n),a=new Uint8Array(size*size*4)
    for(let i=0;i<size*size;i++){a[i*4]=input.water[i];a[i*4+1]=input.paper[i];a[i*4+3]=255}
    gpu.upload(initial,r.rgba);gpu.upload(aux,r.aux);gpu.upload(original,input.rgba);gpu.upload(fullAux,a);ready=true
   },
   run(){
    if(!ready)throw Error('upload first')
    return gpu.scope(()=>{
     gpu.draw(low[0],cp,{source:initial})
     gpu.draw(lowPref,pref,{aux},{n:[n,n],rim,grain:grain*.4})
     let li=0
     for(let i=0;i<steps;i++){gpu.draw(low[1-li],lowFlux,{source:low[li],preference:lowPref},{n:[n,n],share});li=1-li}
     // The same real full-resolution paper terrain, not averaged lowresgrain.
     gpu.draw(fullPref,pref,{aux:fullAux},{n:[size,size],rim:rim*.3,grain})
     gpu.draw(full[0],restore,{source:low[li],initial,original,aux:fullAux},{n:[n,n],detail})
     let fi=0
     for(let i=0;i<fullSteps;i++){gpu.draw(full[1-fi],fullFlux,{source:full[fi],preference:fullPref},{n:[size,size],share:share*.75});fi=1-fi}
     return full[fi]
    })
   },
   destroy:()=>gpu.destroy(),
  }
 }catch(e){gpu.destroy();throw e}
}
export const definitions:GLDefinition[]=[{id:'alternative-wet-boundary-detail',label:'Donor wet-boundary rim + retained detail + real paper grain',create,configs:[{resolution:256,steps:8,rim:.7,grain:.35,detail:.65,fullSteps:2,share:.4},{resolution:256,steps:10,rim:.85,grain:.6,detail:.8,fullSteps:3,share:.35}]}]
