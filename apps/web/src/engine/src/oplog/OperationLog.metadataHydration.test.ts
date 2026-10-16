import {expect,it} from 'vitest'
import {OperationLog} from './OperationLog'
import {makeStroke,dab} from '../../testing/engineTestUtils'
it('metadata-only backfill confirms and reorders held IDs without adding or resurrecting undone strokes',()=>{
 const log=new OperationLog()
 const first=makeStroke('A','L',[dab(1,1)],{id:'first'})
 const later=makeStroke('B','L',[dab(2,2)],{id:'later'})
 log.append(first,{pending:true})
 log.append(later,{serverSeq:2})
 log.applyUndo(first.id,'A')
 expect(log.absorbHistorical([{...first,seq:1},{...later,seq:2}])).toEqual([])
 expect(log.entries.map(e=>e.op.id)).toEqual(['first','later'])
 expect(log.entries.map(e=>e.serverSeq)).toEqual([1,2])
 expect(log.entries[0].pending).toBeFalsy()
 expect(log.entries[0].state).toBe('undone')
 expect(log.pixelOpDoneCount('L')).toBe(1)
 const revision=log.revision
 log.absorbHistorical([{...first,seq:1},{...later,seq:2}])
 expect(log.revision).toBe(revision)
})
