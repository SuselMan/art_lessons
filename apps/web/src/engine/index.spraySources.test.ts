import{it,expect,vi}from'vitest'
import{createBrushRandomStrokeId,createBrushSourceNonce,type BrushDescriptor,type BrushSourceContext}from'@grafetto/shared'
import{installBrushLibrary,installBrushPixels}from'./brushLibrary'
import{digitalBrushFromPreset}from'./src/presets/digitalBrushPresets'
import{createTestEngine,paperReady,makeLayerAdd,makeStroke,dab,pointerSample}from'./testing/engineTestUtils'
import{SpraySourceAtlas}from'./src/dabs/SpraySourceAtlas'
import{SprayImageBatch}from'./src/dabs/SprayImageBatch'
import{SprayRequestPainter}from'./src/dabs/SprayRequestPainter'
import{SpraySourceBatch}from'./src/dabs/SpraySourceBatch'
const lut=Array.from({length:257},(_,i)=>Math.round(i/256*65535).toString(16).padStart(4,'0')).join(''),seeds={version:1 as const,sequentialSeed:7,strokeSeed:9}
function descriptor(count=3):BrushDescriptor{return{...digitalBrushFromPreset('hard-round'),id:'imported-'+(count?'cd':'ce').repeat(12),version:76,model:'stamp',paperInteraction:0,behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}},spray:{version:1,diameter:20,scale:1,aspect:1,angle:0,count,jitter:0,radial:{maximum:1,samples:lut},angular:lut,particle:{shape:'ellipse',width:4,height:4,proportional:false},dynamics:{randomSize:false,fixedAngle:0,randomAngle:0,radialAngle:0,pathAngle:0},color:{perParticle:true,hue:.1,saturation:0,value:.1,randomOpacity:true,sampleInput:true,mixBackground:true,fillBackground:true}}}}
function install(brush:BrushDescriptor){installBrushLibrary({schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Own Spray source integration',source:'qa',warnings:[],descriptor:brush}]})}
const source:BrushSourceContext={version:1,background:[10,80,140,128]}
function stroke(brush:BrushDescriptor,points=2){return makeStroke('peer','ink',Array.from({length:points},(_,i)=>dab(25+i*10,24,{size:20,pressure:.5,opacity:.4})),{tool:'digitalBrush',preset:`brush:${brush.id}@76`,color:[1,0,0],strokeEnd:true,brushRandom:seeds,brushSource:source,strokeId:createBrushRandomStrokeId(createBrushSourceNonce('sprayclosed123',source),seeds)})}
it('prewarms actual source pipeline without draws and captures generic background through the author API',async()=>{
 const brush=descriptor();install(brush);const{engine}=createTestEngine({}, {width:96,height:64})
 try{await paperReady(engine);engine.initLayer('ink');engine.setActiveLayer('ink');engine.setTool('digitalBrush');engine.setPencil(`brush:${brush.id}@76`);engine.setBrushBackground([10,80,140,128]);const capture=engine['_captureAuthorStart'](pointerSample(20,20),0);expect(capture?.brushSource?.background).toEqual([10,80,140,128]);const collect=vi.spyOn(SpraySourceAtlas.prototype,'collect'),paint=vi.spyOn(SpraySourceBatch.prototype,'paint'),images=vi.spyOn(SprayImageBatch.prototype,'paint'),transfer=vi.spyOn(SpraySourceBatch.prototype,'transfer');try{await expect(engine.prepareBrush(`brush:${brush.id}@76`)).resolves.toEqual({status:'ready'});expect(collect).not.toHaveBeenCalled();expect(paint).not.toHaveBeenCalled();expect(images).not.toHaveBeenCalled();expect(transfer).not.toHaveBeenCalled()}finally{collect.mockRestore();paint.mockRestore();images.mockRestore();transfer.mockRestore()}
 }finally{engine.destroy()}
})
it('replays each actual request through one source collection before target transfer, with captured palette and unchanged carry on peer/cold',async()=>{
 const brush=descriptor();install(brush);const actors=[createTestEngine({}, {width:96,height:64}),createTestEngine({}, {width:96,height:64}),createTestEngine({}, {width:96,height:64})],collect=vi.spyOn(SpraySourceAtlas.prototype,'collect'),paint=vi.spyOn(SpraySourceBatch.prototype,'paint'),transfer=vi.spyOn(SpraySourceBatch.prototype,'transfer'),request=vi.spyOn(SprayRequestPainter.prototype,'paint')
 const operation=stroke(brush),results:unknown[]=[]
 try{for(const{engine}of actors){await paperReady(engine);engine.setBrushBackground([255,0,0,255]);engine.appendOperation(makeLayerAdd('peer','ink'));const from=collect.mock.calls.length,at=request.mock.calls.length;engine.appendOperation(JSON.parse(JSON.stringify(operation)),'remote');expect(collect.mock.calls.length-from).toBe(2);const state=request.mock.calls[at][3];results.push({sequence:state.dabSequence,carry:state.sprayPainterOpacity,previous:state.previous});expect(state.dabSequence).toBe(2)}
 expect(results[1]).toEqual(results[0]);expect(results[2]).toEqual(results[0]);expect(collect.mock.invocationCallOrder[0]).toBeLessThan(transfer.mock.invocationCallOrder[0]);const styles=paint.mock.calls.map(c=>c[1]);expect(styles.some(s=>s.background[0]===10/255&&s.background[1]===80/255&&s.background[2]===140/255)).toBe(true);expect(styles.some(s=>s.sample&&s.mix)).toBe(true);expect(styles.some(s=>!s.sample&&!s.mix&&s.foreground[3]===128/255)).toBe(true)
 }finally{for(const{engine}of actors)engine.destroy();collect.mockRestore();paint.mockRestore();transfer.mockRestore();request.mockRestore()}
})
it('zero population still draws background without source atlas or fake particles, once per logical request',async()=>{
 const brush=descriptor(0);install(brush);const{engine}=createTestEngine({}, {width:96,height:64}),collect=vi.spyOn(SpraySourceAtlas.prototype,'collect'),paint=vi.spyOn(SpraySourceBatch.prototype,'paint'),request=vi.spyOn(SprayRequestPainter.prototype,'paint')
 try{await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'));engine.appendOperation(stroke(brush,1),'remote');expect(collect).not.toHaveBeenCalled();expect(paint.mock.calls.length).toBeGreaterThan(0);expect(paint.mock.calls.every(c=>!c[1].sample&&!c[1].mix&&c[0].length===1)).toBe(true);expect(request.mock.calls[0][3].dabSequence).toBe(1);expect(request.mock.calls[0][3].sprayPainterOpacity).toBeUndefined()}
 finally{engine.destroy();collect.mockRestore();paint.mockRestore();request.mockRestore()}
})
it('source throw undefined leaves the actual request counters/carry unconsumed and makes no target transfers',async()=>{
 const brush=descriptor();install(brush);const{engine}=createTestEngine({}, {width:96,height:64}),collect=vi.spyOn(SpraySourceAtlas.prototype,'collect').mockImplementation(()=>{throw undefined}),request=vi.spyOn(SprayRequestPainter.prototype,'paint'),transfer=vi.spyOn(SpraySourceBatch.prototype,'transfer')
 try{await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'));let caught=false;try{engine.appendOperation(stroke(brush,1),'remote')}catch(error){caught=true;expect(error).toBeUndefined()}expect(caught).toBe(true);expect(request.mock.calls[0][3].dabSequence).toBeUndefined();expect(request.mock.calls[0][3].sprayPainterOpacity).toBeUndefined();expect(transfer).not.toHaveBeenCalled()}
 finally{engine.destroy();collect.mockRestore();request.mockRestore();transfer.mockRestore()}
})

it('prepares original CAS RGB on recorded peer and cold paint without author selection or source-ink tint',async()=>{
 const base=descriptor(),ids=Array.from({length:4},(_,i)=>`asset:${(900+i).toString(16).padStart(64,'0')}`as const)
 if(!base.spray)throw Error('Expected Spray descriptor')
 const brush:BrushDescriptor={...base,id:'imported-'+ 'cf'.repeat(12),tip:{...base.tip,kind:'bitmap',mask:ids[0],color:{planes:[ids[1],ids[2],ids[3]]}},spray:{...base.spray,particle:{...base.spray.particle,shape:'tip',image:true}}}
 installBrushLibrary({schemaVersion:1,assets:ids.map(id=>({id,size:2,file:id.slice(6)+'.bin'})),skipped:[],brushes:[{name:'Own original Spray image',source:'qa',warnings:[],descriptor:brush}]})
 const values=[[128,255,0,64],[200,10,255,100],[100,20,0,150],[50,30,255,200]];ids.forEach((id,i)=>installBrushPixels(id,new Uint8Array(values[i])))
 const actors=[createTestEngine({}, {width:96,height:64}),createTestEngine({}, {width:96,height:64})],collect=vi.spyOn(SpraySourceAtlas.prototype,'collect'),images=vi.spyOn(SprayImageBatch.prototype,'paint')
 try{for(const{engine}of actors){await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'));const start=images.mock.calls.length,upload=vi.spyOn(engine['gl'],'texImage2D');engine.appendOperation(stroke(brush,1),'remote');expect(images.mock.calls.length).toBeGreaterThan(start);const view=images.mock.calls[start][1];expect(view.crop).toEqual({x:0,y:0,width:2,height:2});expect(()=>view.assertCurrent()).not.toThrow();const rgba=(upload.mock.calls as readonly unknown[][]).find(c=>c[2]===engine['gl'].RGBA&&c[3]===2&&c[4]===2&&c[8]instanceof Uint8Array);if(!rgba||!(rgba[8]instanceof Uint8Array))throw Error('Expected genuine prepared original RGBA');expect(Array.from(rgba[8])).toEqual([100,50,25,128,10,20,30,255,0,0,0,0,25,38,50,64]);upload.mockRestore()}expect(collect).not.toHaveBeenCalled()
 }finally{for(const{engine}of actors)engine.destroy();collect.mockRestore();images.mockRestore()}
})
