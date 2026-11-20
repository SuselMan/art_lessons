import{expect,it}from'vitest'
import{library140}from'../../../../../packages/shared/src/bristleResize140.testFixture'
import{library141}from'../../../../../packages/shared/src/bristleInitialization141.testFixture'
import{installBrushLibrary,retainImportedBrushResources}from'../../engine/brushLibrary'
import{useRoomStore,resetRoomStore}from'../../stores/roomStore'
import{defaultToolSettings,toolSettingDescriptor,toolSizeRange,MAX_TOOL_SIZE_PX}from'./toolSchemas'

it('140 exposes1..64 and clamps direct, remembered and restored sizes while old139 retains ordinary limits',()=>{
 const library=library140(),brush=library.brushes[0].descriptor,old=structuredClone(brush)
 old.id='imported-'+ 'fb'.repeat(12);old.version=139
 if(old.bristle?.version!==2||!old.bristle.soak)throw Error('fixture')
 delete old.bristle.soak.resizePolicy
 installBrushLibrary({...library,brushes:[...library.brushes,{name:'Old139',source:'old139.kpp',warnings:[],descriptor:old}]});resetRoomStore()
 try{
  const set=useRoomStore.getState().setToolSetting
  set('digitalBrush','brush',old.id);set('digitalBrush','size',200)
  expect(toolSizeRange('digitalBrush',useRoomStore.getState().toolSettings.digitalBrush)).toEqual({min:1,max:MAX_TOOL_SIZE_PX})
  useRoomStore.setState({brushPreferences:{['digitalBrush:'+brush.id]:{size:700,opacity:.5}}})
  set('digitalBrush','brush',brush.id)
  expect(useRoomStore.getState().toolSettings.digitalBrush.size).toBe(64)
  const values=useRoomStore.getState().toolSettings.digitalBrush
  expect(toolSizeRange('digitalBrush',values)).toEqual({min:1,max:64})
  expect(toolSettingDescriptor('digitalBrush','size',values).valueType).toMatchObject({kind:'numberRange',min:1,max:64,step:1})
  set('digitalBrush','size',.2);expect(useRoomStore.getState().toolSettings.digitalBrush.size).toBe(1)
  set('digitalBrush','size',15.6);expect(useRoomStore.getState().toolSettings.digitalBrush.size).toBe(16)
  const restored=defaultToolSettings();restored.digitalBrush={...restored.digitalBrush,brush:brush.id,size:800}
  useRoomStore.getState().setAllToolSettings(restored);expect(useRoomStore.getState().toolSettings.digitalBrush.size).toBe(64)
  set('digitalBrush','brush',old.id);set('digitalBrush','size',200);expect(useRoomStore.getState().toolSettings.digitalBrush.size).toBe(200)
 }finally{resetRoomStore();retainImportedBrushResources([])}
})

it('ordinary141 uses the common bounded size setting and selection clamp',()=>{
 const library=library141();installBrushLibrary(library);resetRoomStore()
 try{const set=useRoomStore.getState().setToolSetting;set('digitalBrush','brush',library.brushes[0].descriptor.id);set('digitalBrush','size',900);expect(useRoomStore.getState().toolSettings.digitalBrush.size).toBe(64);expect(toolSizeRange('digitalBrush',useRoomStore.getState().toolSettings.digitalBrush)).toEqual({min:1,max:64})}finally{resetRoomStore();retainImportedBrushResources([])}
})
