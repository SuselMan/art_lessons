import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {inflateSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {canonicalDefaultAutoSourceBinding,canonicalImageSourceBinding,canonicalImagePipeSourceBinding,canonicalSourceComposition,isBrushLibrary,decodeCanonicalStrokeFrame,canonicalBrushDescriptorJSON,CANONICAL_STROKE_RASTER_PROFILE,type BrushDescriptor,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type ServerToClientEvents,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type Operation} from '@grafetto/shared'
import stock from '../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import fixture from './src/presets/fixtures/sourcePngWholePath/guiStroke.native.json'
import mountains from './src/presets/fixtures/sourceImagePipe/mountains.native.json'
import graphite from './src/presets/fixtures/sourceImagePipe/pencilRandom.native.json'
import {prepareCanonicalRecordedAttachment} from '@grafetto/shared'
import {attachCanonicalRecordedDelivery} from '../pages/Room/net/canonicalRecordedDelivery'
import {sourceStrokeAuthorDescriptor} from './src/presets/sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceStrokeAuthorState,type SourceStrokeAuthorStep} from './src/presets/sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter,type SourceStrokeMaterialContextV2} from './src/presets/sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder} from './src/presets/sourceCanonicalFrameEncoder'
import {installBrushPixels,clearImportedBrushPixels,installBrushLibrary} from './src/presets/importedBrushes'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {CanonicalMaskSourceBank} from './src/dabs/CanonicalMaskSourceBank'
import {createTestEngine} from './testing/engineTestUtils'
import {PencilEngine} from './index'
import type {PointerData} from './src/input/PointerInput'
const descriptor=fixture.descriptor as unknown as BrushDescriptor
const binding=canonicalImageSourceBinding(descriptor,fixture.asset)
const asset=binding.assets[0]
function uploadedPixels(args:readonly unknown[]){return args[8]}
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
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:512,canvasHeight:512,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:tail,participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:1},canonicalHistoryBase:{kind:open?'full-room-prefix-v2':'empty-room-prefix-v1',roomId:'room',boardEpoch:1,throughSeq:tail.length,operationCount:tail.length},canonicalCapabilities:{version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:inputTrace.snapshot}],bindings:tail.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))}}
 return prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent})
}
function engineFor(p:ReturnType<typeof original>,author=false){
 const r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:512,pageHeight:512,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},...(author?{canonicalAuthor:{begin:async()=>{throw Error('Unexpected BEGIN')}},onLocalOperation:vi.fn()}: {})},{width:512,height:512}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 Object.assign(gl,{bufferSubData:vi.fn(),getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,512,512]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 engine.initLayer('background');engine.initLayer('layer-1');engine.setCompositeOrder([{id:'layer-1',opacity:1}]);return r
}
it('restores actual Basic6 original163 envelopes using one bank and retains every original read/input/server placement',async()=>{
 const p=original(),{engine}=engineFor(p),upload=vi.spyOn(engine['gl'],'texImage2D'),draw=vi.spyOn(engine['gl'],'drawArrays'),before=trace.operations.map(op=>op.frame.materialPacked)
 try{
  await engine.paperReady();upload.mockClear();draw.mockClear();const restored=await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  expect(restored.cleanupFailures).toEqual([]);expect(engine['_canonicalPixelsReady']).toBe(true);expect(engine['_canonicalLayerOwner']?.bank).toBeInstanceOf(CanonicalMaskSourceBank)
  expect(engine['_canonicalLayerOwner']!.bank!.assertSourceBinding(asset,{gl:engine['gl'],cache:engine['_canonicalLayerOwner']!.cache,cpu:engine['_brushMipCache']})).toBeTypeOf('number')
  expect(engine['_log'].entries).toHaveLength(163);for(const [i,e]of engine['_log'].entries.entries()){expect(e.canonicalInput).toBe(p.canonicalRead.preparedAtoms[i]);expect(e.serverSeq).toBe(i+1);const original=p.tailOperations[i];expect(e.op.type==='canonical_stroke'&&e.op.frame).toBe(original.type==='canonical_stroke'&&original.frame)}
  expect(trace.operations.map(op=>op.frame.materialPacked)).toEqual(before);expect(upload).toHaveBeenCalled();expect(draw).toHaveBeenCalled();expect(engine['_canonicalExportReady']()).toBe(true)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,first=bank.jobs[0];owner.cache.discard(first.key);expect(bank.prepareJob(0)).toBe('ready');expect(bank.assertSourceBinding(asset,{gl:engine['gl'],cache:owner.cache,cpu:engine['_brushMipCache']})).toBeTypeOf('number')
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},15000)
it.each(['missingCAS']as const)('rejects %s image baseline before canvas access',kind=>{
 const p=original();if(kind==='missingCAS')clearImportedBrushPixels()
 const get=vi.fn(()=>{throw Error('Canvas touched')}),canvas=new Proxy({}as HTMLCanvasElement,{get})
 expect(()=>new PencilEngine(canvas,{rasterVersion:'straight-rgba8-v1',pageWidth:512,pageHeight:512,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations}})).toThrow('Canonical baseline image asset unavailable');expect(get).not.toHaveBeenCalled()
})
it.each(['stale','upload']as const)('rolls back %s between source jobs without publishing journal or layer map',async kind=>{
 let current=true;const p=original(()=>current),{engine}=engineFor(p),old=engine['_layers'],prepare=CanonicalMaskSourceBank.prototype.prepareJob;let jobs=0
 vi.spyOn(CanonicalMaskSourceBank.prototype,'prepareJob').mockImplementation(function(this:CanonicalMaskSourceBank,index,signal){if(kind==='upload'&&jobs===1)throw Error('source upload fault');const result=prepare.call(this,index,signal);jobs++;if(kind==='stale'&&jobs===1)current=false;return result})
 try{await expect(engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).rejects.toThrow();expect(jobs).toBeGreaterThan(0);expect(engine['_layers']).toBe(old);expect(engine['_log'].entries).toHaveLength(0);expect(engine['_canonicalPixelsReady']).toBe(false);expect(engine['_canonicalEmptyTransaction']).toBeUndefined()}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},15000)
it('retires the image bank on real engine context events and rebuilds the same accepted original journal',async()=>{
 const p=original(),{engine}=engineFor(p)
 try{await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);const first=engine['_canonicalLayerOwner']!.bank!,entries=engine['_log'].entries,revision=engine['_log'].revision,reset=vi.spyOn(first,'reset')
  const lost=vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(true);engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));expect(reset).toHaveBeenCalledWith(true);expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalPixelsReady']).toBe(false)
  lost.mockReturnValue(false);engine['_handleContextRestored']();await vi.waitFor(()=>expect(engine['_canonicalPixelsReady']).toBe(true),{timeout:12000});expect(engine['_canonicalLayerOwner']!.bank).not.toBe(first);expect(engine['_log'].entries).toBe(entries);expect(engine['_log'].revision).toBe(revision);expect(engine['_log'].entries.every((e,i)=>e.canonicalInput===p.canonicalRead.preparedAtoms[i])).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('refuses Basic2 auto author preparation on the image-only baseline before touching its bank or workspace',async()=>{
 const p=original(),{engine}=engineFor(p,true),selected=stock.rows.find(row=>row.index===4)!.descriptor as unknown as BrushDescriptor,preset=`brush:${selected.id}@${selected.version}`
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor:selected,name:'Basic2 native',source:'native',warnings:[]}],assets:[],skipped:[]})
 try{await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,resources=bank.resources(),capacity=owner.prepass.preparedCapacity(),cpu=engine['_brushMipCache'].reservedBytes,programs=vi.spyOn(engine['gl'],'createProgram')
  engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(40)
  await expect(engine.prepareBrush(preset)).rejects.toThrow('Canonical image baseline workspace replacement unavailable')
  expect(programs).not.toHaveBeenCalled();expect(engine['_brushMipCache'].reservedBytes).toBe(cpu);expect(bank.resources()).toEqual(resources);expect(owner.prepass.preparedCapacity().epoch).toBe(capacity.epoch);expect(engine['_canonicalPreparedAuthor']).toBeUndefined();expect(engine['_canonicalPixelsReady']).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},15000)

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
it.each(['mountains','graphite'] as const)('restores the original %s whole frame union and recovers without any source frame reselection',async name=>{
 const pipe=pipeTrace(name),p=original(()=>true,false,pipe),packed=pipe.operations.map(op=>op.frame.materialPacked),authorPlan=vi.spyOn(SourceStrokeAuthor.prototype,'plan'),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,ids=new Set(bank.jobs.map(job=>job.resource.id))
  expect(ids).toEqual(new Set(pipe.snapshot.assets.map(a=>a.id)));expect(bank.jobs).toHaveLength(pipe.snapshot.assets.length*11)
  expect(engine['_log'].entries.map(e=>e.canonicalInput)).toEqual(p.canonicalRead.preparedAtoms)
  expect(engine['_canonicalExportReady']()).toBe(true)
  const entries=engine['_log'].entries,revision=engine['_log'].revision,lost=vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(true)
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));lost.mockReturnValue(false);engine['_handleContextRestored']()
  await vi.waitFor(()=>expect(engine['_canonicalPixelsReady']).toBe(true),{timeout:20000})
  expect(engine['_log'].entries).toBe(entries);expect(engine['_log'].revision).toBe(revision);expect(pipe.operations.map(op=>op.frame.materialPacked)).toEqual(packed)
  expect(new Set(engine['_canonicalLayerOwner']!.bank!.jobs.map(job=>job.resource.id))).toEqual(ids);expect(authorPlan).not.toHaveBeenCalled()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)
it('prepares all original pipe frames while open and appends the exact selected recorded recipes without reselecting',async()=>{
 const pipe=pipeTrace('mountains'),p=original(()=>true,true,pipe,1),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,upload=vi.spyOn(engine['gl'],'texImage2D'),program=vi.spyOn(engine['gl'],'createProgram')
  const rest=pipe.operations.slice(1),snapshot=pipe.snapshot,attachment={version:1 as const,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot}],bindings:rest.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))}
  const inputs=prepareCanonicalRecordedAttachment(attachment,rest,p.canonicalRead.scope).map(atom=>{const input=attachCanonicalRecordedDelivery(atom,p.canonicalRead.scope);if(!('delivery'in input))throw Error('Missing original delivery');return input})
  for(const input of inputs){expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input);for(let i=0;i<100&&owner.job;i++)engine['_stepCanonicalLayer'](owner.job)}
  for(let i=0;i<1000&&owner.job;i++)engine['_stepCanonicalLayer'](owner.job)
  expect(engine['_log'].entries).toHaveLength(pipe.operations.length);expect(owner.bank).toBe(bank);expect(program).not.toHaveBeenCalled()
  expect(bank.jobs).toHaveLength(44);expect(engine['_canonicalExportReady']()).toBe(true)
  // Draw targets may allocate, but matching original bank preparation uploads no bank texture.
  expect(upload.mock.calls.filter(call=>Number(call[3])>512)).toHaveLength(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)

it('admits actual Basic6 nonempty HOT original continuation and executes mask deposition after its initial control frame',async()=>{
 const p=original(()=>true,true,trace,1),{engine}=engineFor(p),upload=vi.spyOn(engine['gl'],'texImage2D')
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  expect(upload.mock.calls.some(call=>{const data=uploadedPixels(call);return data instanceof Uint8Array&&data.some((value,i)=>i%4===0&&value>0)})).toBe(true)
  const owner=engine['_canonicalLayerOwner']!,deposition=vi.spyOn(owner.composite,'drawSource'),rest=trace.operations.slice(1),snapshot=trace.snapshot
  const attachment={version:1 as const,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot}],bindings:rest.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))}
  const inputs=prepareCanonicalRecordedAttachment(attachment,rest,p.canonicalRead.scope).map(atom=>{const input=attachCanonicalRecordedDelivery(atom,p.canonicalRead.scope);if(!('delivery'in input))throw Error('Missing original input');return input})
  let draws=0
  for(const input of inputs){const op=input.operation;if(op.type!=='canonical_stroke')throw Error('Expected frame');draws+=decodeCanonicalStrokeFrame(op.frame,{rasterProfile:snapshot.rasterProfile,brush:snapshot.brush,strokeId:snapshot.strokeId,frameOrdinal:op.frame.frameOrdinal,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,material:snapshot.material}).frame.draws.length
   expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)
   for(let i=0;i<100&&owner.job;i++)engine['_stepCanonicalLayer'](owner.job)
  }
  for(let i=0;i<1000&&owner.job;i++)engine['_stepCanonicalLayer'](owner.job)
  expect(draws).toBe(fixture.draws);expect(draws).toBeGreaterThan(0)
  expect(deposition.mock.calls.some(([draw])=>draw.source.kind==='maskRgb'&&!!draw.writeBounds&&draw.writeBounds.maxX>draw.writeBounds.minX&&draw.writeBounds.maxY>draw.writeBounds.minY)).toBe(true)
  expect(engine['_log'].entries).toHaveLength(trace.operations.length);expect(engine['_canonicalExportReady']()).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)

it('refuses the actual mixed four/seven-frame bank plus workspace before canvas access',()=>{
 const a=pipeTrace('mountains'),b=pipeTrace('graphite'),operations=[...a.operations,...b.operations.map(op=>({...op,seq:op.seq!+a.operations.length}))],base=original()
 const wire:Parameters<ServerToClientEvents['room_state']>[0]={...base,tailOperations:operations,canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:1,throughSeq:operations.length,operationCount:operations.length},canonicalCapabilities:{version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:a.snapshot},{originalUserId:'author',snapshot:b.snapshot}],bindings:operations.map((op,i)=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:i<a.operations.length?0:1}))}}
 const p=prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent:()=>true}),get=vi.fn(()=>{throw Error('Canvas touched')}),canvas=new Proxy({}as HTMLCanvasElement,{get})
 expect(()=>new PencilEngine(canvas,{rasterVersion:'straight-rgba8-v1',pageWidth:512,pageHeight:512,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations}})).toThrow('Canonical baseline workspace exceeds existing brush budgets')
 expect(get).not.toHaveBeenCalled()
})
it('checks an unselected original pipe frame before canvas access even for an initial control-only prefix',()=>{
 const pipe=pipeTrace('mountains'),p=original(()=>true,true,pipe,1)
 clearImportedBrushPixels()
 for(const a of mountains.assets.slice(0,-1))installBrushPixels(a.id,new Uint8Array(inflateSync(Buffer.from(a.deflateBase64,'base64'),{maxOutputLength:a.size*a.size})))
 const get=vi.fn(()=>{throw Error('Canvas touched')}),canvas=new Proxy({}as HTMLCanvasElement,{get})
 expect(()=>new PencilEngine(canvas,{rasterVersion:'straight-rgba8-v1',pageWidth:512,pageHeight:512,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations}})).toThrow('Canonical baseline image asset unavailable')
 expect(get).not.toHaveBeenCalled()
})
it('rejects a hot mixed bank union before upload and preserves the old original bank, journal and checkpoint',async()=>{
 const a=pipeTrace('mountains'),b=pipeTrace('graphite'),p=original(()=>true,false,a),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,resources=bank.preparedResources(),entries=engine['_log'].entries,cpu=engine['_brushMipCache'].reservedBytes,upload=vi.spyOn(engine['gl'],'texImage2D')
  const operation={...b.operations[0],seq:a.operations.length+1},attachment={version:1 as const,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:b.snapshot}],bindings:[{operationId:operation.id,sequence:operation.seq,originalUserId:'author',capability:0}]}
  const atom=prepareCanonicalRecordedAttachment(attachment,[operation],p.canonicalRead.scope)[0],input=attachCanonicalRecordedDelivery(atom,p.canonicalRead.scope);if(!('delivery'in input))throw Error('Missing original input')
  await expect(engine.prepareOriginalRecorded(input)).rejects.toThrow(/budget/)
  // Pending normal display may allocate its null PM targets across the await;
  // no bank pixel upload is permitted before this failed source admission.
  expect(upload.mock.calls.filter(call=>uploadedPixels(call)!==null)).toHaveLength(0);expect(owner.bank).toBe(bank);expect(bank.preparedResources()).toEqual(resources);expect(engine['_log'].entries).toBe(entries);expect(engine['_brushMipCache'].reservedBytes).toBe(cpu);expect(owner.resourceCandidate).toBeUndefined();expect(engine['_canonicalExportReady']()).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)

const autoDescriptor=stock.rows.find(row=>row.index===4)!.descriptor as unknown as BrushDescriptor
const autoPreset='brush:'+autoDescriptor.id+'@'+autoDescriptor.version
const autoSha=createHash('sha256').update(canonicalBrushDescriptorJSON(autoDescriptor)).digest('hex')
const autoPin=canonicalDefaultAutoSourceBinding(autoDescriptor,autoSha,'neon64-f32-fma-v1')
function verdict(request:CanonicalStrokeBegin):CanonicalStrokeBeginResult{return{ok:true,recordedNext:0,liveNext:0,ended:false,snapshot:{layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,boardEpoch:2,descriptorSha256:autoSha,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,composition:{mode:'wash',alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity,outerBlend:'over'},assets:[],materialVersion:2,material:{version:2,assets:[],primarySource:autoPin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}}}}
function packet(x:number,timeStamp:number):PointerData{return{x,y:2,pressure:.5,tiltX:0,tiltY:0,speed:0,pointerType:'pen',timeStamp,dispatchTime:timeStamp}}
it('reuses the actual Mountains workspace and whole bank for native Basic2 local ink and original promotion',async()=>{
 let current=true
 const pipe=pipeTrace('mountains'),p=original(()=>current,false,pipe),{engine}=engineFor(p,true),outgoing:Operation[]=[],snapshots=new Map<string,CanonicalStrokeSnapshotV2>()
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor:autoDescriptor,name:'Basic2',source:'native',warnings:[]}],assets:[],skipped:[]})
 engine['_onLocalOperation']=op=>outgoing.push(op)
 engine['_canonicalAuthorService']={begin:async request=>{const reply=verdict(request);if(!reply.ok)throw Error('fixture');const snapshot={...reply.snapshot,boardEpoch:1};if(!('materialVersion'in snapshot)||snapshot.materialVersion!==2)throw Error('fixture');snapshots.set(request.strokeId,snapshot);return{...reply,snapshot}}}
 try{
  await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,resources=bank.preparedResources(),epoch=owner.prepass.preparedCapacity().epoch,programs=vi.spyOn(engine['gl'],'createProgram'),reset=vi.spyOn(owner.prepass,'reset')
  engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(autoPreset);engine.setSize(40);engine.setLocked(false)
  const cpu=engine['_brushMipCache'].reservedBytes,generation=engine['_brushPreparationGeneration'],aborted=new AbortController();aborted.abort()
  expect(await engine.prepareBrush(autoPreset,{signal:aborted.signal})).toEqual({status:'cancelled'});expect(engine['_brushMipCache'].reservedBytes).toBe(cpu);expect(engine['_brushPreparationGeneration']).toBe(generation)
  expect(await engine.prepareBrush(autoPreset)).toEqual({status:'ready'})
  const preparedBeforeBudget=engine['_canonicalPreparedAuthor'],releaseBudget=engine['_brushMipCache'].reserve(engine['_brushMipCache'].budgetBytes-engine['_brushMipCache'].reservedBytes)
  try{await expect(engine.prepareBrush(autoPreset)).rejects.toThrow(/budget/i);expect(engine['_canonicalPreparedAuthor']).toBe(preparedBeforeBudget);expect(owner.bank).toBe(bank);expect(owner.prepass.preparedCapacity().epoch).toBe(epoch)}finally{releaseBudget()}
  const draw=vi.spyOn(owner.composite,'drawSource')
  for(const offset of [0,100]){engine['_onStart'](packet(30,100+offset));engine['_onMove'](packet(90,110+offset));engine['_onEnd'](packet(90,120+offset))
   await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:10000})
   await vi.waitFor(()=>expect(owner.job).toBeUndefined(),{timeout:10000})}
  expect(snapshots.size).toBe(2);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)
  expect(outgoing.length).toBeGreaterThan(0);expect(draw).toHaveBeenCalled();expect(owner.coordinator?.checkpointReady).toBe(false)
  const deposition=()=>draw.mock.calls.filter(([request])=>request.source.kind==='maskRgb').length
  const before=deposition();expect(before).toBeGreaterThan(0)
  for(const op of outgoing){if(op.type!=='canonical_stroke')throw Error('frame');const snapshot=snapshots.get(op.frame.strokeId)!;const sequence=engine['_log'].entries.length+1,operation={...op,seq:sequence};const atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:op.userId,snapshot}],bindings:[{operationId:op.id,sequence,originalUserId:op.userId,capability:0}]},[operation],p.canonicalRead.scope)[0],input=attachCanonicalRecordedDelivery(atom,p.canonicalRead.scope);if(!('delivery'in input))throw Error('delivery');engine.appendOriginalRecorded(input)}
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:10000})
  expect(deposition()).toBe(before);expect(owner.bank).toBe(bank);expect(bank.preparedResources()).toEqual(resources);expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(reset).not.toHaveBeenCalled();expect(programs).not.toHaveBeenCalled()
  const prepared=engine['_canonicalPreparedAuthor'],reserved=engine['_brushMipCache'].reservedBytes;current=false
  await expect(engine.prepareBrush(autoPreset)).rejects.toThrow();expect(engine['_canonicalPreparedAuthor']).toBe(prepared);expect(engine['_brushMipCache'].reservedBytes).toBe(reserved);expect(owner.bank).toBe(bank)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)
it('rejects actual Graphite-to-Basic2 workspace growth before any author reservation or generation mutation',async()=>{
 const pipe=pipeTrace('graphite'),p=original(()=>true,false,pipe),{engine}=engineFor(p,true)
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor:autoDescriptor,name:'Basic2',source:'native',warnings:[]}],assets:[],skipped:[]})
 try{await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);engine.setTool('digitalBrush');engine.setPencil(autoPreset);engine.setSize(40)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,resources=bank.preparedResources(),epoch=owner.prepass.preparedCapacity().epoch,generation=engine['_brushPreparationGeneration'],cpu=engine['_brushMipCache'].reservedBytes,entries=engine['_log'].entries,reserve=vi.spyOn(engine['_brushMipCache'],'reserve')
  await expect(engine.prepareBrush(autoPreset)).rejects.toThrow('Canonical image baseline workspace replacement unavailable')
  expect(reserve).not.toHaveBeenCalled();expect(engine['_brushPreparationGeneration']).toBe(generation);expect(engine['_brushMipCache'].reservedBytes).toBe(cpu);expect(engine['_log'].entries).toBe(entries);expect(owner.bank).toBe(bank);expect(bank.preparedResources()).toEqual(resources);expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(engine['_canonicalExportReady']()).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)
