import {beforeEach,expect,it,vi} from 'vitest'
const hooks=vi.hoisted(()=>({cursor:0,refs:[]as {current:unknown}[],effects:[]as (()=>void)[]}))
vi.mock('react',()=>({useRef:(value:unknown)=>hooks.refs[hooks.cursor++]??=( {current:value}),useMemo:(f:()=>unknown)=>f(),useCallback:(f:unknown)=>f,useEffect:(f:()=>void)=>hooks.effects.push(f)}))
vi.mock('./useRememberedTool',()=>({useRememberedTool:()=>{}}))
vi.mock('../../i18n',()=>({useT:()=>((key:string)=>key)}))
vi.mock('../../stores/roomStore',async original=>{const m=await original<typeof import('../../stores/roomStore')>();return {...m,useRoomStore:Object.assign((select:(s:ReturnType<typeof m.useRoomStore.getState>)=>unknown)=>select(m.useRoomStore.getState()),{getState:m.useRoomStore.getState})}})
import {useToolChoice} from './useToolChoice'
import {resetRoomStore,useRoomStore} from '../../stores/roomStore'
import type {CanonicalToolAvailability} from '../../lib/tools/canonicalToolAvailability'
const empty:CanonicalToolAvailability={status:'empty',options:[],schema:{}}
const ready:CanonicalToolAvailability={status:'ready',options:[{id:'native-test',sizePx:40}],schema:{}}
function useRender(availability?:CanonicalToolAvailability){hooks.cursor=0;const result=useToolChoice('test',availability);for(const f of hooks.effects.splice(0))f();return result}
beforeEach(()=>{resetRoomStore();hooks.refs=[];hooks.effects=[]})
it('one gate refuses toolbar, hotkey and floating pixel tools without mutating their hidden settings',()=>{
 const choice=useRender(ready)
 expect(choice.drawingGroupOptions.map(o=>o.value)).toEqual(['digitalBrush'])
 expect(choice.toolOffered('fill')).toBe(false)
 const settings=useRoomStore.getState().toolSettings
 choice.selectTool('pencil');choice.toggleTool('eraser');choice.selectGroupMember('shape','rectangle')
 expect(useRoomStore.getState().tool).toBe('digitalBrush');expect(useRoomStore.getState().toolSettings).toBe(settings)
 choice.selectTool('hand');expect(useRoomStore.getState().tool).toBe('hand')
})
it('late eligible metadata replaces only automatic hand fallback and never an explicit hand choice',()=>{
 useRender(empty);expect(useRoomStore.getState().tool).toBe('hand')
 useRender(ready);expect(useRoomStore.getState().tool).toBe('digitalBrush')
 const choice=useRender(empty);choice.selectTool('hand');useRender(ready)
 expect(useRoomStore.getState().tool).toBe('hand')
})
it('legacy gate still offers every enabled drawing tool and does not normalize its remembered settings',()=>{
 const settings=useRoomStore.getState().toolSettings
 const choice=useRender();expect(choice.toolOffered('pencil')).toBe(true);expect(choice.toolOffered('fill')).toBe(true)
 expect(useRoomStore.getState().tool).toBe('pencil');expect(useRoomStore.getState().toolSettings).toBe(settings)
})
