import {reviewedFixedWet} from './fixed-wet-existing'
import type {AlgorithmInput,GLAlgorithm,GLDefinition} from '../protocol'
import {GPU,head,number} from './gpu'
import {receiverWeights} from './finite-volume-support'
export function macroSchedule(program=0){if(program!==0&&program!==1)throw Error('macro program');const one=program===0?[16,8,4,2,1]:[32,16,8,4,2,1];return [...one,...one]}
const h=head+'precision highp sampler2D;'
/** Terrain determines receiver affinity and adsorption; water only gates the
 * thin/dry domain. No water-gradient edge/rim signal appears in this model. */
const paperFns=`float wet(float w){return smoothstep(.01,.15,w);}float receiver(float height){return .12+.88*(1.-smoothstep(.25,.75,height));}vec4 bytes(sampler2D source,vec2 q){return floor(texture2D(source,q)*255.+.5);}`
const split=h+`uniform sampler2D original,aux;uniform float mobileFraction,part;${paperFns}void main(){vec4 old=bytes(original,uv);float water=bytes(aux,uv).r/255.;vec4 moving=floor(old*(mobileFraction*wet(water))+.5);gl_FragColor=(part>.5?moving:old-moving)/255.;}`
const packing=`vec4 encodePair(vec2 c){vec2 q=floor(clamp(c,0.,1.)*65535.+.5);return vec4(floor(q.x/256.),mod(q.x,256.),floor(q.y/256.),mod(q.y,256.))/255.;}vec2 decodePair(vec4 c){vec4 q=floor(c*255.+.5);return vec2(dot(q.rg,vec2(256.,1.)),dot(q.ba,vec2(256.,1.)))/65535.;}`
const average=h+`uniform sampler2D mobile;uniform float part;${packing}void main(){vec2 base=floor(uv*256.)*4.;vec4 sum=vec4(0.);for(int y=0;y<4;y++)for(int x=0;x<4;x++)sum+=texture2D(mobile,(base+vec2(float(x),float(y))+.5)/1024.);vec4 c=sum/16.;gl_FragColor=encodePair(part<.5?c.rg:c.ba);}`
const faceFns=`float face(vec2 p,vec2 d){float g=1.;for(int j=0;j<33;j++){if(float(j)>stride)break;vec2 q=p+d*float(j)/256.;if(q.x<0.||q.y<0.||q.x>1.||q.y>1.)return 0.;g=min(g,texture2D(domain,q).r);}return g*rate*.25;}`
const incoming=h+`uniform sampler2D coarse0,coarse1,domain;uniform float stride,rate,part;${packing}${faceFns}void main(){vec4 sum=vec4(0.);for(int k=0;k<4;k++){vec2 d=k==0?vec2(1.,0.):k==1?vec2(-1.,0.):k==2?vec2(0.,1.):vec2(0.,-1.);vec2 q=uv+d*stride/256.;sum+=face(uv,d)*vec4(decodePair(texture2D(coarse0,q)),decodePair(texture2D(coarse1,q)));}gl_FragColor=encodePair(part<.5?sum.rg:sum.ba);}`
const exchange=h+`uniform sampler2D mobile,inflow0,inflow1,domain,aux;uniform float stride,rate;${packing}${faceFns}void main(){vec2 q=(floor(uv*256.)+.5)/256.;float outgoing=0.;for(int k=0;k<4;k++){vec2 d=k==0?vec2(1.,0.):k==1?vec2(-1.,0.):k==2?vec2(0.,1.):vec2(0.,-1.);outgoing+=face(q,d);}vec2 code=floor(texture2D(aux,uv).ba*255.+.5);float receiver=dot(code,vec2(256.,1.))/16384.;vec4 result=texture2D(mobile,uv)*(1.-outgoing)+vec4(decodePair(texture2D(inflow0,q)),decodePair(texture2D(inflow1,q)))*receiver;gl_FragColor=clamp(result,0.,1.);}`
const depositFns=`${paperFns}vec4 deposited(vec4 moving,vec4 terrain,float adsorption){float water=terrain.r/255.,height=terrain.g/255.;float amount=adsorption*(.2+.8*receiver(height))*(1.-.15*water);return floor(moving*amount+.5);}`
const depositFixed=h+`uniform sampler2D settled,mobile,aux;uniform float adsorption;${depositFns}void main(){vec4 moving=bytes(mobile,uv),terrain=bytes(aux,uv),stuck=bytes(settled,uv);vec4 added=deposited(moving,terrain,adsorption);gl_FragColor=min(stuck+added,vec4(255.))/255.;}`
const depositMobile=h+`uniform sampler2D mobile,aux;uniform float adsorption;${depositFns}void main(){vec4 moving=bytes(mobile,uv),terrain=bytes(aux,uv);gl_FragColor=(moving-deposited(moving,terrain,adsorption))/255.;}`
const finish=h+`uniform sampler2D settled,mobile,original,aux;${paperFns}void main(){if(bytes(aux,uv).r==0.){gl_FragColor=bytes(original,uv)/255.;return;}vec4 c=min(bytes(settled,uv)+bytes(mobile,uv),vec4(255.))/255.;gl_FragColor=vec4(min(c.rgb,vec3(c.a)),c.a);}`
const fineDiffuse=h+`uniform sampler2D source,aux;uniform float share;void main(){vec4 own=texture2D(source,uv),result=own;float wi=texture2D(aux,uv).r;if(wi==0.){gl_FragColor=own;return;}for(int k=0;k<4;k++){vec2 d=k==0?vec2(1.,0.):k==1?vec2(-1.,0.):k==2?vec2(0.,1.):vec2(0.,-1.);vec2 q=uv+d/1024.;if(q.x<0.||q.y<0.||q.x>1.||q.y>1.)continue;float gate=texture2D(aux,q).r>0.?1.:0.;result+=share*.25*gate*(texture2D(source,q)-own);}gl_FragColor=result;}`
export function create(gl:WebGLRenderingContext,size:number,config:Record<string,number>):GLAlgorithm{
 if(size!==1024)throw Error('paper deposition requires1024')
 const schedule=macroSchedule(number(config,'program',0,0,1)),steps=schedule.length,mobileFraction=number(config,'mobile',.4,0,.85),share=number(config,'share',.65,0,.9),adsorption=number(config,'adsorption',.16,0,.4),coarse=number(config,'coarse',4,1,8)
 if(!Number.isInteger(coarse))throw Error('coarse stride must be integer')
 const paperGain=number(config,'paperGain',1,0,1),fineSmooth=number(config,'fineSmooth',0,0,2)
 if(!Number.isInteger(fineSmooth))throw Error('fineSmooth must be integer')
 const gpu=new GPU(gl)
 try {
  const original=gpu.target(size),aux=gpu.target(size),mobile=[gpu.target(size),gpu.target(size)],fixed=[gpu.target(size),gpu.target(size)],out=gpu.target(size),coarseColor=[gpu.target(256),gpu.target(256)],coarseIn=[gpu.target(256),gpu.target(256)],domain=gpu.target(256)
  const seed=gpu.program(split,['original','aux','mobileFraction','part']),move=gpu.program(exchange,['mobile','inflow0','inflow1','domain','aux','stride','rate']),averageProgram=gpu.program(average,['mobile','part']),incomingProgram=gpu.program(incoming,['coarse0','coarse1','domain','stride','rate','part']),immobilize=gpu.program(depositFixed,['settled','mobile','aux','adsorption']),remainder=gpu.program(depositMobile,['mobile','aux','adsorption']),sum=gpu.program(finish,['settled','mobile','original','aux'])
  const smooth=fineSmooth?gpu.program(fineDiffuse,['source','aux','share']):undefined
  let packed:Uint8Array|undefined=new Uint8Array(size*size*4),ready=false
  return {
   metadata:{family:'macro-horizon multiscale conservative wet diffusion',physicalStridePx:schedule.map(x=>x*4),maxPathPixels:128,resolution:size,passes:3+7*steps+fineSmooth,paperGain,fineSmooth,conservation:'whole ideal float pipeline mass-conservative; GPU RGBA8 average/incoming/flow rounding and saturation NOT exact',fixedFraction:1-mobileFraction},
   upload(input:AlgorithmInput){
    ready=false
    if(!packed)throw Error('destroyed')
    if(input.size!==size||input.rgba.length!==size*size*4||input.water.length!==size*size||input.paper.length!==size*size)throw Error('invalid input dimensions')
    const weights=receiverWeights(input.water,input.paper,paperGain)
    // Symmetric variable-wet conductivity: conservative min over the same16rawcells.
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){let minimum=255;for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++)minimum=Math.min(minimum,input.water[(4*y+dy)*1024+4*x+dx]);weights.domain[(y*256+x)*4]=minimum}
    for(let i=0;i<size*size;i++){packed[i*4]=input.water[i];packed[i*4+1]=input.paper[i];packed[i*4+2]=weights.codes[i]>>>8;packed[i*4+3]=weights.codes[i]&255}
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
      const stride=schedule[i]
      for(let part=0;part<2;part++)gpu.draw(coarseColor[part],averageProgram,{mobile:mobile[mi]},{part})
      for(let part=0;part<2;part++)gpu.draw(coarseIn[part],incomingProgram,{coarse0:coarseColor[0],coarse1:coarseColor[1],domain},{stride,rate:share,part})
      gpu.draw(mobile[1-mi],move,{mobile:mobile[mi],inflow0:coarseIn[0],inflow1:coarseIn[1],domain,aux},{stride,rate:share});mi=1-mi
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
export const definitions:GLDefinition[]=[{id:'macro-multiscale-exchange',label:'Macro-scale wet-conductivity exchange (64/128px paths)',create,createFixedInitialWet:reviewedFixedWet(create,c=>({size:1024,grid:256,...((c.fineSmooth??0)>0?{fineModel:'existing raw cardinal wet smoothing',fineSteps:c.fineSmooth}:{}),geometrySource:'raw4x4 minimum water; cardinal face visits every coarse cell for stride<=32; fineDiffuse uses raw cardinal wet gates',partialWet:'coarse partial cells blocked; only optional fineSmooth permits local partial motion; low-water smoothstep can freeze faint wet pixels',limitations:'Coarse boundary mobility limited; fineSmooth<=2 is local, NOT long-range thin-line transport or art acceptance',fixedBulkShaderSources:[split,exchange,average,incoming,depositFixed,depositMobile,finish,...((c.fineSmooth??0)>0?[fineDiffuse]:[])]})),configs:[{program:0,mobile:.8,share:.75,adsorption:.025,paperGain:.15,fineSmooth:1},{program:1,mobile:.8,share:.75,adsorption:.02,paperGain:.15,fineSmooth:1}]}]
