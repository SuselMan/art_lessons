import{it,expect}from'vitest'
import{mkdtempSync,rmSync}from'node:fs'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{createHash}from'node:crypto'
import{packDabs,createBrushRandomStrokeId,type BrushLibrary,type StrokeOperation,type Dab}from'@grafetto/shared'
import{BrushStorage}from'./storage.js'
it('requires captured seed identity and complete tensor115 source union in raw packed and endpoint packets',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gih-dimensions113-'))
 try{
  const storage=new BrushStorage(dir),bytes=Buffer.from([255,128,64,255]),hash=createHash('sha256').update(bytes).digest('hex'),id=`asset:${hash}`as const
  const library:BrushLibrary={schemaVersion:1,assets:[{id,size:2,file:hash+'.bin'}],skipped:[],brushes:[{name:'Own113',source:'authored.kpp',warnings:[],descriptor:{id:'imported-113113113113113113113113',version:115,model:'stamp',category:'paint',tip:{kind:'bitmap',mask:id,hardness:1,aspect:1,angle:0,rotation:'fixed',animation:{mode:'dimensions',randomPolicy:'grafetto-dim-stream-v1',dimensions:[{mode:'random',rank:2},{mode:'xtilt',rank:2},{mode:'velocity',rank:2},{mode:'angular',rank:2}],frames:[id],cursorPolicy:'first-request-v1',roundingPolicy:'qt5-half-up-v1'}},paperInteraction:0,spacing:.1,flow:1,flowPer:'pass',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,strokeInput:{version:1,initialDirection:'cursorHistory'},speedInput:{version:1,space:'view',maximum:30,estimator:'grafettoEMA30ms'},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}}]}
  storage.install('author',library,new Map([[hash,bytes]]));const preset='brush:'+library.brushes[0].descriptor.id+'@115';storage.pin('room','author',[preset])
  const seeds={version:1 as const,sequentialSeed:29,strokeSeed:123456789}
  const d:Dab={x:1,y:2,size:10,pressure:1,tiltX:-2,tiltY:0,sourceAngle:.123456789012345,normalizedSpeed:.5,angle:0,aspectRatio:1,opacity:1,t:0},base:StrokeOperation={id:'op113',type:'stroke',userId:'author',timestamp:0,layerId:'ink',tool:'digitalBrush',preset,color:[0,0,0],strokeId:createBrushRandomStrokeId('tensor115_nonce',seeds),brushRandom:seeds}
  for(const badContext of[{...base,brushRandom:undefined},{...base,brushRandom:{...seeds,strokeSeed:seeds.strokeSeed+1}},{...base,strokeId:'legacy-unbound'}])for(const packet of[{dabs:[d]},{dabsPacked:packDabs([d])},{dabs:[],strokeEndSample:{...d,baseSize:10}}])expect(storage.acceptsExecutionInputs('room','author',{...badContext,...packet})).toBe(false)
  for(const bad of[{...d,sourceAngle:undefined},{...d,normalizedSpeed:undefined}]){
   for(const packet of[{dabs:[bad]},{dabsPacked:packDabs([bad])},{dabs:[],strokeEndSample:{...bad,baseSize:10}}])expect(storage.acceptsExecutionInputs('room','author',{...base,...packet})).toBe(false)
  }
  for(const bad of[{...d,tiltX:1073741824},{...d,tiltX:NaN}])expect(storage.acceptsExecutionInputs('room','author',{...base,dabs:[bad]})).toBe(false)
  for(const tiltX of[91.93536376953125,-96.094,101.520]){const captured={...d,tiltX};for(const packet of[{dabs:[captured]},{dabsPacked:packDabs([captured])},{dabs:[],strokeEndSample:{...captured,baseSize:10}}])expect(storage.acceptsExecutionInputs('room','author',{...base,...packet})).toBe(true)}
  for(const packet of[{dabs:[d]},{dabsPacked:packDabs([d])},{dabs:[],strokeEndSample:{...d,baseSize:10}}])expect(storage.acceptsExecutionInputs('room','author',{...base,...packet})).toBe(true)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
