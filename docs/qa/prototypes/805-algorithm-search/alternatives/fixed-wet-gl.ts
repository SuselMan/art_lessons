import {GPU,head,type Input,type Target} from './gpu'
import {partitionFixedGL} from './fixed-wet-gl-core'
function once(source:string,anchor:string,replacement:string){if(source.split(anchor).length!==2)throw Error('Fixed GL source anchor drift: '+anchor.slice(0,50));return source.replace(anchor,replacement)}
export const fixedWetFns=`
bool fwOpen(vec2 q){if(q.x<0.||q.y<0.||q.x>=1.||q.y>=1.)return false;return texture2D(aux,(floor(q*n)+.5)/n).b>.5;}
bool fwPath(vec2 a,vec2 b){vec2 start=floor(a*n),end=floor(b*n),delta=end-start,prev=start;float count=max(abs(delta.x),abs(delta.y));if(count>8.||!fwOpen(a))return false;for(int k=1;k<=8;k++){if(float(k)>count)break;vec2 cell=floor(start+delta*float(k)/max(count,1.)+.5);if(cell.x!=prev.x&&cell.y!=prev.y){if(!fwOpen((vec2(cell.x,prev.y)+.5)/n)||!fwOpen((vec2(prev.x,cell.y)+.5)/n))return false;}if(!fwOpen((cell+.5)/n))return false;prev=cell;}return true;}
vec4 fwSample(sampler2D tex,vec2 q){return fwPath(uv,q)?texture2D(tex,q):texture2D(tex,uv);}
vec4 fwBilerp(sampler2D tex,vec2 p,vec2 dims){vec2 q=clamp(p*dims-.5,vec2(0.),dims-1.),i=floor(q),f=fract(q),a=(i+.5)/dims,b=min(i+1.,dims-1.);return mix(mix(fwSample(tex,a),fwSample(tex,vec2((b.x+.5)/dims.x,a.y)),f.x),mix(fwSample(tex,vec2(a.x,(b.y+.5)/dims.y)),fwSample(tex,(b+.5)/dims),f.x),f.y);}
vec2 fwClampVelocity(vec2 v){if(!fwPath(uv,uv+vec2(sign(v.x),0.)/n))v.x=0.;if(!fwPath(uv,uv+vec2(0.,sign(v.y))/n))v.y=0.;return v;}
`
export function fixedWetShader(family:'lattice'|'artistic'|'stable',role:string,original:string){
 if(original.includes('fwOpen')||/texture2D\(aux,[^;]*\)\.b/.test(original))throw Error('Fixed GL aux.b already used/source transformed')
 let source=original
 if(family==='artistic'&&role==='seed')return once(source,'a.r>.02?0.:1.','a.b>.5&&a.r>.02?0.:1.')
 if(!source.includes('uniform sampler2D')||source.split('void main(){').length!==2)throw Error('Fixed GL main drift')
 if(!/uniform sampler2D [^;]*\baux\b/.test(source))source=source.replace('varying vec2 uv;','varying vec2 uv;uniform sampler2D aux;')
 const neutral=family==='stable'&&role!=='pigment'?'vec4(128./255.,128./255.,0.,1.)':'texture2D(source,uv)'
 source=source.replace('varying vec2 uv;','varying vec2 uv;bool fwPath(vec2 a,vec2 b);')
 source=once(source,'void main(){',fixedWetFns+'void main(){if(!fwOpen(uv)){gl_FragColor='+neutral+';return;}')
 if(family==='lattice'||(family==='artistic'&&(role==='front'||role==='transport'))){const anchor='if(q.x<0.||q.y<0.||q.x>1.||q.y>1.)continue;';source=once(source,anchor,anchor+'if(!fwPath(uv,q))continue;')}
 if(family==='stable'){
  if(role==='velocity')source=once(source,'bilerp(velocity,p,n)','fwBilerp(velocity,p,n)')
  if(role==='pigment')source=once(source,'bilerp(source,clamp(uv-dt*v/n,e*.5,1.-e*.5),n)','fwBilerp(source,clamp(uv-dt*v/n,e*.5,1.-e*.5),n)')
  if(role==='velocity'||role==='pigment')source=source.replace(/texture2D\((velocity|source),(uv[+-]vec2\([^)]*\))\)/g,'fwSample($1,$2)')
  if(role==='pressure'||role==='project')source=once(source,'float p(vec2 q){','float p(vec2 q){if(!fwPath(uv,q))q=uv;')
  if(role==='divergence')source=source.replace(/decode\(texture2D\(velocity,(uv[+-]vec2\([^)]*\))\)\)/g,'(fwPath(uv,$1)?decode(texture2D(velocity,$1)):vec2(0.))')
  if(role==='project')source=once(source,'encode((v-grad)*smoothstep','encode(fwClampVelocity(v-grad)*smoothstep')
  if(role==='velocity')source=once(source,'encode(mix(adv,avg,viscosity)*smoothstep','encode(fwClampVelocity(mix(adv,avg,viscosity))*smoothstep')
  if(role==='force')source=once(source,'encode((curl*rotation+down*.3)*w*force)','encode(fwClampVelocity((curl*rotation+down*.3)*w*force))')
 }
 return source
}
export const fixedFineInit=head+`uniform highp sampler2D source,original,rawAux,domain;uniform vec2 n;uniform float blend,costDomain;void main(){vec4 raw=texture2D(original,uv);float kind=floor(texture2D(rawAux,uv).b*255.+.5);if(kind<.5){gl_FragColor=vec4(0.);return;}if(kind>1.5){gl_FragColor=raw;return;}vec2 q=(floor(uv*n)+.5)/n;vec4 v=texture2D(source,q);float w=texture2D(domain,q).r;float wet=mix(w,1.-smoothstep(.75,1.,w),costDomain);vec4 c=mix(raw,v,blend*smoothstep(0.,.08,wet));gl_FragColor=vec4(clamp(c.rgb,vec3(0.),vec3(c.a)),clamp(c.a,0.,1.));}`
export const fixedFinePair=head+`uniform highp sampler2D source,rawAux;uniform vec2 size;uniform float phase;void main(){vec2 cell=floor(uv*size);float axis=floor(phase/2.),off=mod(phase,2.),coord=axis<.5?cell.x:cell.y;float parity=mod(coord-off+2.,2.);vec2 delta=axis<.5?vec2(1.,0.):vec2(0.,1.);vec2 a=cell-delta*parity,b=a+delta;vec4 own=floor(texture2D(source,uv)*255.+.5);if(a.x<0.||a.y<0.||b.x>=size.x||b.y>=size.y){gl_FragColor=own/255.;return;}vec2 qa=(a+.5)/size,qb=(b+.5)/size;if(texture2D(rawAux,qa).r==0.||texture2D(rawAux,qb).r==0.){gl_FragColor=own/255.;return;}vec4 A=floor(texture2D(source,qa)*255.+.5),B=floor(texture2D(source,qb)*255.+.5),d=B-A,q=sign(d)*floor((abs(d)*64.+128.)/256.);gl_FragColor=(parity<.5?A+q:B-q)/255.;}`
export const fixedFinePublish=head+`uniform highp sampler2D source,original,rawAux;void main(){gl_FragColor=texture2D(rawAux,uv).r==0.?texture2D(original,uv):texture2D(source,uv);}`
/** Own all resources through the caller's GPU owner. Adds12 fine parity draws +init/publish. */
export function createFixedWetTail(gpu:GPU,size:number,n:number){
 const rawAux=gpu.target(size),fine=[gpu.target(size),gpu.target(size)],init=gpu.program(fixedFineInit,['source','original','rawAux','domain','n','blend','costDomain']),pair=gpu.program(fixedFinePair,['source','rawAux','size','phase']),publish=gpu.program(fixedFinePublish,['source','original','rawAux']);let summary:ReturnType<typeof partitionFixedGL>['summary']|null=null
 return{upload(input:Input){const p=partitionFixedGL(input,n);gpu.upload(rawAux,p.rawAux);summary=p.summary;return p},run(out:Target,source:Target,original:Target,domain:Target,blend:number,costDomain:number){gpu.draw(fine[0],init,{source,original,rawAux,domain},{n:[n,n],blend,costDomain});for(let step=0;step<12;step++)gpu.draw(fine[1-step%2],pair,{source:fine[step%2],rawAux},{size:[size,size],phase:step%4});gpu.draw(out,publish,{source:fine[0],original,rawAux});return out},get metadata(){return{policy:'initial raw water>0 immutable; bulk all-wet cells + raw mobile partial wet + dry literal',policyRevision:1,fixedInitialWet:true,size,grid:n,fineModel:'initial-fixed-boundary-quarter',fineSteps:12,fineOrder:'H-even,H-odd,V-even,V-odd',additionalBytes:size*size*12,partition:summary,conservation:'Fine byte pair all4 sums exact; old bulk advection/rim/UNORM NOT claimed conservative; coarse reduction quantization separate',sourceQualification:'Actual source texts retained for SHA outside primary timer',fineShaderSources:[fixedFineInit,fixedFinePair,fixedFinePublish]}}}
}
