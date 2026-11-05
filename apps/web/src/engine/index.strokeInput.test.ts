import { expect,it,vi } from 'vitest'
import { isBrushLibrary,packDabs,strokeDabs,type BrushDescriptor,type Dab } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { beginBrushBehavior,behaviorStampsForDab } from './src/presets/brushBehavior'
import { brushExecutionContext } from './src/presets/brushExecutionContext'
import { KritaRandomSource } from './src/presets/nativeRandom'
import { codecDab } from './src/dabs/codecDab'
import { sourceDrawingDirection } from './src/input/kritaStrokeInput'
import { brushDraws,createTestEngine,dab,makeLayerAdd,makeStroke,paperReady,pointerSample } from './testing/engineTestUtils'
let id=64000
function fixture(fan=true){
 const brush:BrushDescriptor={...digitalBrushFromPreset('hard-round'),id:`imported-${(++id).toString(16).padStart(24,'0')}`,version:144,tip:{kind:'round',aspect:1,hardness:1,angle:0,rotation:'fixed',profile:{kind:'gaussian',fade:1e-6,antialias:false}},paperInteraction:0,texture:undefined,wet:undefined,mixer:undefined,flow:1,flowPer:'stamp',flowSpan:undefined,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],scatter:{count:1,radius:.09,scale:1,sizeJitter:0,angleJitter:0,flowJitter:0},behavior:{version:2,sequentialRandom:{version:1,kind:'qt5Taus88',policy:'scatterXY'},strokeInput:{version:1,initialDirection:'cursorHistory',...(fan?{fanCorners:{stepDegrees:90}}:{})},rotation:{follow:1,random:'none'},scatter:{placement:'xyUniform',bothAxes:true,countJitter:0},spacing:{mode:'diameter',coefficient:.2}}}
 const library={schemaVersion:1 as const,assets:[],skipped:[],brushes:[{name:'Author direction fixture',source:'qa',warnings:[],descriptor:brush}]};expect(isBrushLibrary(library)).toBe(true);installBrushLibrary(library);return{brush,preset:`brush:${brush.id}@144`}
}
const centres=(e:ReturnType<typeof createTestEngine>['engine'])=>brushDraws(e).filter(d=>d.kind==='stamp').map(d=>d.uniforms.get('u_dabCenter')as number[]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])
it('authors a known cursor-history direction and t0 fan once, preserves per-request timing and F64 history input',async()=>{
 const {brush,preset}=fixture(),{engine}=createTestEngine({userId:'author'})
 try{
  await paperReady(engine);engine.appendOperation(makeLayerAdd('author','ink'));engine.setActiveLayer('ink');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(10)
  engine['_sourceCursorHistory'].first={x:40,y:30};engine['_sourceCursorHistory'].second={x:50,y:30}
  engine['_onStart'](pointerSample(20,30,{timeStamp:5,pressure:.2}))
  engine['_onMove'](pointerSample(40,30,{timeStamp:105,pressure:.5}))
  engine['_onMove'](pointerSample(60,30,{timeStamp:205,pressure:.8}))
  engine['_onEnd'](pointerSample(60,30,{timeStamp:210,pressure:.8}))
  const op=engine.getOperations().find(o=>o.type==='stroke')!
  if(op.type!=='stroke')throw Error('missing stroke')
  const points=strokeDabs(op)
  expect(op.dabsPacked?.startsWith('4:')).toBe(true)
  expect(points[0].sourceAngle).toBe(sourceDrawingDirection({x:40,y:30},{x:20,y:30},0))
  expect(points[1].x).toBe(points[0].x);expect(points[1].y).toBe(points[0].y)
  expect(points[1].t).toBe(0);expect(points[1].sourceAngle).not.toBe(points[0].sourceAngle)
  expect(points[2].x).toBeGreaterThan(points[0].x);expect(points[2].t).toBeGreaterThan(0);expect(points[2].t).toBeLessThan(100)
  const state=beginBrushBehavior(points[0],brushExecutionContext(op.brushRandom))
  for(const p of points)behaviorStampsForDab(brush,codecDab(p),state,[1,0,0])
  expect(state.sequentialRandom?.draws).toBe(2*points.length)
 }finally{engine.destroy()}
})
it('reads exact sourceAngle, not F32 angle or position-derived direction; validates before replay effects',()=>{
 const {brush,preset}=fixture(),first=dab(20,30,{size:24,sourceSize:24,sourceScale:1,angle:0,sourceAngle:Math.PI/2}),next={...first,x:40,sourceAngle:Math.PI}
 const context=brushExecutionContext({version:1,sequentialSeed:3,strokeSeed:4}),state=beginBrushBehavior(first,context)
 const a=behaviorStampsForDab(brush,first,state,[1,0,0])[0],b=behaviorStampsForDab(brush,next,state,[1,0,0])[0]
 expect(a.angle).toBe(Math.PI/2);expect(b.angle).toBe(Math.PI);expect(state.firstAngle).toBe(Math.PI/2)
 expect(a.sourceDiameter).toBe(24)
 const random=new KritaRandomSource(3)
 expect(a.x).toBe(first.x+(2*random.generateNormalized()-1)*24*.09)
 expect(a.y).toBe(first.y+(2*random.generateNormalized()-1)*24*.09)
 expect(codecDab(first).sourceAngle).toBe(Math.PI/2)
 const {engine}=createTestEngine()
 try{
  engine.appendOperation(makeLayerAdd('peer','ink'))
  const invalid=makeStroke('peer','ink',[{...first,sourceAngle:undefined}],{tool:'digitalBrush',preset,strokeId:'br1.nonce64001.00000003.00000004',brushRandom:{version:1,sequentialSeed:3,strokeSeed:4}})
  const draw=vi.spyOn(engine['gl'],'drawArrays'),upload=vi.spyOn(engine['gl'],'texImage2D')
  expect(()=>engine.appendOperation(invalid,'remote')).toThrow(/sourceAngle/)
  expect(draw).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled()
 }finally{engine.destroy()}
})
it('renders already-authored fans in whole/chunks/live without consulting observer hover or reinserting requests',()=>{
 const {preset}=fixture(),a=createTestEngine(),b=createTestEngine(),c=createTestEngine()
 const points:Dab[]=[dab(20,30,{sourceSize:24,sourceScale:1,sourceAngle:0,size:24}),dab(20,30,{sourceSize:24,sourceScale:1,sourceAngle:Math.PI/2,size:24}),dab(40,30,{sourceSize:24,sourceScale:1,sourceAngle:Math.PI,size:24})]
 const seeds={version:1 as const,sequentialSeed:123,strokeSeed:4},strokeId='br1.nonce64000.0000007b.00000004'
 const op=(dabs:Dab[])=>makeStroke('peer','ink',[],{tool:'digitalBrush',preset,strokeId,brushRandom:seeds,dabs:undefined,dabsPacked:packDabs(dabs)})
 try{
  for(const {engine}of[a,b,c])engine.appendOperation(makeLayerAdd('peer','ink'))
  a.engine['_sourceCursorHistory'].first={x:999,y:999};b.engine['_sourceCursorHistory'].first={x:-1000,y:-1000}
  a.engine.appendOperation(op(points),'remote');b.engine.appendOperation(op(points.slice(0,1)),'remote');b.engine.appendOperation(op(points.slice(1)),'remote')
  c.engine.appendPeerLiveDabs('peer',{tool:'digitalBrush',preset,strokeId,brushRandom:seeds,layerId:'ink',packetSeq:0,color:[.15,.15,.15],dabs:points})
  expect(centres(a.engine)).toEqual(centres(b.engine));expect(centres(a.engine)).toEqual(centres(c.engine))
  for(const {engine}of[a,b,c])expect([...engine['_replayRibbonChunks'].values()][0].scratch.brushBehavior?.sequentialRandom?.draws).toBe(6)
 }finally{a.engine.destroy();b.engine.destroy();c.engine.destroy()}
})

it('uses authoritative source direction for mixer pickup and retains coincident fan requests',async()=>{
 const base=fixture(false).brush
 const brush:BrushDescriptor={...base,id:`imported-${(++id).toString(16).padStart(24,'0')}`,version:145,model:'mixer',tip:{kind:'procedural',aspect:1,hardness:1,angle:0,rotation:'fixed',profile:{kind:'standard',shape:'rectangle',horizontalFade:1,verticalFade:1,antialias:true}},behavior:{...base.behavior!,sequentialRandom:undefined},mixer:{load:0,initialLoad:0,pickup:1,strength:1,source:'previousCanvas',smearAlpha:true,pickupDynamics:[{control:'direction',minimum:0,jitter:0}]}}
 const library={schemaVersion:1 as const,assets:[],skipped:[],brushes:[{name:'Source mixer direction',source:'qa',warnings:[],descriptor:brush}]};expect(isBrushLibrary(library)).toBe(true);installBrushLibrary(library)
 const {engine}=createTestEngine()
 try{
  await paperReady(engine);engine.appendOperation(makeLayerAdd('peer','ink'))
  const painter=engine['_smudge'] as unknown as {drawTransferDab:(...args:unknown[])=>void}
  const transfer=vi.spyOn(painter,'drawTransferDab')
  const points=[dab(20,30,{sourceAngle:Math.PI,angle:0,size:24}),dab(20,30,{sourceAngle:Math.PI/2,angle:0,size:24}),dab(40,30,{sourceAngle:Math.PI/2,angle:0,size:24})]
  engine.appendOperation(makeStroke('peer','ink',points,{tool:'digitalBrush',preset:`brush:${brush.id}@145`,strokeId:'source-mixer'}),'remote')
  const state=engine['_smudge']['wetGestures'].get('peer')!
  expect(state.behavior.firstAngle).toBe(Math.PI)
  expect(state.behavior.dabSequence).toBe(3)
  const wet=transfer.mock.calls.at(-1)?.[9] as {step:{pickup:number}}
  expect(wet.step.pickup).toBe(.25)
 }finally{engine.destroy()}
})

it('latches explicit CSS zoom for camera-driven bounded rooms and rejects invalid provided zoom before camera mutation',()=>{
 const {engine}=createTestEngine()
 try{
  engine.setInfiniteCamera(20,30,3,.2,2)
  expect(engine['_sourceInputZoom']()).toBe(2)
  const pose={...engine['_camera'].pose}
  expect(()=>engine.setInfiniteCamera(100,200,9,1,NaN)).toThrow(/CSS zoom/)
  expect(engine['_camera'].pose).toEqual(pose)
  expect(engine['_sourceInputZoom']()).toBe(2)
  engine.setViewport(0,0,.75,0)
  expect(engine['_sourceInputZoom']()).toBe(.75)
 }finally{engine.destroy()}
})
