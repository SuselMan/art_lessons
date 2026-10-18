import {fixedWetOption} from './fixed-wet-gl-core'
import {fixedWetShader,createFixedWetTail} from './fixed-wet-gl'
import type {AlgorithmInput,GLAlgorithm,GLDefinition} from '../protocol'
import {GPU,head,copy,finish,number,resolution,reduce} from './gpu'
import {enumeratePrograms,lower,programConfig,programFromConfig,type Program as SearchProgram} from './search'
const seed=head+'uniform sampler2D aux;void main(){vec4 a=texture2D(aux,uv);gl_FragColor=vec4(a.r>.02?0.:1.,a.g,a.r,1.);}';
const front=head+`uniform sampler2D source,aux;uniform vec2 n;uniform float stride,climb,budget;void main(){vec4 a=texture2D(source,uv),m=texture2D(aux,uv);float best=a.r;for(int k=0;k<8;k++){vec2 d;if(k==0)d=vec2(1.,0.);else if(k==1)d=vec2(-1.,0.);else if(k==2)d=vec2(0.,1.);else if(k==3)d=vec2(0.,-1.);else if(k==4)d=vec2(1.,1.);else if(k==5)d=vec2(-1.,-1.);else if(k==6)d=vec2(1.,-1.);else d=vec2(-1.,1.);vec2 q=uv+d*stride/n;if(q.x<0.||q.y<0.||q.x>1.||q.y>1.)continue;vec4 b=texture2D(aux,q);float price=length(d)*stride*(1.+climb*max(m.g-b.g,0.))*(1.+2.*(1.-m.r))/budget;best=min(best,texture2D(source,q).r+price);}gl_FragColor=vec4(clamp(best,0.,1.),a.gba);}`;
const transport=head+`uniform sampler2D source,domain,aux;uniform vec2 n;uniform float stride,rate;void main(){vec4 own=texture2D(source,uv),result=own;float wi=1.-smoothstep(.65,1.,texture2D(domain,uv).r);for(int k=0;k<8;k++){vec2 d;if(k==0)d=vec2(1.,0.);else if(k==1)d=vec2(-1.,0.);else if(k==2)d=vec2(0.,1.);else if(k==3)d=vec2(0.,-1.);else if(k==4)d=vec2(1.,1.);else if(k==5)d=vec2(-1.,-1.);else if(k==6)d=vec2(1.,-1.);else d=vec2(-1.,1.);vec2 q=uv+d*stride/n;if(q.x<0.||q.y<0.||q.x>1.||q.y>1.)continue;float wj=1.-smoothstep(.65,1.,texture2D(domain,q).r),w=min(wi,wj)*rate*.125;result+=w*(texture2D(source,q)-own);}gl_FragColor=clamp(result,0.,1.);}`;
const rimShader=head+`uniform sampler2D source,domain;uniform vec2 n;uniform float rim;void main(){vec4 c=texture2D(source,uv);vec2 e=1./n;float q=texture2D(domain,uv).r;float edge=abs(texture2D(domain,uv+vec2(e.x,0.)).r-texture2D(domain,uv-vec2(e.x,0.)).r)+abs(texture2D(domain,uv+vec2(0.,e.y)).r-texture2D(domain,uv-vec2(0.,e.y)).r);float band=smoothstep(.02,.15,q)*(1.-smoothstep(.45,.85,q));gl_FragColor=clamp(c*(1.+rim*band*min(edge*8.,1.)),0.,1.);}`;
function createInternal(gl:WebGLRenderingContext,size:number,config:Record<string,number>,program?:SearchProgram):GLAlgorithm {
 if(size!==1024)throw Error('artistic requires1024')
 const fixed=fixedWetOption(config),n=resolution(config),steps=Math.floor(number(config,'steps',8,1,32)),budget=number(config,'budget',16,2,64),climb=number(config,'climb',2,0,16),rate=number(config,'rate',.8,0,1),rim=number(config,'rim',.35,0,1),blend=number(config,'blend',.9,0,1),gpu=new GPU(gl)
 const operations=program?Object.freeze(lower(program).map(operation=>Object.freeze(operation))):undefined
 try {
  // Ordinary shader stays literal/unchanged. Search explicitly compiles the
  // chosen axial4/eight-neighbour operator before any measured execution.
  if(program&&front.split('k<8;k++').length!==2)throw Error('Front neighborhood source anchor changed')
  const ordinaryFrontShader=program?`#define FRONT_NEIGHBORS ${program.neighbors}\n`+front.replace('k<8;k++','k<FRONT_NEIGHBORS;k++'):front
  if(program&&ordinaryFrontShader===front)throw Error('Front neighborhood specialization failed')
  const tail=fixed?createFixedWetTail(gpu,size,n):undefined,frontShader=fixed?fixedWetShader('artistic','front',ordinaryFrontShader):ordinaryFrontShader,seedSource=fixed?fixedWetShader('artistic','seed',seed):seed,transportSource=fixed?fixedWetShader('artistic','transport',transport):transport,rimSource=fixed?fixedWetShader('artistic','rim',rimShader):rimShader
  const initial=gpu.target(n),aux=gpu.target(n),original=gpu.target(size),out=gpu.target(size),color=[gpu.target(n),gpu.target(n)],cost=[gpu.target(n),gpu.target(n)]
  const cp=gpu.program(copy,['source']),init=gpu.program(seedSource,['aux']),grow=gpu.program(frontShader,['source','aux','n','stride','climb','budget']),move=gpu.program(transportSource,['source','domain','aux','n','stride','rate']),rimP=gpu.program(rimSource,['source','domain','n','rim',...(fixed?['aux']:[])]),end=gpu.program(finish,['source','original','domain','n','blend','costDomain'])
  let ready=false
  return {
   get metadata(){return{family:'artistic dyadic costfront and pigment mixing, nonconservative rim',resolution:n,passes:(operations?.length??9+steps)+(fixed?13:0),...(program?{programDslVersion:1,programFingerprint:program.id,executedPasses:operations!.length,operationGraph:operations}:{}),...(tail?{...tail.metadata,fixedBulkShaderSources:[seedSource,frontShader,transportSource,rimSource]}:{})}},
   upload(input:AlgorithmInput){ready=false;const r=tail?tail.upload(input):reduce(input,n);gpu.upload(initial,r.rgba);gpu.upload(aux,r.aux);gpu.upload(original,input.rgba);ready=true},
   run(){
    if(!ready)throw Error('upload first')
    return gpu.scope(()=>{
     let di=0,ci=0
     const frontPass=(stride:number)=>{gpu.draw(cost[1-di],grow,{source:cost[di],aux},{n:[n,n],stride,climb,budget});di=1-di}
     const transportPass=(stride:number)=>{gpu.draw(color[1-ci],move,{source:color[ci],domain:cost[di],aux},{n:[n,n],stride,rate});ci=1-ci}
     const rimPass=()=>{gpu.draw(color[1-ci],rimP,{source:color[ci],domain:cost[di],...(fixed?{aux}:{})},{n:[n,n],rim});ci=1-ci}
     const publish=()=>tail?tail.run(out,color[ci],original,cost[di],blend,1):gpu.draw(out,end,{source:color[ci],original,domain:cost[di]},{n:[n,n],blend,costDomain:1})
     if(operations){
      // Execute the actual ordered DSL graph; the metadata is generated from
      // this very array, not a claimed graph beside a separate fixed loop.
      for(const operation of operations)switch(operation.kind){
       case 'seed-water':gpu.draw(cost[0],init,{aux});di=0;break
       case 'front':frontPass(operation.stride);break
       case 'seed-pigment':gpu.draw(color[0],cp,{source:initial});ci=0;break
       case 'transport':transportPass(operation.stride);break
       case 'rim':rimPass();break
       case 'upsample':publish();break
      }
     }else{
      // Original ordinary program: same seed, five front draws, copy,
      // configurable transport loop, rim and final upsample in the same order.
      gpu.draw(cost[0],init,{aux})
      for(const stride of [8,4,2,1,1])frontPass(stride)
      gpu.draw(color[0],cp,{source:initial})
      for(let i=0;i<steps;i++)transportPass([4,2,1,1][i%4])
      rimPass();publish()
     }
     return out
    })
   },
   destroy:()=>gpu.destroy(),
  }
 }catch(e){gpu.destroy();throw e}
}
export function create(gl:WebGLRenderingContext,size:number,config:Record<string,number>):GLAlgorithm{return createInternal(gl,size,config)}
export function createProgramCandidate(gl:WebGLRenderingContext,size:number,config:Record<string,number>):GLAlgorithm{fixedWetOption(config);const{fixedInitialWet:_flag,...dsl}=config;return createInternal(gl,size,config,programFromConfig(dsl))}
export const definitions:GLDefinition[]=[{id:'alternative-artistic-front',label:'Cheap dyadic artistic front + multiscale pigment',create,createFixedInitialWet:(g,s,c)=>create(g,s,{...c,fixedInitialWet:1}),configs:[{resolution:128,steps:8,budget:12,rim:.2},{resolution:256,steps:8,budget:16,rim:.35},{resolution:256,steps:16,budget:24,rim:.5},{resolution:512,steps:12,budget:32,rim:.35}]}]
export const programDefinitions:GLDefinition[]=[{id:'search-artistic-program',label:'Bounded24 ordered artistic programs (approximate search)',create:createProgramCandidate,createFixedInitialWet:(g,s,c)=>createProgramCandidate(g,s,{...c,fixedInitialWet:1}),configs:enumeratePrograms().map(programConfig)}]
