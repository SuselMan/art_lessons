import {BUFFER,buffer,packedRGBA,readPacked,validateInput,validateSize,type Candidate,type Input} from './contract'
export type MacroInitial={color:Float32Array;environment:Float32Array}
/** Coarse cells admit transport only when every fine pixel is wet: conservative thin-dry-barrier policy. */
export function initialMacro(input:Input,n:number):MacroInitial{
 validateInput(input,input.size);if(input.size%n)throw Error('Macro grid must divide size')
 const ratio=input.size/n,area=ratio*ratio,color=new Float32Array(n*n*4),environment=new Float32Array(n*n*2)
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){let water=0,paper=0,allWet=true;const cell=y*n+x
  for(let dy=0;dy<ratio;dy++)for(let dx=0;dx<ratio;dx++){const i=(y*ratio+dy)*input.size+x*ratio+dx;water+=input.water[i]/255;paper+=input.paper[i]/255;allWet&&=input.water[i]>0;for(let c=0;c<4;c++)color[cell*4+c]+=input.rgba[i*4+c]/(255*area)}
  environment[cell*2]=allWet?water/area:0;environment[cell*2+1]=paper/area
 }return{color,environment}
}
export const MACRO_PACK=/* wgsl */`
struct Params {n:u32,size:u32,mobile:f32,pad:f32}
@group(0) @binding(0) var<storage,read> colors:array<vec4f>;
@group(0) @binding(1) var<storage,read> environment:array<vec2f>;
@group(0) @binding(2) var<storage,read> original:array<u32>;
@group(0) @binding(3) var<storage,read> wet:array<u32>;
@group(0) @binding(4) var<storage,read_write> output:array<u32>;
@group(0) @binding(5) var<uniform> p:Params;
fn index(q:vec2i)->u32{let c=clamp(q,vec2i(0),vec2i(i32(p.n)-1));return u32(c.y)*p.n+u32(c.x);}
fn unpack(v:u32)->vec4f{return vec4f(f32(v&255u),f32((v>>8u)&255u),f32((v>>16u)&255u),f32(v>>24u))/255.0;}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) gid:vec3u){
 if(any(gid.xy>=vec2u(p.size))){return;}let i=gid.y*p.size+gid.x;let owner=gid.xy*p.n/p.size;
 if(wet[i]==0u||environment[owner.y*p.n+owner.x].x<=0.0){output[i]=original[i];return;}
 let pos=clamp((vec2f(gid.xy)+vec2f(0.5))*f32(p.n)/f32(p.size)-vec2f(0.5),vec2f(0),vec2f(f32(p.n)-1.0));let base=vec2i(floor(pos));let t=fract(pos);
 let ids=array<u32,4>(index(base),index(base+vec2i(1,0)),index(base+vec2i(0,1)),index(base+vec2i(1,1)));
 let weights=array<f32,4>((1.0-t.x)*(1.0-t.y),t.x*(1.0-t.y),(1.0-t.x)*t.y,t.x*t.y);
 var value=vec4f(0);var norm=0.0;for(var k=0u;k<4u;k++){if(environment[ids[k]].x>0.0){value+=colors[ids[k]]*weights[k];norm+=weights[k];}}
 if(norm<=0.0){output[i]=original[i];return;}
 value=mix(unpack(original[i]),value/norm,p.mobile);let b=vec4u(floor(clamp(value,vec4f(0),vec4f(1))*255.0+vec4f(0.5)));
 output[i]=b.r|(b.g<<8u)|(b.b<<16u)|(b.a<<24u);
}`
export function macroGrid(size:number,n:number){validateSize(size);if(![64,128,256,512].includes(n)||size%n)throw Error('Macro grid must be64/128/256/512 and divide size')}
export function scalar(value:number,min:number,max:number,name:string){if(!Number.isFinite(value)||value<min||value>max)throw Error('Invalid '+name);return value}
export function makeMacroIO(device:GPUDevice,size:number,n:number,mobile:number,pack:GPUComputePipeline){
 const usage=BUFFER.STORAGE|BUFFER.COPY_DST,original=buffer(device,size*size*4,usage,'macro-original'),water=buffer(device,size*size*4,usage,'macro-fine-water'),output=buffer(device,size*size*4,BUFFER.STORAGE|BUFFER.COPY_SRC,'macro-output'),staging=buffer(device,size*size*4,BUFFER.COPY_DST|BUFFER.MAP_READ,'macro-staging'),params=buffer(device,16,BUFFER.UNIFORM|BUFFER.COPY_DST,'macro-pack-params')
 const data=new ArrayBuffer(16);new Uint32Array(data).set([n,size]);new Float32Array(data)[2]=mobile;device.queue.writeBuffer(params,0,data)
 return{all:[original,water,output,staging,params],upload(input:Input){device.queue.writeBuffer(original,0,packedRGBA(input.rgba));device.queue.writeBuffer(water,0,Uint32Array.from(input.water))},group(color:GPUBuffer,environment:GPUBuffer){return device.createBindGroup({layout:pack.getBindGroupLayout(0),entries:[color,environment,original,water,output,params].map((b,binding)=>({binding,resource:{buffer:b}}))})},output,readback:()=>readPacked(device,output,size,staging)}
}
export type MacroCandidate=Candidate
