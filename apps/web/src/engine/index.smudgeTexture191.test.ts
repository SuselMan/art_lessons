import{expect,it,vi}from'vitest'
import{createBrushRandomStrokeId,isBrushLibrary,type BrushLibrary}from'@grafetto/shared'
import{brush131,mask131,normal131}from'../../../../packages/shared/src/smudgeTextureErase131.testFixture'
import{installBrushLibrary,installBrushPixels}from'./brushLibrary'
import{createTestEngine,makeLayerAdd,makeStroke,paperReady}from'./testing/engineTestUtils'
let ordinal=191100
function fixture(family='modern'){const brush=brush131();brush.version=191;brush.id='imported-'+(++ordinal).toString(16).padStart(24,'0');delete brush.behavior!.erase;delete brush.mixer!.colorRateComposite;delete brush.texture!.eraseId;brush.texture!.strength=.75;brush.texture!.application={mode:'height',soft:false};brush.mixer!.pickup=.5;brush.mixer!.foreground={rate:.3};if(family==='modernForeground')brush.mixer!.colorRateComposite='grainMerge';else if(family!=='modern'){delete brush.mixer!.algorithm;if(family!=='base83')brush.mixer!.colorRateComposite=family==='minmax172'?'darken':family==='arithmetic175'?'add':family==='dodgeBurn176'?'dodge':'overlay'}const library:BrushLibrary={schemaVersion:1,assets:[mask131,normal131].map(id=>({id,size:4,file:id.slice(6)+'.bin'})),skipped:[],brushes:[{name:'Own191 modern MASK Height',source:'own191.kpp',warnings:[],descriptor:brush}]};expect(isBrushLibrary(library)).toBe(true);installBrushLibrary(library);installBrushPixels(mask131,new Uint8Array(16).fill(255));installBrushPixels(normal131,new Uint8Array(16).fill(191));return{brush,preset:`brush:${brush.id}@191`}}
const seeds={version:1 as const,sequentialSeed:2185724052,strokeSeed:3202644508},strokeId=createBrushRandomStrokeId('KCrJ8Kht5h',seeds)
const point=(x=250)=>({x,y:250,pressure:.25,tiltX:0,tiltY:0,size:48,aspectRatio:1,angle:0,opacity:1,t:0,normalizedSpeed:0,sourceSize:48,sourceScale:1,sourceAngle:Math.fround(Math.PI/4),sourceTwist:0,sourceTangentialPressure:.25})
it.each(['modern','modernForeground','base83','overlay154','minmax172','arithmetic175','dodgeBurn176'])('cold never-selected peer191 %s admits packet0 and reuses recorded preparation before paint',family=>{
 const{preset}=fixture(family),{engine}=createTestEngine();try{
  engine.appendOperation(makeLayerAdd('peer','ink'))
  const smudge=engine['_smudge'],compile=vi.spyOn(engine['gl'],'createProgram'),upload=vi.spyOn(engine['gl'],'texImage2D'),original=smudge.paint.bind(smudge),paint=vi.spyOn(smudge,'paint').mockImplementation((...args)=>{const beforeCompile=compile.mock.calls.length,beforeUploads=upload.mock.calls.filter(c=>(c as unknown[])[8]!=null).length;const result=original(...args);expect(compile.mock.calls.length).toBe(beforeCompile);expect(upload.mock.calls.filter(c=>(c as unknown[])[8]!=null).length).toBe(beforeUploads);return result})
  expect(()=>engine.appendPeerLiveDabs('peer',{strokeId,layerId:'ink',tool:'digitalBrush',preset,color:[.95,.05,.12],packetSeq:0,dabs:[point()],brushRandom:seeds})).not.toThrow()
  expect(paint).toHaveBeenCalledOnce();const compileWarm=compile.mock.calls.length,uploadWarm=upload.mock.calls.filter(c=>(c as unknown[])[8]!=null).length;
  engine.appendPeerLiveDabs('peer',{strokeId,layerId:'ink',tool:'digitalBrush',preset,color:[.95,.05,.12],packetSeq:1,dabs:[point(260)],brushRandom:seeds});expect(compile.mock.calls.length).toBe(compileWarm);expect(upload.mock.calls.filter(c=>(c as unknown[])[8]!=null).length).toBe(uploadWarm);
  // GPU eviction must restore source textures at admission, never insidepaint.
  const wet=Reflect.get(smudge,'wetTextures')as{clear:(force:boolean)=>void};wet.clear(true);engine.appendPeerLiveDabs('peer',{strokeId,layerId:'ink',tool:'digitalBrush',preset,color:[.95,.05,.12],packetSeq:2,dabs:[point(270)],brushRandom:seeds});expect(compile.mock.calls.length).toBe(compileWarm);expect(upload.mock.calls.filter(c=>(c as unknown[])[8]!=null).length).toBeGreaterThan(uploadWarm);
  const live=[...engine['_peerLiveStrokes'].values()][0];expect(live).toMatchObject({paintedTotal:3,liveOffset:3,desynced:false})
 }finally{engine.destroy()}
})

it('cold replay191 uses the same recorded preflight without selecting or UI-preparing the brush',async()=>{
 const{preset}=fixture(),{engine}=createTestEngine();try{
  await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
  const paint=vi.spyOn(engine['_smudge'],'paint')
  expect(()=>engine.appendOperation(makeStroke('peer','ink',[point(),point(260)],{tool:'digitalBrush',preset,color:[.95,.05,.12],strokeId,brushRandom:seeds,strokeEnd:true}),'remote')).not.toThrow()
  expect(paint).toHaveBeenCalled();expect(engine['_log'].entries.every(e=>e.state==='done')).toBe(true)
 }finally{engine.destroy()}
})
