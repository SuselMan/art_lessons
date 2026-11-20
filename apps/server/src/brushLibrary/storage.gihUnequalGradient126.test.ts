import{it,expect}from'vitest'
import{mkdtempSync,rmSync}from'node:fs'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{createHash}from'node:crypto'
import{packDabs,createBrushSourceNonce,type BrushDescriptor,type BrushLibrary,type StrokeOperation}from'@grafetto/shared'
import{brush126,dab126,assets126,pixels126,palette126A,palette126B}from'../../../../packages/shared/src/gihUnequalGradient126.testFixture.js'
import{BrushStorage}from'./storage.js'
it('actual126 Storage retains existing raw packed endpoint source guards with required captured palette and no newwire',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gih126-source-'))
 try{const storage=new BrushStorage(dir),aliases=new Map<string,string>(),data=new Map<string,Buffer>(),assets=new Map<string,BrushLibrary['assets'][number]>()
 for(const a of assets126){const raw=Buffer.from(pixels126(a.id));const hash=createHash('sha256').update(raw).digest('hex'),id='asset:'+hash;aliases.set(a.id,id);data.set(hash,raw);assets.set(id,{id:id as `asset:${string}`,size:a.size,file:hash+'.bin'})}
 const d=JSON.parse(JSON.stringify(brush126()).replace(/asset:[a-f0-9]{64}/g,id=>aliases.get(id)!))as BrushDescriptor,library:BrushLibrary={schemaVersion:1,assets:[...assets.values()],skipped:[],brushes:[{name:'Own126',source:'authored.kpp',warnings:[],descriptor:d}]};storage.install('author',library,data);const preset='brush:'+d.id+'@126';storage.pin('room','author',[preset]);const base:StrokeOperation={id:'op126',type:'stroke',userId:'author',timestamp:0,layerId:'ink',tool:'digitalBrush',preset,color:[1,0,0],strokeId:createBrushSourceNonce('own126_nonce',{version:1,gradient:palette126A}),brushSource:{version:1,gradient:palette126A}}
 expect(storage.acceptsExecutionInputs('room','author',{...base,dabs:[dab126],brushSource:{version:1,gradient:palette126B}})).toBe(false)
 const valid={...dab126,tiltX:0};for(const packet of[{dabs:[valid]},{dabsPacked:packDabs([valid])},{dabs:[],strokeEndSample:{...valid,baseSize:4}}]){for(const brushSource of[undefined,{version:1,gradient:'bad'}])expect(storage.acceptsExecutionInputs('room','author',{...base,...packet,brushSource}as StrokeOperation)).toBe(false);for(const gradient of[palette126A,palette126B])expect(storage.acceptsExecutionInputs('room','author',{...base,...packet,strokeId:createBrushSourceNonce('own126_nonce',{version:1,gradient}),brushSource:{version:1,gradient}})).toBe(true)}
 for(const tiltX of[-1.25,0,1,101.52]){const dab={...dab126,tiltX};for(const packet of[{dabs:[dab]},{dabsPacked:packDabs([dab])},{dabs:[],strokeEndSample:{...dab,baseSize:4}}])expect(storage.acceptsExecutionInputs('room','author',{...base,...packet})).toBe(true)}
 for(const tiltX of[NaN,Infinity,1073741824]){const dab={...dab126,tiltX};for(const packet of[{dabs:[dab]},{dabsPacked:packDabs([dab])},{dabs:[],strokeEndSample:{...dab,baseSize:4}}])expect(storage.acceptsExecutionInputs('room','author',{...base,...packet})).toBe(false)}
 const missing={...dab126};Reflect.deleteProperty(missing,'tiltX');expect(storage.acceptsExecutionInputs('room','author',{...base,dabs:[missing]})).toBe(false);expect(storage.acceptsExecutionInputs('room','author',{...base,dabs:[],strokeEndSample:{...missing,baseSize:4}})).toBe(false)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
