import{expect,it}from'vitest'
import{CheckpointStore,crossesGridGesture,hasOpenGridGesture,type WashOp}from'./checkpointStore'
const grid=(op:WashOp)=>op.preset==='positiveGrid'
const A=(id:string,preset='positiveGrid',strokeEnd=false):WashOp=>({id,type:'stroke',tool:'digitalBrush',userId:'u',strokeId:'A',preset,strokeEnd})
it('does not split canonical Grid across A1/B/A2, including a checkpoint made before tail discovery',()=>{
 const s=new CheckpointStore(100,grid),first=A('A1'),foreign:WashOp={id:'B'}
 s.add({layerId:'L',opIds:['A1','B'],tiles:[]})
 expect(s.best('L',[first,foreign])?.start).toBe(2)
 expect(s.best('L',[first,foreign,A('A2','positiveGrid',true)])).toBeNull()
 s.add({layerId:'L',opIds:['A1','B','A2'],tiles:[]});expect(s.best('L',[first,foreign,A('A2','positiveGrid',true)])?.start).toBe(3)
})
it('metadata-only empty BEGIN does not move the source capture before intervening B',()=>{
 const ops=[A('empty','metadata'),{id:'B'},A('firstPositive')]
 expect(crossesGridGesture(ops,2,grid)).toBe(false)
 expect(hasOpenGridGesture(ops,grid)).toBe(true)
 expect(hasOpenGridGesture([...ops,A('end','metadata',true)],grid)).toBe(false)
})

it('a stale END for A cannot close an open B; a matching empty END can',()=>{
 const b={...A('B1'),strokeId:'B'}
 expect(hasOpenGridGesture([b,A('staleA','metadata',true)],grid)).toBe(true)
 expect(hasOpenGridGesture([b,A('staleA','metadata',true),{...A('endB','metadata',true),strokeId:'B'}],grid)).toBe(false)
})
