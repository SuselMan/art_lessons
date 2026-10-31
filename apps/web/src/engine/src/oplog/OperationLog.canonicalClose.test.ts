import {expect,it} from 'vitest'
import type {CanonicalStrokeCloseOperation,LayerState} from '@grafetto/shared'
import {applyContentOp} from '../../../lib/layers/layers'
import {OperationLog,isPixelOperation} from './OperationLog'
const close=():CanonicalStrokeCloseOperation=>({type:'canonical_stroke_close',id:'close',userId:'author',timestamp:0,seq:7,layerId:'L',targetUserId:'author',strokeId:'S',disposition:'commitPartial',recordedNext:2,firstFrameOpId:'first',lastFrameOpId:'last'})
it('keeps recorded close as metadata without consuming redo or becoming undoable',()=>{
 const log=new OperationLog()
 log.append({type:'layer_clear',layerId:'L',id:'ink',userId:'author',timestamp:0})
 log.applyUndo('ink','author')
 const op=close();log.append(op,{serverSeq:7})
 expect(isPixelOperation(op)).toBe(false);expect(log.undoTarget('author')).toBeNull()
 expect(log.applyUndo(op.id,'author')).toBeNull();expect(log.revoke(op.id)).toBeNull()
 expect(log.doneOperations().map(o=>o.id)).toEqual(['close'])
 expect(log.redoTarget('author')?.id).toBe('ink')
 op.recordedNext=99
 expect(log.doneOperations()[0]).toMatchObject({recordedNext:2})
})
it('rejects malformed and pending close before mutating the existing journal',()=>{
 const log=new OperationLog()
 expect(()=>log.append({...close(),recordedNext:0},{serverSeq:7})).toThrow()
 expect(()=>log.append(close(),{pending:true})).toThrow()
 expect(log.doneOperations()).toEqual([])
})
it('validates historical close with authoritative server placement before any splice',()=>{
 const log=new OperationLog()
 expect(()=>log.prependHistorical([{op:{...close(),recordedNext:0},serverSeq:7,state:'done'}])).toThrow()
 expect(log.doneOperations()).toEqual([])
 log.prependHistorical([{op:{...close(),seq:0},serverSeq:7,state:'done'}])
 expect(log.doneOperations()).toHaveLength(1)
 expect(log.undoTarget('author')).toBeNull()
})

it('does not launder hidden fields or accessor metadata through placement normalization',()=>{
 const log=new OperationLog()
 const hidden=Object.defineProperty(close(),'extra',{value:1})
 const getter=Object.defineProperty(close(),'recordedNext',{get(){throw Error('getter invoked')}})
 for(const op of [hidden,getter])expect(()=>log.append(op,{serverSeq:7})).toThrow('Invalid canonical stroke close metadata')
 expect(log.doneOperations()).toEqual([])
})

it('does not apply close metadata as layer structure',()=>{
 const state:LayerState={items:{},rootOrder:[],activeId:'L',selectedIds:[]}
 expect(applyContentOp(state,close())).toBe(state)
})
