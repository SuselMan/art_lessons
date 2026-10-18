import {GPU_INITIAL_SHADER} from './macro34-gpu-initial-shader'
function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Fixed GPU init source drift');return s.replace(a,b)}
/** Existing GPU reduction, full-wet bulk only. Boundary rgba stays in inputRGBA for later fine INIT. */
export function fixedWetGpuInitializer(){
 let s=once(GPU_INITIAL_SHADER,'fn unpack(', '@group(0) @binding(7) var<storage,read_write> initialKind:array<u32>;\nfn unpack(')
 s=once(s,'var sums=vec4u(0);var sumW=0u;var dryAlpha=0u;var maxDry=0u;var maxWet=0u;', 'var sums=vec4u(0);var sumW=0u;var dryAlpha=0u;var maxDry=0u;var maxWet=0u;var dryCount=0u;')
 s=once(s,'if(w==0u){dryAlpha+=v.a;', 'if(w==0u){dryCount+=1u;dryAlpha+=v.a;')
 const start=' var codes=(sums*257u+vec4u(32u))/64u;',end='let W=(sumW*257u+128u)/256u;'
 const a=s.indexOf(start),b=s.indexOf(end);if(a<0||b<a||s.split(start).length!==2||s.split(end).length!==2)throw Error('Fixed GPU init body drift')
 s=s.slice(0,a)+` var codes=vec4u(0);var cap=0u;let full=dryCount==0u;
 if(full){codes=(sums*257u+vec4u(32u))/64u;cap=65535u;atomicAdd(&summary[14],1u);atomicAdd(&summary[5],codes.a);for(var k=0u;k<4u;k++){atomicAdd(&summary[6u+k],codes[k]);}}
 else{for(var k=0u;k<4u;k++){atomicAdd(&summary[10u+k],sums[k]);}}
 for(var dy=0u;dy<8u;dy++){for(var dx=0u;dx<8u;dx++){let i=(by+dy)*1024u+bx+dx;let w=(water[i>>2u]>>((i&3u)*8u))&255u;initialKind[i]=select(select(2u,1u,full),0u,w==0u);if(!full&&w>0u){atomicAdd(&summary[15],1u);}}}
 atomicAdd(&summary[0],dryAlpha);atomicAdd(&summary[1],sums.a);`+s.slice(b)
 // These maxima remain unnecessary after policy partition; remove their declarations/updates explicitly.
 s=s.replace('var maxDry=0u;var maxWet=0u;','').replace('maxDry=max(maxDry,v.a);','').replace('maxWet=max(maxWet,v.a);','')
 return s
}

/** Independent CPU emulation of the packed-byte GPU policy algorithm; diagnostic only. */
export function simulateFixedWetGpuInitializer(rgba:Uint8Array,water:Uint8Array,sourceAux:Uint32Array){
 if(rgba.length!==4194304||water.length!==1048576||sourceAux.length!==65536)throw Error('Fixed GPU emulation dimensions')
 const state=new Uint32Array(16384*12),aux=new Uint32Array(65536),stationary=new Uint32Array(1048576),kind=new Uint32Array(1048576),summary=new Uint32Array(16)
 for(let ci=0;ci<16384;ci++){const bx=(ci%128)*8,by=Math.floor(ci/128)*8,sum=[0,0,0,0];let dry=0,dryA=0,sumW=0
  for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++){const i=(by+dy)*1024+bx+dx,w=water[i];sumW+=w;if(w===0){dry++;dryA+=rgba[i*4+3];stationary[i]=(rgba[i*4]|rgba[i*4+1]<<8|rgba[i*4+2]<<16|rgba[i*4+3]<<24)>>>0}else for(let k=0;k<4;k++)sum[k]+=rgba[i*4+k]}
  const full=dry===0;if(full){summary[14]++;for(let k=0;k<4;k++){const code=Math.floor((sum[k]*257+32)/64);state[ci*12+k]=code;summary[6+k]+=code;if(k===3)summary[5]+=code}}else for(let k=0;k<4;k++)summary[10+k]+=sum[k]
  for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++){const i=(by+dy)*1024+bx+dx;kind[i]=water[i]===0?0:full?1:2;if(kind[i]===2)summary[15]++}
  summary[0]+=dryA;summary[1]+=sum[3];const W=Math.floor((sumW*257+128)/256);summary[4]+=W;state[ci*12+8]=W;aux.set([full?65535:0,sourceAux[ci*4+1],sourceAux[ci*4+2],sourceAux[ci*4+3]],ci*4)
 }
 return{state,aux,stationary,kind,summary}
}
