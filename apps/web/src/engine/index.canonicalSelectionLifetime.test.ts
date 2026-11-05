import {expect,it,vi} from 'vitest'
import {PencilEngine} from './index'
function fixture(ended=false){
 const prepared={preset:'old',generation:1,nativeSizePx:12,owner:{}},session={ended,source:{prepared,closed:false},snapshot:{layerId:'layer',cameraAngle:0}}
 const cancel=vi.fn(),engine=Object.create(PencilEngine.prototype) as {
  _authorProducer:typeof session;_opts:{pencilType:string;tool:string;size:number};_activeId:string;_locked:boolean;_brushPreparationGeneration:number;_authorCameraAngle:number;_ruler:unknown;_contextLost:boolean
  _cancelCanonicalPointer:typeof cancel;_clearWash:()=>void;_assertCanonicalPreparedRole:()=>void;_assertCanonicalLayerCurrent:()=>void
  _assertCanonicalSource:(s:typeof session)=>void;setPencil:(s:string)=>void;setSize:(n:number)=>void;setTool:(s:string)=>void
 }
 Object.assign(engine,{_authorProducer:session,_opts:{pencilType:'old',tool:'digitalBrush',size:12},_activeId:'layer',_locked:false,_brushPreparationGeneration:1,_authorCameraAngle:0,_ruler:null,_contextLost:false,_cancelCanonicalPointer:cancel,_clearWash:()=>{},_assertCanonicalPreparedRole:()=>{},_assertCanonicalLayerCurrent:()=>{}})
 return{engine,session,cancel}
}
it.each(['brush','size','tool'])('seals a held pen with the normal partial-close path on %s change',kind=>{
 const {engine,session,cancel}=fixture();if(kind==='brush')engine.setPencil('new');else if(kind==='size')engine.setSize(24);else engine.setTool('hand');expect(cancel).toHaveBeenCalledExactlyOnceWith(session)
})
it('does not cancel the queued tail of a lifted pen when settings change',()=>{
 const {engine,session,cancel}=fixture(true);engine.setPencil('new');engine.setSize(24);engine.setTool('hand');engine._authorCameraAngle=1;engine._brushPreparationGeneration=2;engine._locked=true;engine._ruler={};engine._activeId='other';expect(cancel).not.toHaveBeenCalled();expect(()=>engine._assertCanonicalSource(session)).not.toThrow()
})
it('continues to reject a live pen whose captured selection changed unexpectedly',()=>{
 const {engine,session}=fixture();engine._authorCameraAngle=1;expect(()=>engine._assertCanonicalSource(session)).toThrow('Canonical pointer lifetime changed')
})
it.each(['closed','context','owner'])('does not exempt an ended source from %s lifetime failure',kind=>{
 const {engine,session}=fixture(true);if(kind==='closed')session.source.closed=true;else if(kind==='context')engine._contextLost=true;else engine._assertCanonicalLayerCurrent=()=>{throw Error('Canonical pointer lifetime changed')};expect(()=>engine._assertCanonicalSource(session)).toThrow('Canonical pointer lifetime changed')
})
