import {beforeEach,expect,it,vi} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const fields=vi.hoisted(()=>({seen:[]as unknown[]}))
vi.mock('../../../components/SettingField',()=>({SettingField:({descriptor}:{descriptor:{nameKey:string}})=>{fields.seen.push(descriptor);return createElement('span',null,descriptor.nameKey)}}))
vi.mock('./BrushLibraryControls',()=>({BrushLibraryControls:()=>createElement('button',null,'Import existing library')}))
vi.mock('../../../stores/roomStore',async original=>{const m=await original<typeof import('../../../stores/roomStore')>();return {...m,useRoomStore:Object.assign((select:(s:ReturnType<typeof m.useRoomStore.getState>)=>unknown)=>select(m.useRoomStore.getState()),{getState:m.useRoomStore.getState})}})
import {resetRoomStore,useRoomStore} from '../../../stores/roomStore'
import {TOOL_SCHEMAS} from '../../../lib/tools/toolSchemas'
import type {CanonicalToolAvailability} from '../../../lib/tools/canonicalToolAvailability'
import {QuickSettingsBar} from './QuickSettingsBar'
import {ToolSettingsTab} from './ToolSettingsTab'
const noop=()=>{}
function quick(availability?:CanonicalToolAvailability){return renderToStaticMarkup(createElement(QuickSettingsBar,{canonicalAvailability:availability,uiHidden:false,compact:false,onShapeFrameChange:noop,paintTargetId:'layer-1',paintTargetLocked:false,copySelection:noop,cutSelection:noop,pasteClipboard:noop,deleteSelectionContents:noop,onWatercolorDry:noop}))}
function panel(availability?:CanonicalToolAvailability){return renderToStaticMarkup(createElement(ToolSettingsTab,{canonicalAvailability:availability,onExpandColor:noop,onShapeFrameChange:noop}))}
beforeEach(()=>{resetRoomStore();fields.seen=[]})
it('renders the same scoped descriptor on both surfaces and readonly source size, never a fake size/pressure slider',()=>{
 useRoomStore.getState().setTool('digitalBrush')
 const schema={brush:{...TOOL_SCHEMAS.digitalBrush.brush,valueType:{kind:'enumOptions' as const,options:['source']}}}
 const availability:CanonicalToolAvailability={status:'ready',schema,options:[{id:'source',sizePx:40}]}
 useRoomStore.getState().setToolSetting('digitalBrush','brush','source')
 const a=quick(availability),b=panel(availability)
 expect(fields.seen.filter(d=>d===schema.brush)).toHaveLength(2)
 expect(a).toContain('40');expect(b).toContain('40')
 expect(a+b).not.toContain('tool.field.sizeFromPressure');expect(a+b).not.toContain('tool.field.size<')
})
it('empty canonical library keeps hand settings reachable with import and explicit refresh, not an endless loading label',()=>{
 useRoomStore.getState().setTool('hand')
 const html=panel({status:'empty',schema:{},options:[]})
 expect(html).toContain('Import existing library');expect(html).toContain('Refresh library');expect(html).toContain('No compatible source brush')
 expect(html).not.toContain('Loading')
})
it('legacy digital brush controls still use the unmodified global schema',()=>{
 useRoomStore.getState().setTool('digitalBrush');quick();panel()
 expect(fields.seen).toContain(TOOL_SCHEMAS.digitalBrush.size)
 expect(fields.seen).toContain(TOOL_SCHEMAS.digitalBrush.sizeFromPressure)
})
