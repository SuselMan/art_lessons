import{it,expect}from'vitest'
import{mkdtempSync,rmSync}from'node:fs'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{createHash}from'node:crypto'
import{packDabs,type BrushDescriptor,type BrushLibrary,type Dab,type StrokeOperation}from'@grafetto/shared'
import{BrushStorage}from'./storage.js'
it('requires existing captured root sourceAngle on raw packed and endpoint packets for closed120 child pair',()=>{
 const dir=mkdtempSync(join(tmpdir(),'child120-'));try{const bytes=Buffer.from([255,0,0,0,128,0,0,0,0,0,0,0,0,0,0,0]),hash=createHash('sha256').update(bytes).digest('hex'),id=`asset:${hash}`as const
 const part=():BrushDescriptor=>({id:'imported-120120120120120120120120',version:120,model:'stamp',category:'paint',tip:{kind:'bitmap',mask:id,hardness:1,aspect:2,angle:0,rotation:'path'},paperInteraction:0,spacing:.5,flow:1,flowPer:'pass',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],behavior:{version:2,strokeInput:{version:1,initialDirection:'cursorHistory'},rotation:{follow:1,random:'none'},rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}})
 const root=part(),child=part();child.id='imported-121121121121121121121121';child.behavior!.rendering!.accumulation='alphaDarken';root.behavior!.dual={brush:child,sampling:'independent',blendMode:'multiply'};const library:BrushLibrary={schemaVersion:1,assets:[{id,size:4,file:hash+'.bin'}],skipped:[],brushes:[{name:'Own120',source:'Own.kpp',warnings:[],descriptor:root}]},storage=new BrushStorage(dir);storage.install('author',library,new Map([[hash,bytes]]));const preset='brush:'+root.id+'@120';storage.pin('room','author',[preset]);const d:Dab={x:0,y:0,size:4,pressure:1,angle:0,tiltX:0,tiltY:0,aspectRatio:1,sourceAngle:Math.PI/2,opacity:1,t:0},base:StrokeOperation={id:'op120',type:'stroke',userId:'author',timestamp:0,layerId:'ink',tool:'digitalBrush',preset,color:[0,0,0],strokeId:'legacy-source-channel'}
 for(const packet of[{dabs:[d]},{dabsPacked:packDabs([d])},{dabs:[],strokeEndSample:{...d,baseSize:4}}])expect(storage.acceptsExecutionInputs('room','author',{...base,...packet})).toBe(true)
 const missing={...d,sourceAngle:undefined};for(const packet of[{dabs:[missing]},{dabsPacked:packDabs([missing])},{dabs:[],strokeEndSample:{...missing,baseSize:4}}])expect(storage.acceptsExecutionInputs('room','author',{...base,...packet})).toBe(false)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
