import{afterEach,expect,it,vi}from'vitest'
import{createBrushRandomStrokeId,type BrushDescriptor}from'@grafetto/shared'
import{installBrushLibrary}from'./brushLibrary'
import{digitalBrushFromPreset}from'./src/presets/digitalBrushPresets'
import{BrushBehaviorPainter}from'./src/dabs/BrushBehaviorPainter'
import{createTestEngine,dab,makeLayerAdd,makeStroke,paperReady}from'./testing/engineTestUtils'
const brush:BrushDescriptor={...digitalBrushFromPreset('hard-round'),id:'imported-7474747474747474',version:74,model:'stamp',paperInteraction:0,flowPer:'stamp',scatter:undefined,texture:undefined,wet:undefined,tip:{kind:'procedural',hardness:1,aspect:1,angle:0,rotation:'fixed',profile:{kind:'standard',shape:'ellipse',horizontalFade:1,verticalFade:1,antialias:false},autoNoise:{version:1,density:.5,randomness:.25}},behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}}
installBrushLibrary({schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Captured Pixel noise',source:'qa',warnings:[],descriptor:brush}]})
const preset='brush:'+brush.id+'@74',seeds={version:1 as const,sequentialSeed:0,strokeSeed:3826167899}
afterEach(()=>vi.restoreAllMocks())
it('prepares a never-selected recorded noise brush before the common painter',()=>{
 const events:string[]=[]
 vi.spyOn(BrushBehaviorPainter.prototype,'prepareStampEffects').mockImplementation(()=>{events.push('prepare')})
 vi.spyOn(BrushBehaviorPainter.prototype,'paint').mockImplementation(()=>{events.push('paint')})
 const{engine}=createTestEngine({userId:'observer'},{width:64,height:64})
 try{engine.appendOperation(makeLayerAdd('peer','ink'));engine.appendOperation(makeStroke('peer','ink',[dab(20,20,{size:8}),dab(24,20,{size:8})],{tool:'digitalBrush',preset,strokeId:createBrushRandomStrokeId('noisecold1',seeds),brushRandom:seeds,strokeEnd:true}),'remote');expect(events).toContain('paint');expect(events[0]).toBe('prepare')}finally{engine.destroy()}
})
it('never reports a failed selected noise prewarm as ready',async()=>{
 vi.spyOn(BrushBehaviorPainter.prototype,'prepareStampEffects').mockImplementation(()=>{throw undefined})
 const{engine}=createTestEngine({userId:'observer'},{width:64,height:64})
 try{await paperReady(engine);await expect(engine.prepareBrush(preset)).rejects.toBeUndefined()}finally{engine.destroy()}
})
