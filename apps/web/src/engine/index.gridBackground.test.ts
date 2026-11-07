import{it,expect,vi}from'vitest'
import{createBrushSourceNonce,type BrushDescriptor}from'@grafetto/shared'
import{createTestEngine,paperReady,pointerSample,dab,makeLayerAdd,makeStroke}from'./testing/engineTestUtils'
import{installBrushLibrary}from'./brushLibrary'
import{digitalBrushFromPreset}from'./src/presets/digitalBrushPresets'
import{brushExecutionContext,assertBrushExecutionContext}from'./src/presets/brushExecutionContext'
import type{AccumulationBuffer}from'./src/buffers/AccumulationBuffer'
import{GridCellBatch}from'./src/dabs/GridCellBatch'
function descriptor():BrushDescriptor{return{...digitalBrushFromPreset('hard-round'),id:'imported-'+ 'a7'.repeat(12),version:70,model:'mixer',paperInteraction:0,tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}},mixer:{load:0,initialLoad:0,pickup:1,strength:1,source:'previousCanvas'},grid:{version:1,width:20,height:20,scale:1,offset:[0,0],division:2,pressureDivision:false,border:[0,0],randomBorder:false,shape:1,sampleInput:true,colorPerCell:true,randomOpacity:false,fillBackground:true,mixBackground:true,hsv:{hue:.5,saturation:-.2,value:.1}}}}
function install(brush:BrushDescriptor){installBrushLibrary({schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Own captured Grid',source:'qa',warnings:[],descriptor:brush}]})}
it('captures common API background for Grid and requires it on execution',async()=>{
 const brush=descriptor();install(brush);const{engine}=createTestEngine()
 try{await paperReady(engine);engine.initLayer('L');engine.setActiveLayer('L');engine.setTool('digitalBrush');engine.setPencil(`brush:${brush.id}@70`)
 const start=()=>engine['_captureAuthorStart'](pointerSample(10,20),0)?.brushSource
 expect(start()?.background).toEqual([255,255,255,255]);engine.setBrushBackground([10,80,140,128]);const old=start();engine.setBrushBackground([255,0,0,255]);expect(old?.background).toEqual([10,80,140,128]);expect(()=>assertBrushExecutionContext(brush)).toThrow('Grid requires');expect(()=>assertBrushExecutionContext(brush,brushExecutionContext(undefined,old))).not.toThrow()
 }finally{engine.destroy()}
})
it('gathers once, composes background before cells in bounded scratch and transfers request opacity once using recorded colour',async()=>{
 const brush=descriptor();install(brush);const{engine}=createTestEngine({}, {width:96,height:64})
 const paint=vi.spyOn(GridCellBatch.prototype,'paint'),transfer=vi.spyOn(GridCellBatch.prototype,'transfer')
 const painter=engine['_smudge'] as unknown as {gatherPatch:(...args:unknown[])=>void;acquireScratch:(size:number,height?:number)=>AccumulationBuffer;releaseScratch:(buffer:AccumulationBuffer)=>void},gather=vi.spyOn(painter,'gatherPatch'),uniform=vi.spyOn(engine['gl'],'uniform4f'),shader=vi.spyOn(engine['gl'],'shaderSource')
 try{await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'));engine.setBrushBackground([255,0,0,255])
 const source={version:1 as const,background:[10,80,140,128]as const};engine.appendOperation(makeStroke('peer','ink',[dab(32,32,{size:40,pressure:.5,opacity:.4})],{tool:'digitalBrush',preset:`brush:${brush.id}@70`,color:[1,0,0],strokeEnd:true,brushSource:source,strokeId:createBrushSourceNonce('gridcapture123',source)}),'remote')
 expect(gather).toHaveBeenCalledTimes(1);expect(transfer.mock.calls.length).toBeGreaterThan(0)
 expect(paint.mock.calls.length).toBe(transfer.mock.calls.length*2)
 for(let i=0;i<transfer.mock.calls.length;i++){const back=paint.mock.calls[i*2],cells=paint.mock.calls[i*2+1];expect(back[9]).toBe(false);expect(back[11]).toBe(1);expect(cells[11]).toBe(1);expect(cells[12]).toEqual([10/255,80/255,140/255,128/255]);expect(cells[13]).toBe(.5);expect(cells[14]).toBe(true);expect(transfer.mock.calls[i][2]).toBeGreaterThan(0);expect(transfer.mock.calls[i][2]).toBeLessThan(1);expect(back[1]).toBe(cells[1]);expect(transfer.mock.calls[i][0]).toBe(cells[1]);expect(transfer.mock.calls[i][0]).not.toBe(transfer.mock.calls[i][1]);expect(paint.mock.invocationCallOrder[i*2+1]).toBeLessThan(transfer.mock.invocationCallOrder[i])}
 const fragment=shader.mock.calls.map(([,text])=>text).find(text=>text.includes('uniform vec2 u_mix;'));if(!fragment)throw Error('Expected actual Grid fragment');expect(fragment.indexOf('if(u_mix.x>=0.)')).toBeLessThan(fragment.indexOf('vec3 adjusted='));expect(fragment).toContain('floor((1.-u_mix.x)*255.)');expect(shader.mock.calls.some(([,text])=>text.includes('texture2D(u_source,v_uv)*u_opacity'))).toBe(true)
 const bg=uniform.mock.calls.filter(([loc])=>loc&&Reflect.get(loc,'name')==='u_background');expect(bg.some(([,r,g,b,a])=>r===10/255&&g===80/255&&b===140/255&&a===128/255)).toBe(true)
 }finally{paint.mockRestore();transfer.mockRestore();gather.mockRestore();uniform.mockRestore();shader.mockRestore();engine.destroy()}
})
it('releases request and source scratch if transfer throws, preserving original error',async()=>{
 const brush=descriptor();install(brush);const{engine}=createTestEngine({}, {width:96,height:64}),failure=new Error('grid transfer fault')
 const painter=engine['_smudge'] as unknown as {gatherPatch:(...args:unknown[])=>void;acquireScratch:(size:number,height?:number)=>AccumulationBuffer;releaseScratch:(buffer:AccumulationBuffer)=>void},acquire=vi.spyOn(painter,'acquireScratch'),release=vi.spyOn(painter,'releaseScratch'),transfer=vi.spyOn(GridCellBatch.prototype,'transfer').mockImplementation(()=>{throw failure})
 try{await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'));const source={version:1 as const,background:[10,80,140,128]as const};expect(()=>engine.appendOperation(makeStroke('peer','ink',[dab(32,32,{size:20,pressure:.5})],{tool:'digitalBrush',preset:`brush:${brush.id}@70`,color:[1,0,0],strokeEnd:true,brushSource:source,strokeId:createBrushSourceNonce('gridfault12345',source)}),'remote')).toThrow(failure)
 const buffers=acquire.mock.results.filter(r=>r.type==='return').map(r=>r.value);expect(buffers.length).toBeGreaterThanOrEqual(2);for(const b of buffers)expect(release.mock.calls.filter(([value])=>value===b)).toHaveLength(1)
 }finally{transfer.mockRestore();acquire.mockRestore();release.mockRestore();engine.destroy()}
})
