import type {AlgorithmInput,GLAlgorithm,GLDefinition} from '../protocol'
import {GPU,head,number} from './gpu'
import {receiverWeights} from './finite-volume-support'
import {pathDistances,denseKernel} from './macro2-paths'
const h=head+'precision highp sampler2D;'
/** Terrain determines receiver affinity and adsorption; water only gates the
 * thin/dry domain. No water-gradient edge/rim signal appears in this model. */
const paperFns=`float wet(float w){return smoothstep(.01,.15,w);}float receiver(float height){return .12+.88*(1.-smoothstep(.25,.75,height));}vec4 bytes(sampler2D source,vec2 q){return floor(texture2D(source,q)*255.+.5);}`
const split=h+`uniform sampler2D original,aux;uniform float mobileFraction,part;${paperFns}void main(){vec4 old=bytes(original,uv);float water=bytes(aux,uv).r/255.;vec4 moving=floor(old*(mobileFraction*wet(water))+.5);gl_FragColor=(part>.5?moving:old-moving)/255.;}`
const packing=`vec4 encodePair(vec2 c){vec2 q=floor(clamp(c,0.,1.)*65535.+.5);return vec4(floor(q.x/256.),mod(q.x,256.),floor(q.y/256.),mod(q.y,256.))/255.;}vec2 decodePair(vec4 c){vec4 q=floor(c*255.+.5);return vec2(dot(q.rg,vec2(256.,1.)),dot(q.ba,vec2(256.,1.)))/65535.;}`
const average=h+`uniform sampler2D mobile;uniform float part;${packing}void main(){vec2 base=floor(uv*256.)*4.;vec4 sum=vec4(0.);for(int y=0;y<4;y++)for(int x=0;x<4;x++)sum+=texture2D(mobile,(base+vec2(float(x),float(y))+.5)/1024.);vec4 c=sum/16.;gl_FragColor=encodePair(part<.5?c.rg:c.ba);}`
function denseSource(radius:number,sigma:number){
 const kernel=denseKernel(radius,sigma),normalizer=kernel[0].weight/Math.exp(-.5/(sigma*sigma))
 return h+`uniform sampler2D coarse0,coarse1,domain,axial,diagonal;uniform float part;${packing}void main(){vec4 sum=vec4(0.);float outgoing=0.;float ownWet=texture2D(domain,uv).r;vec4 card=floor(texture2D(axial,uv)*255.+.5),diag=floor(texture2D(diagonal,uv)*255.+.5);for(int k=0;k<8;k++){vec2 d=k==0?vec2(1.,0.):k==1?vec2(-1.,0.):k==2?vec2(0.,1.):k==3?vec2(0.,-1.):k==4?vec2(1.,1.):k==5?vec2(-1.,1.):k==6?vec2(1.,-1.):vec2(-1.,-1.);float distance=k==0?card.r:k==1?card.g:k==2?card.b:k==3?card.a:k==4?diag.r:k==5?diag.g:k==6?diag.b:diag.a;float exponential=1.,ratio=k<4?${Math.exp(-.5/(sigma*sigma)).toPrecision(14)}:${Math.exp(-1/(sigma*sigma)).toPrecision(14)},decay=k<4?${Math.exp(-1/(sigma*sigma)).toPrecision(14)}:${Math.exp(-2/(sigma*sigma)).toPrecision(14)};for(int j=1;j<=${radius};j++){exponential*=ratio;ratio*=decay;if(float(j)>distance||(k>=4&&j>${Math.floor(radius/Math.SQRT2)}))continue;vec2 q=uv+d*float(j)/256.;float w=float(j)*exponential*(k<4?1.:2.)*${normalizer.toPrecision(14)}*min(ownWet,texture2D(domain,q).r);outgoing+=w;if(part<1.5)sum+=w*vec4(decodePair(texture2D(coarse0,q)),decodePair(texture2D(coarse1,q)));}}gl_FragColor=part>1.5?encodePair(vec2(outgoing,0.)):encodePair(part<.5?sum.rg:sum.ba);}`
}
const exchange=h+`uniform sampler2D mobile,inflow0,inflow1,outflow,aux;${packing}void main(){vec2 q=(floor(uv*256.)+.5)/256.;float outgoing=decodePair(texture2D(outflow,q)).r;vec2 code=floor(texture2D(aux,uv).ba*255.+.5);float receiver=dot(code,vec2(256.,1.))/16384.;vec4 result=texture2D(mobile,uv)*(1.-outgoing)+vec4(decodePair(texture2D(inflow0,q)),decodePair(texture2D(inflow1,q)))*receiver;gl_FragColor=clamp(result,0.,1.);}`
const depositFns=`${paperFns}vec4 deposited(vec4 moving,vec4 terrain,float adsorption){float water=terrain.r/255.,height=terrain.g/255.;float amount=adsorption*(.2+.8*receiver(height))*(1.-.15*water);return floor(moving*amount+.5);}`
const depositFixed=h+`uniform sampler2D settled,mobile,aux;uniform float adsorption;${depositFns}void main(){vec4 moving=bytes(mobile,uv),terrain=bytes(aux,uv),stuck=bytes(settled,uv);vec4 added=deposited(moving,terrain,adsorption);gl_FragColor=min(stuck+added,vec4(255.))/255.;}`
const depositMobile=h+`uniform sampler2D mobile,aux;uniform float adsorption;${depositFns}void main(){vec4 moving=bytes(mobile,uv),terrain=bytes(aux,uv);gl_FragColor=(moving-deposited(moving,terrain,adsorption))/255.;}`
const finish=h+`uniform sampler2D settled,mobile,original,aux;${paperFns}void main(){if(bytes(aux,uv).r==0.){gl_FragColor=bytes(original,uv)/255.;return;}vec4 c=min(bytes(settled,uv)+bytes(mobile,uv),vec4(255.))/255.;gl_FragColor=vec4(min(c.rgb,vec3(c.a)),c.a);}`
const fineDiffuse=h+`uniform sampler2D source,aux;uniform float share;void main(){vec4 own=texture2D(source,uv),result=own;float wi=texture2D(aux,uv).r;if(wi==0.){gl_FragColor=own;return;}for(int k=0;k<4;k++){vec2 d=k==0?vec2(1.,0.):k==1?vec2(-1.,0.):k==2?vec2(0.,1.):vec2(0.,-1.);vec2 q=uv+d/1024.;if(q.x<0.||q.y<0.||q.x>1.||q.y>1.)continue;float gate=texture2D(aux,q).r>0.?1.:0.;result+=share*.25*gate*(texture2D(source,q)-own);}gl_FragColor=result;}`
export function create(gl:WebGLRenderingContext,size:number,config:Record<string,number>):GLAlgorithm{
 if(size!==1024)throw Error('paper deposition requires1024')
 const steps=Math.floor(number(config,'steps',3,1,5)),mobileFraction=number(config,'mobile',.4,0,.85),adsorption=number(config,'adsorption',.16,0,.4)
 const paperGain=number(config,'paperGain',1,0,1),fineSmooth=number(config,'fineSmooth',0,0,2)
 if(!Number.isInteger(fineSmooth))throw Error('fineSmooth must be integer')
 const radius=number(config,'radius',24,1,32),sigma=number(config,'sigma',12,1,32)
 if(!Number.isInteger(radius))throw Error('radius integer')
 const gpu=new GPU(gl)
 try {
  const original=gpu.target(size),aux=gpu.target(size),mobile=[gpu.target(size),gpu.target(size)],fixed=[gpu.target(size),gpu.target(size)],out=gpu.target(size),coarseColor=[gpu.target(256),gpu.target(256)],coarseIn=[gpu.target(256),gpu.target(256),gpu.target(256)],domain=gpu.target(256),paths=[gpu.target(256),gpu.target(256)]
  const seed=gpu.program(split,['original','aux','mobileFraction','part']),move=gpu.program(exchange,['mobile','inflow0','inflow1','outflow','aux']),averageProgram=gpu.program(average,['mobile','part']),incomingProgram=gpu.program(denseSource(radius,sigma),['coarse0','coarse1','domain','axial','diagonal','part']),immobilize=gpu.program(depositFixed,['settled','mobile','aux','adsorption']),remainder=gpu.program(depositMobile,['mobile','aux','adsorption']),sum=gpu.program(finish,['settled','mobile','original','aux'])
  const smooth=fineSmooth?gpu.program(fineDiffuse,['source','aux','share']):undefined
  let packed:Uint8Array|undefined=new Uint8Array(size*size*4),ready=false
  return {
   metadata:{family:'dense radial conservative wet-path coarse kernel + fine detail',radiusPx:radius*4,sigmaPx:sigma*4,donorCount:denseKernel(radius,sigma).length,resolution:size,passes:3+8*steps+fineSmooth,paperGain,fineSmooth,conservation:'whole ideal float pipeline mass-conservative; GPU RGBA8 average/incoming/flow rounding and saturation NOT exact',fixedFraction:1-mobileFraction},
   upload(input:AlgorithmInput){
    ready=false
    if(!packed)throw Error('destroyed')
    if(input.size!==size||input.rgba.length!==size*size*4||input.water.length!==size*size||input.paper.length!==size*size)throw Error('invalid input dimensions')
    const weights=receiverWeights(input.water,input.paper,paperGain)
    for(let i=0;i<size*size;i++){packed[i*4]=input.water[i];packed[i*4+1]=input.paper[i];packed[i*4+2]=weights.codes[i]>>>8;packed[i*4+3]=weights.codes[i]&255}
    const wet=new Uint8Array(256**2)
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){let minimum=255;for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++)minimum=Math.min(minimum,input.water[(4*y+dy)*1024+4*x+dx]);wet[y*256+x]=minimum;weights.domain[(y*256+x)*4]=minimum}
    const distance=pathDistances(wet,256);gpu.upload(paths[0],distance.axial);gpu.upload(paths[1],distance.diagonal)
    gpu.upload(domain,weights.domain)
    gpu.upload(original,input.rgba);gpu.upload(aux,packed);ready=true
   },
   run(){
    if(!ready)throw Error('upload first')
    return gpu.scope(()=>{
     gpu.draw(fixed[0],seed,{original,aux},{mobileFraction,part:0})
     gpu.draw(mobile[0],seed,{original,aux},{mobileFraction,part:1})
     let mi=0,fi=0
     for(let i=0;i<steps;i++){
      for(let part=0;part<2;part++)gpu.draw(coarseColor[part],averageProgram,{mobile:mobile[mi]},{part})
      for(let part=0;part<3;part++)gpu.draw(coarseIn[part],incomingProgram,{coarse0:coarseColor[0],coarse1:coarseColor[1],domain,axial:paths[0],diagonal:paths[1]},{part})
      gpu.draw(mobile[1-mi],move,{mobile:mobile[mi],inflow0:coarseIn[0],inflow1:coarseIn[1],outflow:coarseIn[2],aux});mi=1-mi
      gpu.draw(fixed[1-fi],immobilize,{settled:fixed[fi],mobile:mobile[mi],aux},{adsorption});fi=1-fi
      gpu.draw(mobile[1-mi],remainder,{mobile:mobile[mi],aux},{adsorption});mi=1-mi
     }
     gpu.draw(out,sum,{settled:fixed[fi],mobile:mobile[mi],original,aux})
     let result=out
     for(let i=0;i<fineSmooth;i++){const next=i%2===0?mobile[0]:out;gpu.draw(next,smooth!,{source:result,aux},{share:.8});result=next}
     return result
    })
   },
   destroy(){ready=false;packed=undefined;gpu.destroy()},
  }
 }catch(e){gpu.destroy();throw e}
}
export const definitions:GLDefinition[]=[{id:'macro2-dense-wetpath-exchange',label:'Dense radial wet-path transport with conservative fine detail',create,configs:[{steps:3,mobile:.8,adsorption:.025,paperGain:.1,fineSmooth:2,radius:24,sigma:12},{steps:3,mobile:.8,adsorption:.02,paperGain:0,fineSmooth:2,radius:32,sigma:16}]}]
