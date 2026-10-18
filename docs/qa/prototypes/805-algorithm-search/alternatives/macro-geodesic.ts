import {reviewedFixedWet} from './fixed-wet-existing'
import type {AlgorithmInput,GLAlgorithm,GLDefinition} from '../protocol'
import {GPU,head,number} from './gpu'
import {geodesicPairs} from './macro-geodesic-map'
const h=head+'precision highp sampler2D;'
const split=h+`uniform sampler2D original,aux;uniform float part,mobileFraction;void main(){vec4 raw=floor(texture2D(original,uv)*255.+.5);float wet=texture2D(aux,uv).r>0.?1.:0.;vec4 m=floor(raw*mobileFraction*wet+.5);gl_FragColor=(part>.5?m:raw-m)/255.;}`
const exchange=h+`uniform sampler2D mobile,pairMap;uniform float share;void main(){vec4 b=floor(texture2D(pairMap,uv)*255.+.5);vec2 p=vec2(dot(b.rg,vec2(256.,1.)),dot(b.ba,vec2(256.,1.)));vec4 own=floor(texture2D(mobile,uv)*255.+.5),other=floor(texture2D(mobile,(p+.5)/1024.)*255.+.5),delta=other-own;gl_FragColor=(own+sign(delta)*floor(abs(delta)*share+.5))/255.;}`
const finish=h+`uniform sampler2D original,settled,mobile,aux;void main(){if(texture2D(aux,uv).r==0.){gl_FragColor=texture2D(original,uv);return;}vec4 c=min(texture2D(settled,uv)+texture2D(mobile,uv),vec4(1.));gl_FragColor=vec4(min(c.rgb,vec3(c.a)),c.a);}`
export function create(gl:WebGLRenderingContext,size:number,config:Record<string,number>):GLAlgorithm{
 if(size!==1024)throw Error('geodesic requires1024')
 const distance=number(config,'distance',96,16,200),share=number(config,'share',.35,0,.5),mobileFraction=number(config,'mobile',.8,0,1),cycles=number(config,'cycles',2,1,4)
 if(!Number.isInteger(distance)||!Number.isInteger(cycles))throw Error('geodesic integer params')
 const gpu=new GPU(gl)
 try{
  const original=gpu.target(size),aux=gpu.target(size),fixed=gpu.target(size),mobile=[gpu.target(size),gpu.target(size)],maps=[gpu.target(size),gpu.target(size),gpu.target(size)],out=gpu.target(size)
  const seed=gpu.program(split,['original','aux','part','mobileFraction']),move=gpu.program(exchange,['mobile','pairMap','share']),sum=gpu.program(finish,['original','settled','mobile','aux'])
  const metadata={family:'nonlocal involutive wet-geodesic mobile mixing; no velocity CFD',passes:3+maps.length*cycles,maxWetPathPixels:distance,matchedFractions:[] as number[],meanWalkDistances:[] as number[],conservation:'antisymmetric integer byte transfers on involutive pairs; GPU sampling/precision and premul still device-gated'}
  let ready=false,packed:Uint8Array|undefined=new Uint8Array(size*size*4)
  return{metadata,upload(input:AlgorithmInput){ready=false;if(!packed)throw Error('destroyed');if(input.size!==size||input.rgba.length!==size**2*4||input.water.length!==size**2)throw Error('invalid input');for(let i=0;i<size**2;i++)packed[i*4]=input.water[i];gpu.upload(original,input.rgba);gpu.upload(aux,packed);metadata.matchedFractions=[];metadata.meanWalkDistances=[];for(let j=0;j<maps.length;j++){const map=geodesicPairs(input.water,size,Math.floor(distance*.65),distance,j);gpu.upload(maps[j],map.bytes);metadata.matchedFractions.push(map.matchedPixels/(size*size));metadata.meanWalkDistances.push(map.meanMatchedWalkDistance)}ready=true},run(){if(!ready)throw Error('upload first');return gpu.scope(()=>{gpu.draw(fixed,seed,{original,aux},{part:0,mobileFraction});gpu.draw(mobile[0],seed,{original,aux},{part:1,mobileFraction});let mi=0;for(let cycle=0;cycle<cycles;cycle++)for(const pairMap of maps){gpu.draw(mobile[1-mi],move,{mobile:mobile[mi],pairMap},{share});mi=1-mi}gpu.draw(out,sum,{original,settled:fixed,mobile:mobile[mi],aux});return out})},destroy(){ready=false;packed=undefined;gpu.destroy()}}
 }catch(e){gpu.destroy();throw e}
}
export const definitions:GLDefinition[]=[{id:'macro-wet-geodesic-exchange',label:'Wet-path paired nonlocal pigment mixing (96/192px)',create,createFixedInitialWet:reviewedFixedWet(create,_c=>({size:1024,grid:1024,geometrySource:'macro-geodesic-map.ts: positive raw-water4-neighbor DFS; involutive matched endpoints within same wet walk',partialWet:'full-resolution wet pixels participate in maps; no coarse footprint freeze',limitations:'Nonlocal wet-path mixing, not fluid velocity; UNORM/premul/device acceptance separate',fixedBulkShaderSources:[split,exchange,finish]})),configs:[{distance:96,share:.35,mobile:.8,cycles:2},{distance:192,share:.4,mobile:.8,cycles:3}]}]
