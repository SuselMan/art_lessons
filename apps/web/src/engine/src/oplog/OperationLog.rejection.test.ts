import {expect,it} from 'vitest'
import {OperationLog} from './OperationLog'
import {makeStroke,dab} from '../../testing/engineTestUtils'
import type {Operation} from '@grafetto/shared'
const stroke=(id:string,userId='A')=>makeStroke(userId,'L',[dab(8,8,{size:8})],{id,tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:id,washId:'m70:L',timestamp:100})
const undo=(id:string,targetOpId:string):Operation=>({id,type:'operation_undo',userId:'A',targetOpId,timestamp:101})
it('a rejected Undo stays inert in historical prefixes and does not poison later foreign-water dependencies',()=>{
 const log=new OperationLog(),a=stroke('a'),u=undo('rejected-u','a')
 log.append(a,{serverSeq:1});log.append(u,{pending:true});log.applyUndo('a','A')
 log.rejectPending(u.id)
 log.append(stroke('b','B'),{serverSeq:2})
 expect(log.historicalPrefix(100).doneOperations().some(op=>op.id==='a')).toBe(true)
 log.append(undo('accepted-u','a'),{serverSeq:3});log.applyUndo('a','A')
 const ghost=log.watercolorEffectiveOperations().find(op=>op.id==='a')
 expect(ghost?.type==='stroke' && ghost.preset.split(':')[2]).toBe('0')
 expect(log.entries.find(entry=>entry.op.id==='rejected-u')?.goneReason).toBe('reject')
})
it('a legally revoked accepted Undo keeps its historical effect rather than being mistaken for a server rejection',()=>{
 const log=new OperationLog(),a=stroke('a'),u=undo('accepted-u','a')
 log.append(a,{serverSeq:2});log.append(u,{serverSeq:3});log.applyUndo('a','A')
 log.revoke(u.id)
 log.absorbHistorical([makeStroke('B','K',[],{id:'earlier',seq:1})])
 expect(log.entries.find(entry=>entry.op.id==='a')?.state).toBe('undone')
 expect(log.historicalPrefix(100).entries.find(entry=>entry.op.id==='a')?.state).toBe('undone')
 expect(log.entries.find(entry=>entry.op.id===u.id)?.goneReason).toBe('revoke')
})
it('rejecting only the current chunk preserves the confirmed sibling and accepted gesture identity',()=>{
 const log=new OperationLog()
 log.append({...stroke('accepted-chunk'),strokeId:'gesture'},{serverSeq:1})
 log.append({...stroke('rejected-chunk'),strokeId:'gesture'},{pending:true})
 expect(log.rejectPending('rejected-chunk')?.id).toBe('rejected-chunk')
 expect(log.doneOperations().map(op=>op.id)).toEqual(['accepted-chunk'])
 expect(log.layerPixelOps('L',100).map(op=>op.id)).toEqual(['accepted-chunk'])
})
it('a rejected Redo cannot make removed water available to a later foreign wet gesture',()=>{
 const log=new OperationLog()
 log.append(stroke('a'),{serverSeq:1})
 log.append(undo('accepted-undo','a'),{serverSeq:2});log.applyUndo('a','A')
 const redo:Operation={id:'rejected-redo',type:'operation_redo',userId:'A',targetOpId:'a',timestamp:102}
 log.append(redo,{pending:true});log.applyRedo('a','A');log.rejectPending(redo.id)
 log.append(stroke('b','B'),{serverSeq:3})
 expect(log.historicalPrefix(1).doneOperations().some(op=>op.id==='a')).toBe(true)
 expect(log.watercolorEffectiveOperations().some(op=>op.id==='a')).toBe(false)
 expect(log.watercolorEffectiveOperations().some(op=>op.id==='b')).toBe(true)
})

it('a partial grouped gesture keeps a revoked sibling when a pending Undo is rejected',()=>{
 const log=new OperationLog()
 log.prependHistorical([
  {op:{...stroke('a'),strokeId:'group'},state:'done',serverSeq:1},
  {op:{...stroke('revoked-part'),strokeId:'group'},state:'gone',goneReason:'revoke',serverSeq:2},
 ])
 const u=undo('group-undo','a')
 log.append(u,{pending:true});log.applyUndo('a','A');log.rejectPending(u.id)
 expect(log.doneOperations().map(op=>op.id)).toEqual(['a'])
 expect(log.historicalPrefix(100).doneOperations().map(op=>op.id)).toEqual(['a'])
 expect(log.entries.find(e=>e.op.id==='revoked-part')?.goneReason).toBe('revoke')
})
it('rejected controls preserve the existing legacy water projection when original undo events are unavailable',()=>{
 const log=new OperationLog()
 log.prependHistorical([{op:stroke('a'),state:'undone',serverSeq:1},{op:stroke('b','B'),state:'done',serverSeq:2}])
 const before=log.watercolorEffectiveOperations().map(op=>[op.id,op.type==='stroke'?op.preset:''])
 const redo:Operation={id:'legacy-redo',type:'operation_redo',targetOpId:'a',userId:'A',timestamp:103}
 log.append(redo,{pending:true});log.applyRedo('a','A');log.rejectPending(redo.id)
 expect(log.watercolorEffectiveOperations().map(op=>[op.id,op.type==='stroke'?op.preset:''])).toEqual(before)
})
it('rejecting a new action restores an imported redo branch without its original Undo event',()=>{
 const log=new OperationLog()
 log.prependHistorical([{op:stroke('legacy'),state:'undone',serverSeq:1}])
 log.append(stroke('rejected-new'),{pending:true})
 expect(log.entries.find(e=>e.op.id==='legacy')?.goneReason).toBe('branch')
 log.rejectPending('rejected-new')
 expect(log.entries.find(e=>e.op.id==='legacy')?.state).toBe('undone')
 expect(log.redoTarget('A')?.id).toBe('legacy')
})

it('authoritative acceptance of a rejected new action removes the restored legacy redo branch',()=>{
 const log=new OperationLog()
 log.prependHistorical([{op:stroke('legacy'),state:'undone',serverSeq:1}])
 log.append(stroke('new'),{pending:true});log.rejectPending('new')
 expect(log.redoTarget('A')?.id).toBe('legacy')
 log.confirm('new',2)
 expect(log.redoTarget('A')).toBeNull()
 expect(log.entries.find(e=>e.op.id==='legacy')?.goneReason).toBe('branch')
})
