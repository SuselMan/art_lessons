const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),esbuild=require('/home/suselman/projects/pencil-agents/798-wave-buffer/node_modules/esbuild');
const out=path.join(process.env.QA_TEMP_ROOT||'/home/suselman/.cache/codex-qa/flow-805-night-20261018','fused-test.cjs');esbuild.buildSync({stdin:{contents:`export * from ${JSON.stringify(path.join(__dirname,'exact-fused-source.ts'))};export * from ${JSON.stringify(path.join(__dirname,'macro9-integer-smooth-core.ts'))};`,resolveDir:__dirname},bundle:true,platform:'node',outfile:out});const {fusedPairSource,mixedDynamicPair,adsorbMixed}=require(out);let seed=805,cells=0;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed};
function advance(state,n,x,y,phase){const i=y*n+x,axis=phase%2,offset=phase>>1,coord=axis?y:x,delta=(coord+2-offset)%2===0?1:-1,px=x+(axis?0:delta),py=y+(axis?delta:0);if(px<0||py<0||px>=n||py>=n)return adsorbMixed(state[i]);const j=py*n+px,a=Math.min(i,j),b=Math.max(i,j),r=mixedDynamicPair(state[a],state[b]);return i===a?r.a:r.b}
for(const n of[8,16,24]){
 let state=Array.from({length:n*n},()=>{const a=rand()%32768;return{m:[rand()%(a+1),rand()%(a+1),rand()%(a+1),a],d:[0,0,0,0],w:rand()%65536,s:0,cap:65535,absCap:22000,paper:rand()%256}})
 for(let cycle=0;cycle<12;cycle++){
  const phase=(cycle%2)*2,first=state.map((_,i)=>advance(state,n,i%n,Math.floor(i/n),phase)),expected=first.map((_,i)=>advance(first,n,i%n,Math.floor(i/n),phase+1)),actual=[];
  for(let gy=0;gy<n/8;gy++)for(let gx=0;gx<n/8;gx++){
   const tileA=[],tileB=[];for(let ly=0;ly<10;ly++)for(let lx=0;lx<10;lx++){const x=gx*8+lx-1,y=gy*8+ly-1;tileA[ly*10+lx]=state[Math.max(0,Math.min(n-1,y))*n+Math.max(0,Math.min(n-1,x))]}
   function localAdvance(tile,lx,ly,sub){const x=gx*8+lx-1,y=gy*8+ly-1,i=y*n+x,li=ly*10+lx,current=tile[li];if(x<0||y<0||x>=n||y>=n)return current;const ph=phase+sub,axis=ph%2,offset=ph>>1,coord=axis?y:x,delta=(coord+2-offset)%2===0?1:-1,px=x+(axis?0:delta),py=y+(axis?delta:0),plx=lx+(axis?0:delta),ply=ly+(axis?delta:0);if(px<0||py<0||px>=n||py>=n)return adsorbMixed(current);if(plx<0||ply<0||plx>=10||ply>=10)return current;const j=py*n+px,lj=ply*10+plx,r=mixedDynamicPair(tile[Math.min(li,lj)],tile[Math.max(li,lj)]);return i<j?r.a:r.b}
   for(let ly=0;ly<10;ly++)for(let lx=0;lx<10;lx++)tileB[ly*10+lx]=localAdvance(tileA,lx,ly,0);
   for(let ly=1;ly<=8;ly++)for(let lx=1;lx<=8;lx++){const x=gx*8+lx-1,y=gy*8+ly-1;actual[y*n+x]=localAdvance(tileB,lx,ly,1)}
  }
  assert.deepEqual(actual,expected);cells+=n*n;state=expected
 }
}
assert.ok(fusedPairSource().includes('@workgroup_size(10,10)'));fs.unlinkSync(out);console.log(JSON.stringify({pass:true,exactTwoPhaseCells:cells,sharedBytes:9600,scope:'CPU halo/equivalence proof; GPU compile/equivalence/performance pending'}));
