import{it,expect}from'vitest'
import{mkdtempSync,rmSync}from'node:fs'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{createHash}from'node:crypto'
import{createBrushSourceNonce,packDabs,packStrokeEndSample,type BrushPattern,type StrokeOperation}from'@grafetto/shared'
import{library158}from'../../../../packages/shared/src/experimentPattern158.testFixture.js'
import{BrushStorage}from'./storage.js'
function source(){const assets=[] as ReturnType<typeof library158>['assets'],payloads:Record<string,string>={},ids:`asset:${string}`[]=[];for(const value of[128,30,70,110]){const bytes=Buffer.alloc(16);for(const i of[4,5,6,8,9,10])bytes[i]=value;const hash=createHash('sha256').update(bytes).digest('hex'),id=`asset:${hash}` as const;ids.push(id);assets.push({id,size:4,file:hash+'.bin'});payloads[hash]=bytes.toString('base64')}const pattern:BrushPattern={version:1,kind:'rgba',alpha:ids[0],planes:[ids[1],ids[2],ids[3]],side:4,sourceRect:{x:0,y:1,width:3,height:2},sampling:'world-repeat-nearest-v1'};return{pattern,assets,payloads}}
it('same room manifest pins new canvas CAS even with preset already pinned; raw/packed/END source binding before early return',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pattern158-'));try{const storage=new BrushStorage(dir),l=library158(),b=l.brushes[0].descriptor,preset=`brush:${b.id}@158`;storage.install('author',l,new Map());storage.pin('room','author',[preset]);const initial=storage.library('rooms','room');const s=source();storage.pin('room','author',[preset],undefined,s);expect(storage.library('rooms','room').brushes).toEqual(initial.brushes);expect(storage.library('rooms','room').assets).toHaveLength(4);storage.pin('room','author',[preset],undefined,s);expect(storage.library('rooms','room').assets).toHaveLength(4)
 const brushSource={version:1 as const,pattern:s.pattern},base:StrokeOperation={id:'op158',type:'stroke',userId:'author',timestamp:0,layerId:'ink',tool:'digitalBrush',preset,color:[1,0,0],strokeId:createBrushSourceNonce('ownPattern158',brushSource),brushSource},d={x:1,y:2,size:20,pressure:.5,opacity:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,t:0}
 for(const packet of[{dabs:[d]},{dabsPacked:packDabs([d])},{strokeEnd:true as const,dabs:[],strokeEndSample:{...d,baseSize:20}},{strokeEnd:true as const,dabs:[],strokeEndSamplePacked:packStrokeEndSample({...d,baseSize:20})}]){expect(storage.acceptsExecutionInputs('room','author',{...base,...packet})).toBe(true);expect(storage.acceptsExecutionInputs('room','author',{...base,...packet,brushSource:undefined})).toBe(false);expect(storage.acceptsExecutionInputs('room','author',{...base,...packet,brushSource:{version:1,pattern:{version:1,kind:'none'}}})).toBe(false)}
 const none={version:1 as const,pattern:{version:1 as const,kind:'none' as const}};expect(storage.acceptsExecutionInputs('room','author',{...base,dabs:[d],brushSource:none,strokeId:createBrushSourceNonce('ownPatternNone158',none)})).toBe(true)
 storage.pin('unpublished','author',[preset]);expect(storage.acceptsExecutionInputs('unpublished','author',{...base,dabs:[d]})).toBe(false)
 const before=storage.library('rooms','room');const bad=source();bad.payloads[bad.assets[0].id.slice(6)]=Buffer.alloc(16,255).toString('base64');expect(()=>storage.pin('room','author',[],undefined,bad)).toThrow('Corrupt');expect(storage.library('rooms','room')).toEqual(before)
 const foreign=source();delete foreign.payloads[foreign.assets[0].id.slice(6)];expect(()=>storage.pin('foreign','author',[preset],undefined,foreign)).toThrow('not owned')
 }finally{rmSync(dir,{recursive:true,force:true})}
})
