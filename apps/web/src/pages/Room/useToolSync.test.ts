import {expect,it,vi,beforeEach} from 'vitest'
const hooks=vi.hoisted(()=>({cursor:0,slots:[]as {value:unknown;deps?:unknown[];cleanup?:()=>void}[],effects:[]as (()=>void)[]}))
vi.mock('react',()=>({
 useState:(initial:unknown)=>{const i=hooks.cursor++;hooks.slots[i]??={value:initial};return[hooks.slots[i].value,(value:unknown)=>{hooks.slots[i].value=typeof value==='function'?value(hooks.slots[i].value):value}]},
 useMemo:(factory:()=>unknown,deps:unknown[])=>{const i=hooks.cursor++,old=hooks.slots[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps?.[j])))hooks.slots[i]={value:factory(),deps};return hooks.slots[i].value},
 useEffect:(effect:()=>void|(()=>void),deps:unknown[])=>{const i=hooks.cursor++,old=hooks.slots[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps?.[j]))){hooks.effects.push(()=>{old?.cleanup?.();const cleanup=effect();hooks.slots[i].cleanup=cleanup||undefined});hooks.slots[i]={value:null,deps}}},
}))
vi.mock('../../stores/roomStore',async importOriginal=>{const m=await importOriginal<typeof import('../../stores/roomStore')>();return {...m,useRoomStore:Object.assign((selector:(s:ReturnType<typeof m.useRoomStore.getState>)=>unknown)=>selector(m.useRoomStore.getState()),{getState:m.useRoomStore.getState})}})
vi.mock('../../stores/settingsStore',async importOriginal=>{const m=await importOriginal<typeof import('../../stores/settingsStore')>();return {...m,useSettingsStore:Object.assign((selector:(s:ReturnType<typeof m.useSettingsStore.getState>)=>unknown)=>selector(m.useSettingsStore.getState()),{getState:m.useSettingsStore.getState})}})
vi.mock('../../lib/api/brushLibrary',()=>({prepareBrushPresets:vi.fn(()=>null),publishBrushPresets:vi.fn(async()=>{})}))
vi.mock('../../stores/noticeStore',()=>({notifyError:vi.fn()}))
vi.mock('../../i18n',()=>({useT:()=>translate}))
const translate=(key:string)=>key
import {useToolSync,type ToolSyncDeps} from './useToolSync'
import type {CanonicalToolAvailability} from '../../lib/tools/canonicalToolAvailability'
import {resetRoomStore,useRoomStore} from '../../stores/roomStore'
import type {PencilEngineAPI} from '../../engine'
beforeEach(()=>{hooks.cursor=0;hooks.slots=[];hooks.effects=[];resetRoomStore();useRoomStore.getState().setTool('digitalBrush')})
function setup(rasterVersion:'straight-rgba8-v1'|'legacy-premul-v1'){
 const prepare=vi.fn(async(_preset:string,_options?:unknown)=>({status:'ready'})),noop=vi.fn()
 const engine={rasterVersion,prepareBrush:prepare,setNibAngle:noop,setTiltResponse:noop,setPressureMap:noop,setPencil:noop,setTool:noop,setSize:noop,setOpacity:noop}as unknown as PencilEngineAPI
 const props:ToolSyncDeps={engineRef:{current:engine},engineEpoch:1,canvasRef:{current:null},roomContentReady:false}
 const useRender=()=>{hooks.cursor=0;const result=useToolSync(props);for(const effect of hooks.effects.splice(0))effect();return result}
 const cleanup=()=>{for(const slot of hooks.slots)slot.cleanup?.()}
 return {props,prepare,render:useRender,cleanup}
}
it('defers source preparation until full restore, then retries the same preset without reselection or engine epoch',async()=>{
 const f=setup('straight-rgba8-v1')
 try{
  expect(f.render().brushResourcesReady).toBe(false);expect(f.prepare).not.toHaveBeenCalled()
  f.props.roomContentReady=true;f.render();await vi.waitFor(()=>expect(f.prepare).toHaveBeenCalledOnce())
  expect(f.render().brushResourcesReady).toBe(true)
  const firstPreset=f.prepare.mock.calls[0][0]
  f.props.roomContentReady=false;expect(f.render().brushResourcesReady).toBe(false)
  f.props.roomContentReady=true;f.render();await vi.waitFor(()=>expect(f.prepare).toHaveBeenCalledTimes(2))
  expect(f.prepare.mock.calls[1][0]).toBe(firstPreset);expect(f.props.engineEpoch).toBe(1)
 }finally{f.cleanup()}
})
it('preserves legacy preparation while room content is still loading',async()=>{
 const f=setup('legacy-premul-v1')
 try{
  f.render();await vi.waitFor(()=>expect(f.prepare).toHaveBeenCalledOnce())
  f.props.roomContentReady=true;f.render();expect(f.prepare).toHaveBeenCalledOnce()
 }finally{f.cleanup()}
})

const noSource:CanonicalToolAvailability={status:'empty',options:[],schema:{}}
it('does not prepare medium-round in an empty or late canonical library, even when hand retains digitalBrush behind it',async()=>{
 const f=setup('straight-rgba8-v1');f.props.roomContentReady=true;f.props.availability=noSource
 try{
  useRoomStore.getState().setTool('hand')
  expect(f.render().brushResourcesReady).toBe(false)
  await Promise.resolve();expect(f.prepare).not.toHaveBeenCalled()
  const id=String(useRoomStore.getState().toolSettings.digitalBrush.brush)
  f.props.availability={status:'ready',options:[{id,sizePx:40}],schema:{}}
  expect(f.render().brushResourcesReady).toBe(false);expect(f.prepare).not.toHaveBeenCalled()
  useRoomStore.getState().normalizeCanonicalTool(f.props.availability.options,true)
  f.render();await vi.waitFor(()=>expect(f.prepare).toHaveBeenCalledOnce())
  expect(f.render().brushResourcesReady).toBe(true)
  f.props.availability=noSource;expect(f.render().brushResourcesReady).toBe(false)
 }finally{f.cleanup()}
})
it('rejects stale preparation completion after original-profile availability changes',async()=>{
 const f=setup('straight-rgba8-v1');f.props.roomContentReady=true
 let complete:((result:{status:string})=>void)|undefined
 f.prepare.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve}))
 try{
  f.render();expect(f.prepare).toHaveBeenCalledOnce()
  f.props.availability=noSource;f.render();complete?.({status:'ready'});await Promise.resolve();await Promise.resolve()
  expect(f.render().brushResourcesReady).toBe(false);expect(f.prepare).toHaveBeenCalledOnce()
 }finally{f.cleanup()}
})
