import {afterEach,expect,it,vi} from 'vitest'
import type {BrushDescriptor} from '@grafetto/shared'
import {installBrushLibrary} from './brushLibrary'
import {digitalBrushFromPreset} from './src/presets/digitalBrushPresets'
import {BristleRequestBatch} from './src/dabs/BristleRequestBatch'
import {SketchLineBatch} from './src/dabs/SketchLineBatch'
import {createBristleInkProfile,type BristleInkSettings} from './src/presets/brushBristleInk'
import {createTestEngine,dab,makeLayerAdd,makeStroke,paperReady} from './testing/engineTestUtils'
const ink={depletion:[0,.5,1],useOpacity:true,useSaturation:false,useWeights:false,pressureWeight:.5,bristleLengthWeight:.5,bristleInkAmountWeight:.5,inkDepletionWeight:50}
const definition=(suffix:string,curve:readonly number[]):BrushDescriptor=>({...digitalBrushFromPreset('hard-round'),id:'imported-7272aa'+suffix,version:72,model:'stamp',paperInteraction:0,flow:1,flowPer:'stamp',scatter:undefined,texture:undefined,wet:undefined,tip:{kind:'round',hardness:1,aspect:1,angle:0,rotation:'fixed'},sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],bristle:{version:2,hairs:[[0,0,1],[.1,0,.5]],scale:1,shear:0,random:0,mousePressure:false,threshold:false,connected:true,antialias:false,compositing:false,ink:{...ink,depletion:curve}},behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}})
const a=definition('aa',[0,.5,1]),b=definition('ab',[1,.25,0])
installBrushLibrary({schemaVersion:1,assets:[],skipped:[],brushes:[a,b].map(descriptor=>({name:'Authored Bristle ink integration',source:'qa',warnings:[],descriptor}))})
const preset=(brush:BrushDescriptor)=>`brush:${brush.id}@72`
const points=[dab(20,20,{size:8,pressure:1,opacity:1}),dab(24,20,{size:8,pressure:1,opacity:1}),dab(28,20,{size:8,pressure:1,opacity:1})]
afterEach(()=>vi.restoreAllMocks())
function boundary(){
 const profiles=new WeakMap<BristleRequestBatch,BristleInkSettings>(),events:string[]=[]
 const prepare=vi.spyOn(BristleRequestBatch.prototype,'prepareInkProfile').mockImplementation(function(this:BristleRequestBatch,profile){profiles.set(this,profile);events.push('prepare')})
 vi.spyOn(BristleRequestBatch.prototype,'assertInkPrepared').mockImplementation(function(this:BristleRequestBatch,profile){if(profiles.get(this)!==profile)throw Error('Wrong prepared Bristle profile')})
 vi.spyOn(BristleRequestBatch.prototype,'preparedInkProfile').mockImplementation(function(this:BristleRequestBatch,profile){if(profiles.get(this)!==profile)throw Error('Wrong prepared Bristle profile');return createBristleInkProfile(profile)})
 vi.spyOn(BristleRequestBatch.prototype,'prepareDimensions').mockImplementation(()=>{})
 const draw=vi.spyOn(BristleRequestBatch.prototype,'paint').mockImplementation(function(this:BristleRequestBatch){expect(profiles.has(this)).toBe(true);events.push('paint')})
 const old=vi.spyOn(SketchLineBatch.prototype,'paint').mockImplementation(()=>{throw Error('Wrong legacy Bristle route')})
 return {prepare,draw,old,events}
}
it('prepares selected profile before actual Painter geometry and routes bounded spans',async()=>{
 const mock=boundary(),{engine}=createTestEngine({userId:'observer'},{width:64,height:64})
 try{await paperReady(engine);await expect(engine.prepareBrush(preset(a))).resolves.toEqual({status:'ready'});engine.appendOperation(makeLayerAdd('peer','ink'));engine.appendOperation(makeStroke('peer','ink',points,{tool:'digitalBrush',preset:preset(a),strokeId:'selected',strokeEnd:true}),'remote');expect(mock.draw).toHaveBeenCalled();expect(mock.events[0]).toBe('prepare');expect(mock.old).not.toHaveBeenCalled();for(const call of mock.draw.mock.calls)expect(call[5]).toEqual({antialias:false,compositing:false})}finally{engine.destroy()}
})
it('prepares never-selected recorded brushes and replaces profiles correctly in A→B→A replay',()=>{
 const mock=boundary(),{engine}=createTestEngine({userId:'observer'},{width:64,height:64})
 try{engine.appendOperation(makeLayerAdd('peer','ink'));for(const [i,brush]of [a,b,a].entries())engine.appendOperation(makeStroke('peer','ink',points,{tool:'digitalBrush',preset:preset(brush),strokeId:'cold-'+i,strokeEnd:true}),'remote');expect(mock.draw).toHaveBeenCalled();const curves=mock.prepare.mock.calls.map(call=>call[0].depletion);expect(curves.some(curve=>curve[0]===1)).toBe(true);expect(curves.at(-1)).toEqual(a.bristle!.version===2?a.bristle!.ink.depletion:[]);expect(mock.events[0]).toBe('prepare')}finally{engine.destroy()}
})
it('reports selected prewarm failure without claiming brush readiness',async()=>{
 vi.spyOn(BristleRequestBatch.prototype,'prepareInkProfile').mockImplementation(()=>{throw undefined})
 const draw=vi.spyOn(BristleRequestBatch.prototype,'paint'),{engine}=createTestEngine({userId:'observer'},{width:64,height:64})
 try{await paperReady(engine);await expect(engine.prepareBrush(preset(a))).rejects.toBeUndefined();expect(draw).not.toHaveBeenCalled()}finally{engine.destroy()}
})
