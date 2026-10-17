import {expect,it} from 'vitest'
import {CheckpointStore,type Checkpoint} from './checkpointStore'
const ops=(model:string)=>Array.from({length:9},(_,i)=>({id:`s${i}`,type:'stroke',tool:'watercolor',preset:`normal:95:34:PB29:round:${model}`,washId:'same-wash'}))
const carried=(operations:ReturnType<typeof ops>):Checkpoint=>({layerId:'L',opIds:operations.slice(0,8).map(op=>op.id),tiles:[],washIds:['same-wash'],washes:[]})
it('does not seed an unsupported M70 carried snapshot into a fresh dry replay base',()=>{
 const store=new CheckpointStore(1_000_000),operations=ops('wc@m70-r2-v1'),cp=carried(operations)
 store.add(cp)
 expect(store.best('L',operations)).toBeNull()
 expect(store.startOf(cp,operations)).toBe(-1)
 // Even a checkpoint exactly at the end still needs a wet source next time.
 expect(store.best('L',operations.slice(0,8))).toBeNull()
})
it('keeps legacy carried wash checkpoints and proved closed M70 epochs reusable',()=>{
 const store=new CheckpointStore(1_000_000),legacy=ops('wc@front8-detail-flow-v4'),cp=carried(legacy)
 store.add(cp);expect(store.best('L',legacy)).toEqual({cp,start:8});expect(store.startOf(cp,legacy)).toBe(8)
 const closed:Checkpoint={layerId:'M',opIds:ops('wc@m70-r2-v1').slice(0,8).map(op=>op.id),tiles:[],closedWashIds:['same-wash'],canonicalValid:()=>true}
 store.add(closed);expect(store.best('M',ops('wc@m70-r2-v1'))).toEqual({cp:closed,start:8})
})
it('preserves the only network snapshot floor independently of material history availability',()=>{
 const store=new CheckpointStore(1_000_000);store.pinSnapshot('L',[],8)
 expect(store.best('L',ops('wc@m70-r2-v1'))?.cp.fromSnapshot).toBe(true)
})
