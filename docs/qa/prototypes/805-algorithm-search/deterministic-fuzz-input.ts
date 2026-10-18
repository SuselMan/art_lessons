import type {AlgorithmInput} from './protocol'
export const FUZZ_GENERATOR_VERSION='structured-carrier-v1'
export const FUZZ_RECIPES=Object.freeze(Array.from({length:12},(_,i)=>Object.freeze({id:`structured-${String(i).padStart(2,'0')}`,seed:(0x80510001+Math.imul(i,0x9e3779b9))>>>0,control:i<2?'water-only':i<4?'full-dry':'mixed'})))
/** Recorded recipes, no entropy/time; max three 6MiB inputs per diagnostic request. */
export function createFuzzInput(id:string):{id:string;control:string;input:AlgorithmInput}{
 const recipe=FUZZ_RECIPES.find(r=>r.id===id);if(!recipe)throw Error('Unknown fuzz recipe: '+id)
 const size=1024,n=size*size,rgba=new Uint8Array(n*4),water=new Uint8Array(n),paper=new Uint8Array(n),index=FUZZ_RECIPES.indexOf(recipe),palette=[0,1,4,61,255]
 const hash=(x:number,y:number,tag:number)=>{let h=(recipe.seed^Math.imul(x+1,0x85ebca6b)^Math.imul(y+1,0xc2b2ae35)^tag)>>>0;h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);return(h^(h>>>16))>>>0}
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*size+x,p=i*4,h=hash((x+index)%size>>2,(y+index*3)%size>>2,1),coarse=hash((x+index)>>5,(y+index*3)>>5,2),middle=hash((x+index)>>3,(y+index*3)>>3,3)
  let a=[0,1,4,32,128,254,255][(h+coarse)%7],w=palette[(middle+coarse)%5]
  // Entire coherent patch families plus one-pixel walls/opaque sentinels at shifted phases.
  if(x===257+index||y===701-index||x===y+index)w=0
  if(x===513+index&&y%127===index){a=255;w=0}
  if(recipe.control==='water-only')a=0
  if(recipe.control==='full-dry')w=0
  rgba[p+3]=a
  const color=(h>>>8)%5
  rgba[p]=color===0||color===4?a:color===1?Math.min(a,1):0
  rgba[p+1]=color===1||color===4?a:color===2?Math.min(a,1):0
  rgba[p+2]=color===2||color===4?a:color===3?Math.min(a,1):0
  water[i]=w;paper[i]=(coarse%160+middle%64+((x+y)>>5)%32)&255
 }
 return{id,control:recipe.control,input:{size,seed:recipe.seed,encoding:'premultiplied-rgb',rgba,water,paper}}
}
export function assertFuzzRequest(algorithm:unknown,ids:unknown):asserts ids is string[]{
 if(!['wgsl-macro-gpu-initial-coherent-dt4','wgsl-macro-gpu-initial-fine','wgsl-macro-capacity-aware-lite'].includes(String(algorithm)))throw Error('Unsupported strong fuzz algorithm')
 if(!Array.isArray(ids)||ids.length!==3||new Set(ids).size!==3||ids.some(id=>typeof id!=='string'||!FUZZ_RECIPES.some(r=>r.id===id)))throw Error('Expected three distinct recorded fuzz recipes')
}
/** Diagnostic subset mirrors the three selected factories; reject invalid requests before GPU access. */
export function assertFuzzConfig(algorithm:string,config:unknown):asserts config is Record<string,number>{
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Invalid fuzz config')
 const fine=algorithm==='wgsl-macro-gpu-initial-fine',gpu=algorithm!=='wgsl-macro-capacity-aware-lite',rules:Record<string,readonly[number,number]>={physicalDt:[4,4],steps:[64,64],mobilityGain:[1,8],eddyCells:[4,64],curlStrength:[0,128],...(gpu?{verifyInitializer:[0,0] as const}:{}),...(fine?{fineSteps:[4,4] as const,affinityBase:[1,256] as const,paperGain:[0,4] as const,dither:[0,1] as const}:{})}
 for(const[k,v]of Object.entries(config)){const range=rules[k];if(!range||typeof v!=='number'||!Number.isInteger(v)||v<range[0]||v>range[1])throw Error('Invalid/unsupported fuzz config '+k)}
 const c=config as Record<string,number>;if(fine&&(c.affinityBase??64)+Math.floor(255*(c.paperGain??1)/4)>256)throw Error('Fuzz affinity bound')
}
