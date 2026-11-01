import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {inflateSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {canonicalImageSourceBinding,canonicalImagePipeSourceBinding,canonicalSourceComposition,isBrushLibrary,canonicalBrushDescriptorJSON,CANONICAL_STROKE_RASTER_PROFILE,type BrushDescriptor,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type ServerToClientEvents,} from '@grafetto/shared'
import stock from '../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import fixture from './src/presets/fixtures/sourcePngWholePath/guiStroke.native.json'
import mountains from './src/presets/fixtures/sourceImagePipe/mountains.native.json'
import graphite from './src/presets/fixtures/sourceImagePipe/pencilRandom.native.json'
import {sourceStrokeAuthorDescriptor} from './src/presets/sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceStrokeAuthorState,type SourceStrokeAuthorStep} from './src/presets/sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter,type SourceStrokeMaterialContextV2} from './src/presets/sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder} from './src/presets/sourceCanonicalFrameEncoder'
import {installBrushPixels,clearImportedBrushPixels,installBrushLibrary} from './src/presets/importedBrushes'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {createTestEngine} from './testing/engineTestUtils'
const descriptor=fixture.descriptor as unknown as BrushDescriptor
const binding=canonicalImageSourceBinding(descriptor,fixture.asset)
const asset=binding.assets[0]
function sourceTrace(){
 const compiled=sourceStrokeAuthorDescriptor(descriptor,{asset:fixture.asset,colorIdentity:'native-GUI-black',lodScale:1,inputProfile:'krita-freehand-no-smoothing-v1'})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const program=compiled.program,author=new SourceStrokeAuthor(program)
 let state=author.createState(4321,7654,.3)
 const material:SourceStrokeMaterialContextV2={version:2,...binding,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'layer-1',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'original-basic6',boardEpoch:1,descriptorSha256:createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex'),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},assets:material.assets,materialVersion:2,material}
 const adapter=new SourceStrokeMaterialAdapter(program,material,state),encoder=new SourceCanonicalFrameEncoder({...snapshot,material})
 const operations:CanonicalStrokeOperation[]=[];let draws=0
 const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const chunk of chunks){const accepted=encoder.encode(chunk.packed);draws+=accepted.frame.draws.length;operations.push({id:'image-'+operations.length,userId:'author',timestamp:0,seq:operations.length+1,type:'canonical_stroke',layerId:'layer-1',frame:accepted.envelope})}}
 const consume=(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>)=>{while(true){const step=iterator.next();if(step.done){state=step.value;return}accept(adapter.accept(step.value));const cut=adapter.flush();if(cut)accept([cut])}}
 const f32=(bits:number)=>new Float32Array(new Uint32Array([bits]).buffer)[0],m=fixture.mapping
 for(const [xb,yb,t,pb] of fixture.packets.slice(0,-1)){accept(adapter.beginInput(state));consume(author.plan(state,{x:m.a*f32(xb)+m.c*f32(yb)+m.tx,y:m.b*f32(xb)+m.d*f32(yb)+m.ty,t,pressure:f32(pb),tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false}))}
 accept(adapter.beginInput(state));consume(author.finish(state));accept(adapter.finish(state))
 expect(operations).toHaveLength(fixture.frames);expect(draws).toBe(fixture.draws)
 return {operations,snapshot}
}
const trace=sourceTrace()

const bytes=new Uint8Array(inflateSync(Buffer.from(fixture.asset.deflateBase64,'base64'),{maxOutputLength:65536}))
beforeEach(()=>{expect('asset:'+createHash('sha256').update(bytes).digest('hex')).toBe(asset.id);installBrushPixels(asset.id,bytes)})
afterEach(()=>{vi.restoreAllMocks();clearImportedBrushPixels()})
function original(isCurrent=()=>true,open=false,inputTrace=trace,limit?:number){
 const tail=limit!==undefined?inputTrace.operations.slice(0,limit):open?inputTrace.operations.slice(0,-1):inputTrace.operations
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:512,canvasHeight:512,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:tail,participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:1},canonicalHistoryBase:{kind:open?'full-room-prefix-v2':'empty-room-prefix-v1',roomId:'room',boardEpoch:1,throughSeq:tail.length,operationCount:tail.length},canonicalCapabilities:{version:1,roomId:'room',boardEpoch:1,capabilities:tail.length?[{originalUserId:'author',snapshot:inputTrace.snapshot}]:[],bindings:tail.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))}}
 return prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent})
}
function engineFor(p:ReturnType<typeof original>,author=false){
 const r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:512,pageHeight:512,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},...(author?{canonicalAuthor:{begin:async()=>{throw Error('Unexpected BEGIN')}},onLocalOperation:vi.fn()}: {})},{width:512,height:512}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 Object.assign(gl,{bufferSubData:vi.fn(),getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,512,512]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 engine.initLayer('background');engine.initLayer('layer-1');engine.setCompositeOrder([{id:'layer-1',opacity:1}]);return r
}
function pipeTrace(name:'mountains'|'graphite'){
 const data=name==='mountains'?mountains:graphite
 const library:unknown={schemaVersion:1,brushes:[{name,source:'original.gih',warnings:[],descriptor:data.descriptor}],assets:data.assets.map(a=>({id:a.id,size:a.size,file:a.id.slice(6)+'.bin'})),skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid original GIH library')
 const d=library.brushes[0].descriptor,binding=canonicalImagePipeSourceBinding(d,library.assets)
 for(const a of data.assets){const bytes=new Uint8Array(inflateSync(Buffer.from(a.deflateBase64,'base64'),{maxOutputLength:a.size*a.size}));expect('asset:'+createHash('sha256').update(bytes).digest('hex')).toBe(a.id);installBrushPixels(a.id,bytes)}
 const compiled=sourceStrokeAuthorDescriptor(d,{assets:data.assets,colorIdentity:'black',lodScale:1,inputProfile:'krita-freehand-no-smoothing-v1'})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const author=new SourceStrokeAuthor(compiled.program);let state=author.createState(1,2,0)
 const material:SourceStrokeMaterialContextV2={version:2,...binding,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}
 const snapshot:CanonicalStrokeSnapshotV2={...trace.snapshot,brush:'brush:'+d.id+'@'+d.version,strokeId:'original-'+name,descriptorSha256:createHash('sha256').update(canonicalBrushDescriptorJSON(d)).digest('hex'),material,assets:material.assets,composition:{...canonicalSourceComposition(d)!,alphaDarken:'creamy',outerResourceOpacity:1}}
 const adapter=new SourceStrokeMaterialAdapter(compiled.program,material,state),encoder=new SourceCanonicalFrameEncoder({...snapshot,material}),operations:CanonicalStrokeOperation[]=[],selected=new Set<string>()
 const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const chunk of chunks){const accepted=encoder.encode(chunk.packed);for(const draw of accepted.frame.draws){const recipe=accepted.frame.definitions[draw.definition];if('asset'in recipe)selected.add(recipe.asset)}operations.push({id:name+'-'+operations.length,userId:'author',timestamp:0,seq:operations.length+1,type:'canonical_stroke',layerId:'layer-1',frame:accepted.envelope})}}
 const consume=(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>)=>{while(true){const n=iterator.next();if(n.done){state=n.value;return}accept(adapter.accept(n.value));const chunk=adapter.flush();if(chunk)accept([chunk])}}
 const packet=(x:number,t:number)=>({x,y:80,t,pressure:1,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})
 for(const p of [packet(40,0),packet(name==='mountains'?2040:240,1000)]){accept(adapter.beginInput(state));consume(author.plan(state,p))}
 accept(adapter.beginInput(state));consume(author.finish(state));accept(adapter.finish(state))
 expect(selected.size).toBeGreaterThan(1)
 return{operations,snapshot}
}

function setupRecovery(){
 const p=original(()=>true,false,pipeTrace('mountains')),{engine}=engineFor(p,true),selected=stock.rows.find(row=>row.index===4)!.descriptor as unknown as BrushDescriptor,preset=`brush:${selected.id}@${selected.version}`
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor:selected,name:'Basic2 native',source:'native',warnings:[]}],assets:[],skipped:[]})
 engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(40)
 const lost=vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(false)
 return{engine,p,preset,lose(){lost.mockReturnValue(true);engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}))},restore(){lost.mockReturnValue(false);engine['_handleContextRestored']()}}
}
function pauseRecovery(engine:ReturnType<typeof createTestEngine>['engine']){
 const schedule=engine['_scheduleCanonicalRebuild'];let resume:()=>void=()=>{throw Error('Recovery not scheduled')}
 engine['_scheduleCanonicalRebuild']=job=>{resume=()=>{engine['_scheduleCanonicalRebuild']=schedule;schedule.call(engine,job)}}
 return()=>resume()
}
it('waits selected author preparation for the actual reconstructed image owner publication',async()=>{
 const f=setupRecovery(),{engine,p,preset}=f
 try{
  await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);await expect(engine.prepareBrush(preset)).resolves.toEqual({status:'ready'})
  f.lose();await expect(engine.prepareBrush(preset)).resolves.toEqual({status:'cancelled'})
  const resume=pauseRecovery(engine);f.restore();let settled=false
  const pending=engine.prepareBrush(preset).finally(()=>{settled=true});const outcome=expect(pending).resolves.toEqual({status:'ready'})
  await Promise.resolve();await Promise.resolve();expect(settled).toBe(false);expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_canonicalPreparedAuthor']).toBeUndefined()
  resume();await outcome;expect(engine['_canonicalPixelsReady']).toBe(true);expect(engine['_canonicalPreparedAuthor']?.owner).toBe(engine['_canonicalLayerOwner'])
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)
it('forgets actual displayed old framebuffer handles before restored display/export',async()=>{
 const f=setupRecovery(),{engine,p}=f,gl=engine['gl']
 try{
  await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);engine['_paperWet'].deposit('layer-1',20,20,10,.5,performance.now());engine['_wetTexAt']=0;engine['_display']()
  const old=engine['_screenCache'];expect(old).not.toBeNull();const oldFbo=old!.fbo,oldTexture=old!.texture,oldWet=engine['_wetTex'],entries=engine['_log'].entries;expect(oldWet).not.toBeNull()
  f.lose();expect(engine['_compositeFBO']).toBeNull();expect(engine['_belowCache']).toBeNull();expect(engine['_aboveCache']).toBeNull();expect(engine['_screenCache']).toBeNull();expect(engine['_wetTex']).toBeNull()
  // A real restored context rejects old names; MockGL otherwise accepts all.
  vi.spyOn(gl,'isTexture').mockImplementation(texture=>texture!==oldTexture&&texture!==oldWet)
  const bindFbo=gl.bindFramebuffer.bind(gl),bindTex=gl.bindTexture.bind(gl),bad=vi.fn()
  vi.spyOn(gl,'bindFramebuffer').mockImplementation((target,fbo)=>{if(fbo===oldFbo){bad();throw Error('Dead display framebuffer bound')}bindFbo(target,fbo)})
  vi.spyOn(gl,'bindTexture').mockImplementation((target,texture)=>{if(texture===oldTexture||texture===oldWet){bad();throw Error('Dead display texture bound')}bindTex(target,texture)})
  const restore=vi.spyOn(engine,'restoreCanonicalEmptyRoom');f.restore();const result=await restore.mock.results[0].value
  expect(result.cleanupFailures).toEqual([]);engine['_display']();const composite=engine['_exporter'].buildContentComposite({x:0,y:0,width:512,height:512});expect(composite).not.toBeNull();composite?.buffer.destroy()
  expect(bad).not.toHaveBeenCalled();expect(engine['_compositeFBO']).toBeNull();expect(engine['_screenCache']).not.toBe(old);expect(engine['_log'].entries).toBe(entries);expect(engine['_canonicalExportReady']()).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)
it('aborted waiting caller allocates no source program after successful recovery',async()=>{
 const f=setupRecovery(),{engine,p,preset}=f
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);const baselineCpu=engine['_brushMipCache'].reservedBytes;f.lose();const resume=pauseRecovery(engine);f.restore()
  const controller=new AbortController(),pending=engine.prepareBrush(preset,{signal:controller.signal}),outcome=expect(pending).resolves.toEqual({status:'cancelled'});controller.abort();resume();await outcome
  await vi.waitFor(()=>expect(engine['_canonicalPixelsReady']).toBe(true),{timeout:20000});expect(engine['_canonicalPreparedAuthor']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(baselineCpu)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)
it('propagates failed real reconstruction without preparing a source on its absent owner',async()=>{
 const f=setupRecovery(),{engine,p,preset}=f
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);f.lose();const resume=pauseRecovery(engine);f.restore()
  const pending=engine.prepareBrush(preset),outcome=expect(pending).rejects.toThrow('Canonical baseline image asset unavailable');clearImportedBrushPixels();resume();await outcome
  expect(engine['_canonicalPreparedAuthor']).toBeUndefined();expect(engine['_canonicalPixelsReady']).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)
it('twice loss cancels the old waiter instead of preparing the newer restored owner',async()=>{
 const f=setupRecovery(),{engine,p,preset}=f
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);f.lose();const schedule=engine['_scheduleCanonicalRebuild'],resumeFirst=pauseRecovery(engine);f.restore()
  const old=engine.prepareBrush(preset),oldOutcome=expect(old).resolves.toEqual({status:'cancelled'})
  f.lose();engine['_scheduleCanonicalRebuild']=schedule;const resumeSecond=pauseRecovery(engine);f.restore();let newSettled=false;const newer=engine.prepareBrush(preset).finally(()=>{newSettled=true}),newOutcome=expect(newer).resolves.toEqual({status:'ready'});await oldOutcome;await Promise.resolve();expect(newSettled).toBe(false);expect(engine['_canonicalPixelsReady']).toBe(false);expect(engine['_canonicalPreparedAuthor']).toBeUndefined();resumeSecond();await newOutcome;expect(engine['_canonicalPreparedAuthor']?.owner).toBe(engine['_canonicalLayerOwner']);expect(resumeFirst).toBeTypeOf('function')
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)
it('keeps canonical display copies absent across real display content export and backing resize',async()=>{
 const p=original(),{engine}=engineFor(p)
 try{
  expect(engine['_compositeFBO']).toBeNull();expect(engine['_belowCache']).toBeNull();expect(engine['_aboveCache']).toBeNull()
  await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  engine['_display']();expect(engine['_assemblyFBO']).toBeDefined();expect(engine['_screenCache']).not.toBeNull()
  expect(engine['_compositeFBO']).toBeNull();expect(engine['_belowCache']).toBeNull();expect(engine['_aboveCache']).toBeNull()
  const nonempty=engine['_exporter'].buildContentComposite({x:0,y:0,width:512,height:512});expect(nonempty).not.toBeNull();nonempty?.buffer.destroy();expect(engine['_compositeFBO']).toBeNull()
  engine.resizeCanvas(640,480);expect(engine['_compositeFBO']).toBeNull();expect(engine['_belowCache']).toBeNull();expect(engine['_aboveCache']).toBeNull()
  engine['_display']();expect(engine['_screenCache']!.width).toBe(640);expect(engine['_assemblyFBO'].width).toBe(800)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)
it('exports actual bounded empty paper and transparency without demanding a viewport copy',async()=>{
 const p=original(()=>true,false,trace,0),{engine}=engineFor(p)
 try{
  await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const encode=vi.spyOn(engine['_exporter']['ctx'],'encode').mockResolvedValue(new Blob(['recording-GL encoder seam'])),compose=vi.spyOn(engine['_exporter']['ctx'],'composeScreen'),read=vi.spyOn(engine['gl'],'readPixels')
  await engine.exportPNG(false);await engine.exportPNG(true)
  expect(encode).toHaveBeenCalledTimes(2);expect(read).toHaveBeenCalledTimes(2);expect(compose).not.toHaveBeenCalled()
  expect(engine['_compositeFBO']).toBeNull();expect(engine['_belowCache']).toBeNull();expect(engine['_aboveCache']).toBeNull()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)
it('preserves legacy eager display allocation across a real backing resize',async()=>{
 const {engine}=createTestEngine({pageWidth:512,pageHeight:512},{width:512,height:512})
 try{
  await engine.paperReady();expect(engine['_compositeFBO']).not.toBeNull();expect(engine['_belowCache']).not.toBeNull();expect(engine['_aboveCache']).not.toBeNull()
  engine.resizeCanvas(640,480);expect(engine['_compositeFBO']!.width).toBe(640);expect(engine['_belowCache']!.width).toBe(800);expect(engine['_aboveCache']!.height).toBe(800)
 }finally{engine.destroy()}
})

it('keeps the genuine legacy infinite empty transparent viewport fallback',async()=>{
 const {engine}=createTestEngine({infinite:true},{width:64,height:64})
 try{
  await engine.paperReady();const compose=vi.spyOn(engine['_exporter']['ctx'],'composeScreen'),canvasBlob=vi.spyOn(engine['_exporter']['ctx'],'canvasBlob')
  await engine.exportPNG(false);expect(compose).not.toHaveBeenCalled()
  await engine.exportPNG(true);expect(compose).toHaveBeenCalledOnce();expect(canvasBlob).toHaveBeenCalledTimes(2);expect(engine['_compositeFBO']).not.toBeNull()
 }finally{engine.destroy()}
})
