import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {SOURCE_SCALAR_POWER_ASSETS} from '../src/presets/sourceScalarPowerAssets'
import {prepareSourceScalarPowerTable,isSourceScalarPowerMode,type SourceScalarPowerTableOwner,type SourceScalarPowerMode,SOURCE_SCALAR_POWER_MODES} from '../src/presets/sourceScalarPowerTable'
import {BrushMipCache} from '../src/dabs/BrushMipCache'
/** Real canonical artifact bytes; no issued-view constructor shortcut or fake hash. */
export function installScalarPowerAssetFetch():()=>void{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'fetch')
 const allowed=new Map(Object.values(SOURCE_SCALAR_POWER_ASSETS).map(asset=>[asset.url,asset]))
 Object.defineProperty(globalThis,'fetch',{configurable:true,writable:true,value:async(input:RequestInfo|URL,init?:RequestInit)=>{
  const asset=allowed.get(String(input));if(!asset)throw new Error('Unexpected scalar test asset request')
  if(init?.signal?.aborted)throw new DOMException('Aborted','AbortError')
  const root=process.env.GRAFETTO_TEST_SCALAR_ASSET_ROOT??resolve(process.cwd(),'apps/web/public')
  const bytes=await readFile(resolve(root,asset.url.slice(1)))
  return new Response(bytes,{status:200,headers:{'content-length':String(bytes.length)}})
 }})
 let held=true;return()=>{if(!held)return;held=false;if(previous)Object.defineProperty(globalThis,'fetch',previous);else Reflect.deleteProperty(globalThis,'fetch')}
}
export async function loadScalarPowerTestTables():Promise<{context(mode:unknown):{powerTable:SourceScalarPowerTableOwner['view']}|undefined;release():void}>{
 const restore=installScalarPowerAssetFetch(),cpu=new BrushMipCache(),owner={},tables=new Map<SourceScalarPowerMode,SourceScalarPowerTableOwner>()
 try{for(const mode of SOURCE_SCALAR_POWER_MODES)tables.set(mode,await prepareSourceScalarPowerTable(mode,cpu,owner))}
 catch(primary){for(const table of tables.values())try{table.release()}catch{}throw primary}
 finally{restore()}
 return{context(mode){const table=isSourceScalarPowerMode(mode)?tables.get(mode):undefined;return table?{powerTable:table.view}:undefined},release(){for(const table of tables.values())table.release();if(cpu.reservedBytes!==0)throw new Error('Scalar test tables leaked CPU ownership')}}
}

export async function retainScalarPowerTestPages(pass:import('../src/dabs/CanonicalRgba8CompositePass').CanonicalRgba8CompositePass,styles:readonly import('../src/dabs/CanonicalRgba8CompositePass').CanonicalScalarAtlasStyle[]=['plain']):Promise<()=>void>{
 const releases:(()=>void)[]=[]
 try{for(const mode of SOURCE_SCALAR_POWER_MODES){await pass.prepareScalarAtlas(mode,undefined,undefined,styles);releases.push(pass.retainScalarAtlas(mode))}}
 catch(primary){for(const release of releases.reverse())try{release()}catch{}throw primary}
 let held=true;return()=>{if(!held)return;held=false;let failed=false,primary:unknown;for(const release of releases.reverse())try{release()}catch(error){if(!failed){failed=true;primary=error}}if(failed)throw primary}
}

/** Extend the recording lifetime mock with real independent unpack fields/fifth unit. */
export function installScalarAtlasMockCaps(gl:WebGLRenderingContext):void{
 Object.assign(gl,{TEXTURE1:gl.TEXTURE0+1,TEXTURE4:gl.TEXTURE0+4,MAX_TEXTURE_IMAGE_UNITS:9014,UNPACK_COLORSPACE_CONVERSION_WEBGL:9015,UNPACK_FLIP_Y_WEBGL:9018,UNPACK_PREMULTIPLY_ALPHA_WEBGL:9019,NONE:0})
 const get=gl.getParameter.bind(gl),store=gl.pixelStorei.bind(gl),flags=new Map<number,number|boolean>([[gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,0],[gl.UNPACK_FLIP_Y_WEBGL,false],[gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false]])
 gl.getParameter=(name:number)=>name===gl.MAX_TEXTURE_IMAGE_UNITS?8:flags.has(name)?flags.get(name):get(name)
 gl.pixelStorei=(name:number,value:number|boolean)=>{if(flags.has(name))flags.set(name,value);else store(name,value)}
 const active=get(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE0+4);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(active)
}
