import{it,expect}from'vitest'
import{mkdtempSync,rmSync}from'node:fs'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{createHash}from'node:crypto'
import{packDabs,type BrushDescriptor,type BrushLibrary,type StrokeOperation}from'@grafetto/shared'
import{brush119,dab119,assets119}from'../../../../packages/shared/src/gihOriginalRgba119.testFixture.js'
import{BrushStorage}from'./storage.js'
it('actual119 Storage retains existing raw packed endpoint source guards without palette or newwire',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gih119-source-'))
 try{const storage=new BrushStorage(dir),aliases=new Map<string,string>(),data=new Map<string,Buffer>(),assets=new Map<string,BrushLibrary['assets'][number]>()
 for(const a of assets119){const raw=Buffer.alloc(a.size*a.size);for(let y=1;y<a.size-1;y++)for(let x=0;x<a.size;x++)raw[y*a.size+x]=128;const hash=createHash('sha256').update(raw).digest('hex'),id='asset:'+hash;aliases.set(a.id,id);data.set(hash,raw);assets.set(id,{id:id as `asset:${string}`,size:a.size,file:hash+'.bin'})}
 const d=JSON.parse(JSON.stringify(brush119()).replace(/asset:[a-f0-9]{64}/g,id=>aliases.get(id)!))as BrushDescriptor,library:BrushLibrary={schemaVersion:1,assets:[...assets.values()],skipped:[],brushes:[{name:'Own119',source:'authored.kpp',warnings:[],descriptor:d}]};storage.install('author',library,data);const preset='brush:'+d.id+'@119';storage.pin('room','author',[preset]);const base:StrokeOperation={id:'op119',type:'stroke',userId:'author',timestamp:0,layerId:'ink',tool:'digitalBrush',preset,color:[1,0,0],strokeId:'own-no-new-wire119'}
 for(const tiltX of[-1.25,0,1,101.52]){const dab={...dab119,tiltX};for(const packet of[{dabs:[dab]},{dabsPacked:packDabs([dab])},{dabs:[],strokeEndSample:{...dab,baseSize:4}}])expect(storage.acceptsExecutionInputs('room','author',{...base,...packet})).toBe(true)}
 for(const tiltX of[NaN,Infinity,1073741824]){const dab={...dab119,tiltX};for(const packet of[{dabs:[dab]},{dabsPacked:packDabs([dab])},{dabs:[],strokeEndSample:{...dab,baseSize:4}}])expect(storage.acceptsExecutionInputs('room','author',{...base,...packet})).toBe(false)}
 const missing={...dab119};Reflect.deleteProperty(missing,'tiltX');expect(storage.acceptsExecutionInputs('room','author',{...base,dabs:[missing]})).toBe(false);expect(storage.acceptsExecutionInputs('room','author',{...base,dabs:[],strokeEndSample:{...missing,baseSize:4}})).toBe(false)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
