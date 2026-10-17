import type {AlgorithmInput,GLAlgorithm,GLDefinition} from '../protocol'
import {GPU,head,number} from './gpu'
const h=head+'precision highp sampler2D;'
const seedWater=h+`uniform sampler2D aux;void main(){float q=floor(texture2D(aux,uv).r*65535./4.+.5);gl_FragColor=vec4(floor(q/256.),mod(q,256.),0.,255.)/255.;}`
const waterMove=h+`uniform sampler2D water,aux;uniform vec2 n;uniform float stride,dt,terrain;float wet(float w){return smoothstep(.01,.15,w);}vec4 bytes(sampler2D source,vec2 q){return floor(texture2D(source,q)*255.+.5);}float waterAt(vec2 q){vec2 b=bytes(water,q).rg;return dot(b,vec2(256.,1.))*4./65535.;}float gateAt(vec2 a,vec2 d){float g=1.;for(int j=0;j<9;j++){if(float(j)>stride)break;g=min(g,wet(texture2D(aux,a+d*float(j)/n).r));}return g;}float flux(vec2 a,vec2 b,vec2 d){float wa=waterAt(a),wb=waterAt(b);float dh=wa-wb+terrain*(texture2D(aux,a).g-texture2D(aux,b).g);float k=dt*gateAt(a,d);k*=min(1.,min(wa/(5.*dt*max(dh,0.)+.0000001),wb/(5.*dt*max(-dh,0.)+.0000001)));return k*dh;}void main(){float w=waterAt(uv);for(int k=0;k<4;k++){vec2 d=k==0?vec2(1.,0.):k==1?vec2(-1.,0.):k==2?vec2(0.,1.):vec2(0.,-1.);vec2 q=uv+d*stride/n;if(q.x<0.||q.y<0.||q.x>1.||q.y>1.)continue;w-=flux(uv,q,d);}float code=floor(clamp(w,0.,4.)*65535./4.+.5);gl_FragColor=vec4(floor(code/256.),mod(code,256.),0.,255.)/255.;}`
const pigmentMove=h+`uniform sampler2D water,aux;uniform vec2 n;uniform float stride,dt,terrain;uniform sampler2D mobile;float wet(float w){return smoothstep(.01,.15,w);}vec4 bytes(sampler2D source,vec2 q){return floor(texture2D(source,q)*255.+.5);}float waterAt(vec2 q){vec2 b=bytes(water,q).rg;return dot(b,vec2(256.,1.))*4./65535.;}float gateAt(vec2 a,vec2 d){float g=1.;for(int j=0;j<9;j++){if(float(j)>stride)break;g=min(g,wet(texture2D(aux,a+d*float(j)/n).r));}return g;}float flux(vec2 a,vec2 b,vec2 d){float wa=waterAt(a),wb=waterAt(b);float dh=wa-wb+terrain*(texture2D(aux,a).g-texture2D(aux,b).g);float k=dt*gateAt(a,d);k*=min(1.,min(wa/(5.*dt*max(dh,0.)+.0000001),wb/(5.*dt*max(-dh,0.)+.0000001)));return k*dh;}void main(){vec4 own=texture2D(mobile,uv),result=own;float wi=waterAt(uv);for(int k=0;k<4;k++){vec2 d=k==0?vec2(1.,0.):k==1?vec2(-1.,0.):k==2?vec2(0.,1.):vec2(0.,-1.);vec2 q=uv+d*stride/n;if(q.x<0.||q.y<0.||q.x>1.||q.y>1.)continue;float f=flux(uv,q,d),wj=waterAt(q);vec4 other=texture2D(mobile,q);result-=own*(max(f,0.)/max(wi,.0000001));result+=other*(max(-f,0.)/max(wj,.0000001));result+=.01*gateAt(uv,d)*(other-own);}gl_FragColor=clamp(result,0.,1.);}`
const paperFns=`float wet(float w){return smoothstep(.01,.15,w);}float receiver(float height){return .12+.88*(1.-smoothstep(.25,.75,height));}vec4 bytes(sampler2D source,vec2 q){return floor(texture2D(source,q)*255.+.5);}`
const split=h+`uniform sampler2D original,aux;uniform float mobileFraction,part;${paperFns}void main(){vec4 old=bytes(original,uv);float water=bytes(aux,uv).r/255.;vec4 moving=floor(old*(mobileFraction*wet(water))+.5);gl_FragColor=(part>.5?moving:old-moving)/255.;}`
const depositFns=`${paperFns}vec4 deposited(vec4 moving,vec4 terrain,float adsorption){float water=terrain.r/255.,height=terrain.g/255.;float amount=adsorption*(.2+.8*receiver(height))*(1.-.15*water);return floor(moving*amount+.5);}`
const depositFixed=h+`uniform sampler2D settled,mobile,aux;uniform float adsorption;${depositFns}void main(){vec4 moving=bytes(mobile,uv),terrain=bytes(aux,uv),stuck=bytes(settled,uv);vec4 added=deposited(moving,terrain,adsorption);gl_FragColor=min(stuck+added,vec4(255.))/255.;}`
const depositMobile=h+`uniform sampler2D mobile,aux;uniform float adsorption;${depositFns}void main(){vec4 moving=bytes(mobile,uv),terrain=bytes(aux,uv);gl_FragColor=(moving-deposited(moving,terrain,adsorption))/255.;}`
const finish=h+`uniform sampler2D settled,mobile,original,aux;${paperFns}void main(){if(bytes(aux,uv).r==0.){gl_FragColor=bytes(original,uv)/255.;return;}vec4 c=min(bytes(settled,uv)+bytes(mobile,uv),vec4(255.))/255.;gl_FragColor=vec4(min(c.rgb,vec3(c.a)),c.a);}`
export function create(gl:WebGLRenderingContext,size:number,config:Record<string,number>):GLAlgorithm{
 if(size!==1024)throw Error('porous transport requires1024')
 const steps=Math.floor(number(config,'steps',8,1,12)),mobileFraction=number(config,'mobile',.4,0,.85),adsorption=number(config,'adsorption',.16,0,.4),coarse=number(config,'coarse',4,1,8)
 if(!Number.isInteger(coarse))throw Error('coarse stride must be integer')
 const dt=number(config,'dt',.16,.01,.2),terrain=number(config,'terrain',.18,0,.25)
 const gpu=new GPU(gl)
 try {
  const original=gpu.target(size),aux=gpu.target(size),mobile=[gpu.target(size),gpu.target(size)],fixed=[gpu.target(size),gpu.target(size)],out=gpu.target(size),water=[gpu.target(size),gpu.target(size)]
  const seed=gpu.program(split,['original','aux','mobileFraction','part']),move=gpu.program(pigmentMove,['mobile','water','aux','n','stride','dt','terrain']),waterSeed=gpu.program(seedWater,['aux']),waterStep=gpu.program(waterMove,['water','aux','n','stride','dt','terrain']),immobilize=gpu.program(depositFixed,['settled','mobile','aux','adsorption']),remainder=gpu.program(depositMobile,['mobile','aux','adsorption']),sum=gpu.program(finish,['settled','mobile','original','aux'])
  let packed:Uint8Array|undefined=new Uint8Array(size*size*4),ready=false
  return {
   metadata:{family:'paired porous water flux + donor-cell pigment + adsorption',resolution:size,passes:4+4*steps,waterEncoding:'RG16 range0..4; nearest rounded, step error<=2/65535',waterCapacity:4,idealWaterBound:1+terrain,conservation:'float paired flows conserve water/mobile mass; RG16/RGBA8 rounding and pigment saturation do not',pigmentCapacity:1},
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
     gpu.draw(fixed[0],seed,{original,aux},{mobileFraction,part:0})
     gpu.draw(mobile[0],seed,{original,aux},{mobileFraction,part:1})
     gpu.draw(water[0],waterSeed,{aux})
     let mi=0,fi=0,wi=0
     for(let i=0;i<steps;i++){
      const stride=i===0?coarse:i===1?Math.max(1,Math.floor(coarse*.5)):1
      gpu.draw(mobile[1-mi],move,{mobile:mobile[mi],aux,water:water[wi]},{n:[size,size],stride,dt,terrain});mi=1-mi
      gpu.draw(water[1-wi],waterStep,{water:water[wi],aux},{n:[size,size],stride,dt,terrain});wi=1-wi
      gpu.draw(fixed[1-fi],immobilize,{settled:fixed[fi],mobile:mobile[mi],aux},{adsorption});fi=1-fi
      gpu.draw(mobile[1-mi],remainder,{mobile:mobile[mi],aux},{adsorption});mi=1-mi
     }
     gpu.draw(out,sum,{settled:fixed[fi],mobile:mobile[mi],original,aux})
     return out
    })
   },
   destroy(){ready=false;packed=undefined;gpu.destroy()},
  }
 }catch(e){gpu.destroy();throw e}
}
export const definitions:GLDefinition[]=[{id:'alternative-porous-water-transport',label:'Evolving porous water + donor-cell pigment and adsorption',create,configs:[{steps:8,mobile:.6,adsorption:.1,coarse:4,dt:.16,terrain:.18},{steps:10,mobile:.8,adsorption:.07,coarse:2,dt:.2,terrain:.25}]}]
