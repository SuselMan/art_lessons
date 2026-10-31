import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {inflateSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {canonicalImageSourceBinding,canonicalBrushDescriptorJSON,CANONICAL_STROKE_RASTER_PROFILE,type BrushDescriptor,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type ServerToClientEvents} from '@grafetto/shared'
import stock from '../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import fixture from './src/presets/fixtures/sourcePngWholePath/guiStroke.native.json'
import {sourceStrokeAuthorDescriptor} from './src/presets/sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceStrokeAuthorState,type SourceStrokeAuthorStep} from './src/presets/sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter,type SourceStrokeMaterialContextV2} from './src/presets/sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder} from './src/presets/sourceCanonicalFrameEncoder'
import {installBrushPixels,clearImportedBrushPixels,installBrushLibrary} from './src/presets/importedBrushes'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {CanonicalMaskSourceBank} from './src/dabs/CanonicalMaskSourceBank'
import {createTestEngine} from './testing/engineTestUtils'
import {PencilEngine} from './index'
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
function original(isCurrent=()=>true,open=false){
 const tail=open?trace.operations.slice(0,-1):trace.operations
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:512,canvasHeight:512,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:tail,participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:1},canonicalHistoryBase:{kind:open?'full-room-prefix-v2':'empty-room-prefix-v1',roomId:'room',boardEpoch:1,throughSeq:tail.length,operationCount:tail.length},canonicalCapabilities:{version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:trace.snapshot}],bindings:tail.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))}}
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
it.each(['open','missingCAS']as const)('rejects %s image baseline before canvas access',kind=>{
 const p=original(()=>true,kind==='open');if(kind==='missingCAS')clearImportedBrushPixels()
 const get=vi.fn(()=>{throw Error('Canvas touched')}),canvas=new Proxy({}as HTMLCanvasElement,{get})
 expect(()=>new PencilEngine(canvas,{rasterVersion:'straight-rgba8-v1',pageWidth:512,pageHeight:512,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations}})).toThrow(kind==='open'?'Open canonical image baseline unsupported':'Canonical baseline image asset unavailable');expect(get).not.toHaveBeenCalled()
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
  await expect(engine.prepareBrush(preset)).rejects.toThrow('Canonical image baseline author preparation unavailable')
  expect(programs).not.toHaveBeenCalled();expect(engine['_brushMipCache'].reservedBytes).toBe(cpu);expect(bank.resources()).toEqual(resources);expect(owner.prepass.preparedCapacity().epoch).toBe(capacity.epoch);expect(engine['_canonicalPreparedAuthor']).toBeUndefined();expect(engine['_canonicalPixelsReady']).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},15000)
