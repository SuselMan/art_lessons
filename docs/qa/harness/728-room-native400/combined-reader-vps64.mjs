import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {readCombinedConsumptionJson,parseCombinedConsumptionCdpResponse,combinedMetadataResponseShape} from './combined-consumption-reader.mjs'
const [root,output]=process.argv.slice(2)
if(!root||!output||fs.existsSync(output))throw Error('Explicit fresh registered resource/report required')
const marker=JSON.parse(fs.readFileSync(path.join(root,'.codex-qa-disposable.json'))),registry=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/codex-qa/resources.json')))
if(marker.path!==path.resolve(root)||registry[marker.id]?.nonce!==marker.nonce||registry[marker.id]?.finished)throw Error('Owned active resource required')
const require=createRequire(new URL('../../../../package.json',import.meta.url)),{chromium}=require('playwright')
let context
const server=http.createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><canvas width="64" height="64"></canvas>')})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
try{
 context=await chromium.launchPersistentContext(root+'/profile',{headless:true,args:['--disable-gpu']})
 const page=context.pages()[0];await page.goto('http://127.0.0.1:'+server.address().port)
 const cdp=await context.newCDPSession(page);await cdp.send('Runtime.enable')
 const shader='@compute @workgroup_size(8,8) fn main() {}'
 const adapter={diagnosticStaticFrontCacheFactor:true,factorVariantDiagnostics:[{staticCache:true,encoded:480,code:shader}],staticFrontCacheCounters:{prep:2,hits:478,fallbacks:0,retainedBytes:0,cleanupFailures:0},diagnosticNativeBrushPair:true,pairedBrushCalls:210,diagnosticFrontFilmHoist:false,filmVariantDiagnostics:[]}
 await page.evaluate(a=>{window.__engine={_wcNative:{central:{isIdle:true},backend:{diagnosticScopeState:{pending:0,live:true}},owner:{adapter:a}}}},adapter)
 const response=await cdp.send('Runtime.evaluate',{expression:'('+readCombinedConsumptionJson.toString()+')()',awaitPromise:true,returnByValue:true})
 const row=parseCombinedConsumptionCdpResponse(response)
 if(row.factorVariants[0].shaderSHA!==crypto.createHash('sha256').update(shader).digest('hex')||row.factorVariants[0].encoded!==480)throw Error('Browser digest/count mismatch')
 const objectResponse=await cdp.send('Runtime.evaluate',{expression:'(async()=>({factor:true,cache:{prep:2},variants:[]}))()',awaitPromise:true,returnByValue:true})
 if(objectResponse.result.type!=='object'||objectResponse.result.value?.factor!==true)throw Error('Control object response failed')
 const report={pass:true,readerSourceSHA:crypto.createHash('sha256').update(readCombinedConsumptionJson.toString()).digest('hex'),response:combinedMetadataResponseShape(response),controlObjectResponse:combinedMetadataResponseShape(objectResponse),canvas:await page.evaluate(()=>({width:document.querySelector('canvas').width,height:document.querySelector('canvas').height})),syntheticShaderBytes:row.factorVariants[0].shaderBytes,serializedBytes:response.result.value.length,scope:'Actual VPS headless Chrome CDP serialization with synthetic adapter, GPU disabled. Does not reproduce or diagnose Surface missing metadata; no native model/compiler/latency claim.'}
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report))
}finally{await context?.close();await new Promise(r=>server.close(r))}
