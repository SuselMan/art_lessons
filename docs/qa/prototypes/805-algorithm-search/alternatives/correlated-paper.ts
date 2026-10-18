import {fixedWetOption} from './fixed-wet-gl-core'
import {guardRawWetCorners} from './fixed-wet-raw-corners'
// Separate quality iteration; v8 paper-deposition.ts and its definitions remain unchanged.
import type {AlgorithmInput,GLAlgorithm,GLDefinition} from '../protocol'
import {GPU,head,number} from './gpu'
const h=head+'precision highp sampler2D;'
/** Terrain determines receiver affinity and adsorption; water only gates the
 * thin/dry domain. No water-gradient edge/rim signal appears in this model. */
const paperFns=`float wet(float w){return smoothstep(.01,.15,w);}float receiver(float height){return .12+.88*(1.-smoothstep(.25,.75,height));}vec4 bytes(sampler2D source,vec2 q){return floor(texture2D(source,q)*255.+.5);}`
const split=h+`uniform sampler2D original,aux;uniform float mobileFraction,part;${paperFns}void main(){vec4 old=bytes(original,uv);float water=bytes(aux,uv).r/255.;vec4 moving=floor(old*(mobileFraction*wet(water))+.5);gl_FragColor=(part>.5?moving:old-moving)/255.;}`
const flow=h+`uniform sampler2D mobile,aux;uniform vec2 n;uniform float share,stride,paperBias;${paperFns}void main(){vec4 own=bytes(mobile,uv)/255.,a=bytes(aux,uv)/255.,result=own;float wi=wet(a.r),ai=mix(1.,receiver(a.g),paperBias);for(int k=0;k<8;k++){vec2 d;if(k==0)d=vec2(1.,0.);else if(k==1)d=vec2(-1.,0.);else if(k==2)d=vec2(0.,1.);else if(k==3)d=vec2(0.,-1.);else if(k==4)d=vec2(1.,1.);else if(k==5)d=vec2(-1.,-1.);else if(k==6)d=vec2(1.,-1.);else d=vec2(-1.,1.);vec2 q=uv+d*stride/n;if(q.x<0.||q.y<0.||q.x>1.||q.y>1.)continue;vec4 b=bytes(aux,q)/255.,other=bytes(mobile,q)/255.;float gate=min(wi,wet(b.r));for(int j=1;j<8;j++){if(float(j)>=stride)break;float wm=floor(texture2D(aux,uv+d*float(j)/n).r*255.+.5)/255.;gate=min(gate,wet(wm));}gate*=share*.125;float aj=mix(1.,receiver(b.g),paperBias);result-=gate*aj*own;result+=gate*ai*other;}result=clamp(result,0.,1.);gl_FragColor=vec4(min(result.rgb,vec3(result.a)),result.a);}`
const depositFns=`${paperFns}vec4 deposited(vec4 moving,vec4 terrain,float adsorption){float water=terrain.r/255.,height=terrain.g/255.;float amount=adsorption*(.2+.8*receiver(height))*(1.-.15*water);return floor(moving*amount+.5);}`
const depositFixed=h+`uniform sampler2D settled,mobile,aux;uniform float adsorption;${depositFns}void main(){vec4 moving=bytes(mobile,uv),terrain=bytes(aux,uv),stuck=bytes(settled,uv);vec4 added=deposited(moving,terrain,adsorption);gl_FragColor=min(stuck+added,vec4(255.))/255.;}`
const depositMobile=h+`uniform sampler2D mobile,aux;uniform float adsorption;${depositFns}void main(){vec4 moving=bytes(mobile,uv),terrain=bytes(aux,uv);gl_FragColor=(moving-deposited(moving,terrain,adsorption))/255.;}`
const finish=h+`uniform sampler2D settled,mobile,original,aux;${paperFns}void main(){if(bytes(aux,uv).r==0.){gl_FragColor=bytes(original,uv)/255.;return;}vec4 c=min(bytes(settled,uv)+bytes(mobile,uv),vec4(255.))/255.;gl_FragColor=vec4(min(c.rgb,vec3(c.a)),c.a);}`
/** Contiguous Gaussian taps avoid parity aliasing of strided sparse kernels.
 * Weights and GLSL are generated BEFORE timing. Raw water is never filtered. */
export function terrainKernel(scale:number):{offset:number;weight:number}[]{
 if(!Number.isFinite(scale)||scale<1||scale>12)throw Error('terrain scale')
 const radius=Math.ceil(scale),sigma=Math.max(.75,scale*.5),taps=[]
 let total=0
 for(let i=-radius;i<=radius;i++){const weight=Math.exp(-.5*(i/sigma)**2);taps.push({offset:i,weight});total+=weight}
 return taps.map(tap=>({offset:tap.offset,weight:tap.weight/total}))
}
const terrainBlur=h+`uniform sampler2D source,raw;uniform vec2 n,axis;uniform float stage,micro,relief;void main(){float sum=0.;/* TERRAIN_SAMPLES */vec4 original=texture2D(raw,uv);float height=sum;if(stage>.5)height=mix(clamp(.5+(height-.5)*relief,0.,1.),original.g,micro);gl_FragColor=vec4(floor(original.r*255.+.5)/255.,height,original.g,1.);}`
export function create(gl:WebGLRenderingContext,size:number,config:Record<string,number>):GLAlgorithm{
 if(size!==1024)throw Error('correlated paper deposition requires1024')
 const fixedPolicy=fixedWetOption(config),steps=Math.floor(number(config,'steps',4,1,8)),mobileFraction=number(config,'mobile',.4,0,.85),share=number(config,'share',.65,0,.9),adsorption=number(config,'adsorption',.16,0,.4),paperBias=number(config,'paperBias',.9,0,1),coarse=number(config,'coarse',4,1,8)
 const paperScale=number(config,'paperScale',5,1,12),micro=number(config,'micro',.15,0,.4),relief=number(config,'relief',3.5,1,8)
 if(!Number.isInteger(coarse))throw Error('coarse stride must be integer')
 const gpu=new GPU(gl)
 try {
  const flowSource=fixedPolicy?guardRawWetCorners(flow):flow
  const original=gpu.target(size),aux=gpu.target(size),mobile=[gpu.target(size),gpu.target(size)],fixed=[gpu.target(size),gpu.target(size)],out=gpu.target(size),terrainX=gpu.target(size),terrain=gpu.target(size)
  const seed=gpu.program(split,['original','aux','mobileFraction','part']),move=gpu.program(flowSource,['mobile','aux','n','share','stride','paperBias']),immobilize=gpu.program(depositFixed,['settled','mobile','aux','adsorption']),remainder=gpu.program(depositMobile,['mobile','aux','adsorption']),sum=gpu.program(finish,['settled','mobile','original','aux'])
  const taps=terrainKernel(paperScale),samples=taps.map(tap=>`sum+=${tap.weight.toPrecision(12)}*texture2D(source,uv+axis*${tap.offset.toFixed(1)}/n).g;`).join('')
  const blurSource=terrainBlur.replace('/* TERRAIN_SAMPLES */',samples),blur=gpu.program(blurSource,['source','raw','n','axis','stage','micro','relief'])
  let packed:Uint8Array|undefined=new Uint8Array(size*size*4),ready=false
  return {
   get metadata(){return{family:'correlated terrain affinity + fine microtexture + mobile pigment adsorption; raw water retained',resolution:size,passes:5+3*steps,paperScale,micro,relief,conservation:'symmetric donor flux before UNORM; rounded split/deposition partitions byte mass, except fixed saturation and flow quantization',fixedFraction:1-mobileFraction,...(fixedPolicy?{fixedInitialWet:true,policyRevision:1,policy:'initial raw water immutable; original operators with complete diagonal wet-path gate',geometrySource:'full raw-water centerline + both corner cells of each diagonal unit step; terrain filter retains raw water',size,grid:size,limitations:'Raw water smoothstep may immobilize very faint wet pigment; float/UNORM/saturation mass not certified',fixedBulkShaderSources:[split,flowSource,depositFixed,depositMobile,finish,blurSource]}:{})}},
   upload(input:AlgorithmInput){
    ready=false
    if(!packed)throw Error('destroyed')
    if(input.size!==size||input.rgba.length!==size*size*4||input.water.length!==size*size||input.paper.length!==size*size)throw Error('invalid input dimensions')
    for(let i=0;i<size*size;i++){packed[i*4]=input.water[i];packed[i*4+1]=input.paper[i];packed[i*4+3]=255}
    gpu.upload(original,input.rgba);gpu.upload(aux,packed);ready=true
   },
   run(){
    if(!ready)throw Error('upload first')
    return gpu.scope(()=>{
     gpu.draw(terrainX,blur,{source:aux,raw:aux},{n:[size,size],axis:[1,0],stage:0,micro,relief})
     gpu.draw(terrain,blur,{source:terrainX,raw:aux},{n:[size,size],axis:[0,1],stage:1,micro,relief})
     gpu.draw(fixed[0],seed,{original,aux:terrain},{mobileFraction,part:0})
     gpu.draw(mobile[0],seed,{original,aux:terrain},{mobileFraction,part:1})
     let mi=0,fi=0
     for(let i=0;i<steps;i++){
      const stride=i===0?coarse:i===1?Math.max(1,Math.floor(coarse*.5)):1
      gpu.draw(mobile[1-mi],move,{mobile:mobile[mi],aux:terrain},{n:[size,size],share,stride,paperBias});mi=1-mi
      gpu.draw(fixed[1-fi],immobilize,{settled:fixed[fi],mobile:mobile[mi],aux:terrain},{adsorption});fi=1-fi
      gpu.draw(mobile[1-mi],remainder,{mobile:mobile[mi],aux:terrain},{adsorption});mi=1-mi
     }
     gpu.draw(out,sum,{settled:fixed[fi],mobile:mobile[mi],original,aux})
     return out
    })
   },
   destroy(){ready=false;packed=undefined;gpu.destroy()},
  }
 }catch(e){gpu.destroy();throw e}
}
export const definitions:GLDefinition[]=[{id:'alternative-correlated-paper-deposition',label:'Correlated paper affinity, micrograin and gradual pigment deposition',create,createFixedInitialWet:(g,s,c)=>create(g,s,{...c,fixedInitialWet:1}),configs:[{steps:4,mobile:.6,share:.65,adsorption:.14,paperBias:.9,coarse:4,paperScale:3,micro:.12,relief:2.5},{steps:5,mobile:.75,share:.7,adsorption:.1,paperBias:1,coarse:6,paperScale:5,micro:.15,relief:3.5},{steps:5,mobile:.8,share:.7,adsorption:.09,paperBias:1,coarse:8,paperScale:8,micro:.1,relief:4.5}]}]
