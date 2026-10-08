import type {CommonSourceCheckpoint} from './commonSourceRunner'
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer)),v=>v.toString(16).padStart(2,'0')).join('')
export interface CheckpointChunk {name:string;rawBytes:number;rawSha256:string;gzipBytes:number;gzipSha256:string}
export interface PackedCommonSourceCheckpoint {solverBoundary?:CommonSourceCheckpoint['solverBoundary'];code:string;operationSha256:string;paperSha256:string;glOwnerRetired:true;config:CommonSourceCheckpoint['config'];payload:Omit<CommonSourceCheckpoint['payload'],'fields'>&{fields:Array<Omit<CommonSourceCheckpoint['payload']['fields'][number],'bytes'>>};glFields:CommonSourceCheckpoint['glFields'];gl:CommonSourceCheckpoint['gl'];chunks:CheckpointChunk[]}
/** Callback persists EACH gzip chunk before manifest returns; no bulk console output. */
export async function persistCommonSourceCheckpoint(checkpoint:CommonSourceCheckpoint,write:(meta:CheckpointChunk,gzip:Uint8Array)=>Promise<void>):Promise<PackedCommonSourceCheckpoint>{
 if(!checkpoint.glOwnerRetired)throw Error('GL owner must retire before persistence/native allocation')
 const chunks:CheckpointChunk[]=[],stored=new Set<number>(),save=async(name:string,bytes:Uint8Array)=>{const gzip=new Uint8Array(await new Response(new Blob([bytes.slice().buffer]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()),meta={name,rawBytes:bytes.length,rawSha256:await hash(bytes),gzipBytes:gzip.length,gzipSha256:await hash(gzip)};await write(meta,gzip);chunks.push(meta)}
 for(const f of checkpoint.payload.fields)if(f.presence==='field'&&!stored.has(f.alias!)){if(!f.bytes||f.bytes.length!==4194304)throw Error('Exact source bytes required');await save(`source-${f.alias}.rgba.gz`,f.bytes);stored.add(f.alias!)}
 await save('gl-final.rgba.gz',checkpoint.glBytes)
 return{solverBoundary:checkpoint.solverBoundary,code:checkpoint.code,operationSha256:checkpoint.operationSha256,paperSha256:checkpoint.paperSha256,glOwnerRetired:true,config:checkpoint.config,payload:{...checkpoint.payload,fields:checkpoint.payload.fields.map(({bytes:_bytes,...f})=>f)},glFields:checkpoint.glFields,gl:checkpoint.gl,chunks}
}
async function inflateBounded(gzip:Uint8Array,expected:number){
 const reader=new Blob([gzip.slice().buffer]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),bytes=new Uint8Array(expected);let offset=0
 try{while(true){const{done,value}=await reader.read();if(done)break;if(offset+value.length>expected)throw Error('Q8 checkpoint output exceeds bound');bytes.set(value,offset);offset+=value.length}if(offset!==expected)throw Error('Q8 checkpoint output length differs');return bytes}finally{await reader.cancel().catch(()=>{})}
}
export async function restoreCommonSourceCheckpoint(manifest:PackedCommonSourceCheckpoint,read:(name:string)=>Promise<Uint8Array>):Promise<CommonSourceCheckpoint>{
 if(!manifest.glOwnerRetired||manifest.chunks.length>19)throw Error('Invalid checkpoint manifest')
 const data=new Map<string,Uint8Array>();let rawBytes=0
 for(const chunk of manifest.chunks){if(!/^(source-[0-9]+|gl-final)\.rgba\.gz$/.test(chunk.name)||data.has(chunk.name)||chunk.rawBytes!==4194304||chunk.gzipBytes>4198400)throw Error('Invalid bounded source chunk');rawBytes+=chunk.rawBytes;if(rawBytes>76*1024*1024)throw Error('Snapshot budget exceeded');const gzip=await read(chunk.name);if(gzip.length!==chunk.gzipBytes||await hash(gzip)!==chunk.gzipSha256)throw Error('Compressed checkpoint hash differs');const bytes=await inflateBounded(gzip,chunk.rawBytes);if(bytes.length!==chunk.rawBytes||await hash(bytes)!==chunk.rawSha256)throw Error('Q8 checkpoint hash differs');data.set(chunk.name,bytes)}
 const glBytes=data.get('gl-final.rgba.gz');if(!glBytes)throw Error('Missing actual GL final material')
 return{...manifest,payload:{...manifest.payload,fields:manifest.payload.fields.map(f=>({...f,bytes:f.presence==='field'?data.get(`source-${f.alias}.rgba.gz`):undefined}))},glBytes}
}
