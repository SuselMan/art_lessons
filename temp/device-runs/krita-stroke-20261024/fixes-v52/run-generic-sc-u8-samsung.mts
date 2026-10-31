import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {build} from 'esbuild'
import WebSocket from 'ws'
import {connect} from '../fixes-v29/cdp-20261028.mjs'
import fixture from '../../../../apps/web/src/engine/src/presets/fixtures/sourceRgba8Separable/source-law.native.json'
import {canonicalizeSourceRgba8Control} from '../../../../apps/web/src/engine/src/raster/sourceRgba8CompositeShader'
import {SOURCE_RGBA8_GENERIC_SC_PROFILE} from '../../../../apps/web/src/engine/src/presets/sourceColorRgba8'
const root=new URL('./',import.meta.url),hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex'),adb='/home/suselman/tools/platform-tools/adb',serial='192.168.1.36:38415'
const rows:any[]=[...fixture.cases.map((c,i)=>({...c,id:'native-'+i})),...['multiply','lighten','colorDodge','overlay'].map(mode=>({mode,id:'MULT3-absent-mask-'+mode,src:[1,2,3,91],dst:[4,5,6,0],opacity:248/255,mask:-1,expected:[1,2,3,88]}))].map(c=>({...c,prepared:canonicalizeSourceRgba8Control({mode:c.mode,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:c.opacity,...c.mask<0?{}:{mask:c.mask}} as never)}))
const b64=(v:number[])=>Buffer.from(v).toString('base64')
const trials=rows.flatMap((row,index)=>['straightRgba8','maskRgb'].map(kind=>({index:index*2+Number(kind==='maskRgb'),profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,kind,rowOrder:'topAtV0',mirror:0,preview:false,origin:{x:0,y:0},paints:true,x:0,y:0,rgb:row.src.slice(0,3),source:b64(kind==='maskRgb'?[row.src[3],row.src[3],row.src[3],255]:row.src),initial:b64(row.dst),steps:[{control:{mode:row.mode,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:row.opacity,...row.mask<0?{}:{mask:row.mask}},expected:b64(row.expected)}]})))
const config={W:1,H:1,SW:1,SH:1,MW:1,MH:1,rows,trials}
const bundle=await build({stdin:{contents:`export {CanonicalRgba8CompositePass} from './apps/web/src/engine/src/dabs/CanonicalRgba8CompositePass';export {BrushTextureCache,allocateOwnedBrushTexture} from './apps/web/src/engine/src/dabs/BrushTextureCache';export {BrushMipCache} from './apps/web/src/engine/src/dabs/BrushMipCache';export {SOURCE_RGBA8_COMPOSITE_GLSL} from './apps/web/src/engine/src/raster/sourceRgba8CompositeShader';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'GENERIC_SC',platform:'browser'})
const code=bundle.outputFiles[0].text,body1=fs.readFileSync(new URL('generic-sc-u8-samsung-webgl1-body.js',root),'utf8').replaceAll('COMPOSITE_OVER','GENERIC_SC'),body2=fs.readFileSync(new URL('generic-sc-u8-samsung-webgl2-body.js',root),'utf8')
const before=await(await fetch('http://127.0.0.1:19236/json/list')).json()
fs.writeFileSync(new URL('generic-sc-u8-samsung-tabs-before.json',root),JSON.stringify(before.map((t:any)=>({id:t.id,url:t.url,type:t.type})),null,2))
const job=new URL('generic-sc-u8-samsung-job.json',root);fs.writeFileSync(job,JSON.stringify({pid:process.pid,owner:'stamp_lifecycle_next',command:process.argv,expires:new Date(Date.now()+300000).toISOString(),ownForward:'tcp:19236',deviceSerial:'R52RB0JXVSY',status:'running'},null,2))
let browser:WebSocket|undefined,c:any,child:string|undefined,seq=0;const pending=new Map<number,any>()
function call(method:string,params:any={}){return new Promise<any>((resolve,reject)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'))},15000);pending.set(id,(m:any)=>{clearTimeout(t);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result)});browser!.send(JSON.stringify({id,method,params}))})}
const cleanup:any={childClosed:false,forwardRemoved:false,tabsPreserved:false}
try{
 const version=await(await fetch('http://127.0.0.1:19236/json/version')).json();browser=new WebSocket(version.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{browser!.once('open',resolve);browser!.once('error',reject)});browser.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.id){pending.get(m.id)?.(m);pending.delete(m.id)}})
 child=(await call('Target.createTarget',{url:'about:blank'})).targetId;c=await connect(child);await c.call('Page.bringToFront')
 const webgl1=await c.ev(`(()=>{${code};const CONFIG=${JSON.stringify(config)};return ${body1}})()`,120000)
 const webgl2=await c.ev(`(()=>{${code};const CONFIG=${JSON.stringify(config)};return ${body2}})()`,120000)
 const proof={sourceSHA:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),fixtureSHA256:hash(fs.readFileSync('apps/web/src/engine/src/presets/fixtures/sourceRgba8Separable/source-law.native.json')),bundleSHA256:hash(code),body1SHA256:hash(body1),body2SHA256:hash(body2),fixtureCases:fixture.cases.length,additionalMULT3Witnesses:4,webgl1Draws:trials.length,scope:fixture.scope}
 const result={proof,webgl1,webgl2};fs.writeFileSync(new URL('generic-sc-u8-samsung-result.json',root),JSON.stringify(result,null,2)+'\n')
 console.log(JSON.stringify({proof,webgl1:{...webgl1,trials:webgl1.trials.length},webgl2:{...webgl2,output:undefined}}))
 if(webgl1.wrong||webgl1.GL.length||!webgl1.stateRestored||!webgl1.samplersRestored||!webgl1.leasesBalanced||!webgl1.hotNoUploads||!webgl1.cleanup.ok||webgl2.available&&(webgl2.wrong||webgl2.GL.length||!webgl2.cleanup))throw Error('Samsung GenericSC U8 gate failed')
}finally{
 try{if(child&&browser)cleanup.childClosed=(await call('Target.closeTarget',{targetId:child})).success===true}
 finally{c?.ws.close();browser?.close();try{const after=await(await fetch('http://127.0.0.1:19236/json/list')).json();cleanup.tabsPreserved=JSON.stringify(before.map((t:any)=>[t.id,t.url]).sort())===JSON.stringify(after.map((t:any)=>[t.id,t.url]).sort());cleanup.remainingIds=after.map((t:any)=>t.id)}finally{execFileSync(adb,['-s',serial,'forward','--remove','tcp:19236']);cleanup.forwardRemoved=true;fs.writeFileSync(new URL('generic-sc-u8-samsung-cleanup.json',root),JSON.stringify(cleanup,null,2)+'\n');fs.writeFileSync(job,JSON.stringify({...JSON.parse(fs.readFileSync(job,'utf8')),status:'finished'},null,2))}}
}
