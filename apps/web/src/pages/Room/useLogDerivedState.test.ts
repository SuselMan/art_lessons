import {afterEach,expect,it,vi} from 'vitest'
import type {PencilEngineAPI} from '../../engine'
import {useRoomStore} from '../../stores/roomStore'
import {makeInitialLayerState} from '../../stores/slices/layerSlice'
import {useLogDerivedState} from './useLogDerivedState'
vi.mock('react',async importOriginal=>({...(await importOriginal<typeof import('react')>()),useCallback:(f:unknown)=>f,useRef:(value:unknown)=>({current:value})}))
afterEach(()=>{useRoomStore.setState({layerState:makeInitialLayerState(),reviewAnnotationHistory:null})})
function indexedEngine(){
 const getRoomDerivedState=vi.fn(()=>({kind:'canonical-indexed-v1',structure:'implicit-initial-layers',annotations:'none',operationCount:2160,throughSeq:2160}))
 const getOperations=vi.fn(()=>{throw Error('A retired journal must not be reconstructed')})
 return {getRoomDerivedState,getOperations,getOperationsSinceRestore:getOperations}
}
it('derives complete closed-format UI without reading retired originals and preserves selection',()=>{
 const initial=makeInitialLayerState()
 useRoomStore.setState({layerState:{...initial,activeId:'background',selectedIds:['layer-1']},reviewAnnotationHistory:null})
 const engine=indexedEngine(),ref={current:engine as unknown as PencilEngineAPI}
 const state=useLogDerivedState({engineRef:ref})
 state.restoredLayerStateRef.current={...initial,items:{},rootOrder:[]}
 state.syncFromLogNow()
 const actual=useRoomStore.getState().layerState
 expect(actual.rootOrder).toEqual(initial.rootOrder)
 expect(actual.items['layer-1'].name).toBe(initial.items['layer-1'].name)
 expect(actual.activeId).toBe('background');expect(actual.selectedIds).toEqual(['layer-1'])
 expect(engine.getOperations).not.toHaveBeenCalled()
})
it('coalesces bursts and derives from the engine current when the microtask runs',async()=>{
 const previous=indexedEngine(),next=indexedEngine(),ref={current:previous as unknown as PencilEngineAPI}
 const state=useLogDerivedState({engineRef:ref})
 state.syncFromLog();state.syncFromLog();ref.current=next as unknown as PencilEngineAPI
 await Promise.resolve()
 expect(previous.getRoomDerivedState).not.toHaveBeenCalled()
 expect(next.getRoomDerivedState).toHaveBeenCalledOnce()
 expect(next.getOperations).not.toHaveBeenCalled()
})
