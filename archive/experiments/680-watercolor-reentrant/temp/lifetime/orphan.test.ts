import {it,expect,vi} from 'vitest'
import {createTestEngine} from '../../apps/web/src/engine/testing/engineTestUtils'
import {RibbonStrokeScratch} from '../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'
it('documents S2 checked-out inputs orphaned by cancellation and destroy',()=>{
 const {engine}=createTestEngine({paper:'flat'},{width:2048,height:2048});const E=engine as any;
 const pool=E._ribbonScratchPool;const tile=pool.acquire(2048,2048);const s=new RibbonStrokeScratch(pool,true,true);s.getOrCreate(tile);
 const acquire=vi.spyOn(pool,'acquire');const release=vi.spyOn(pool,'release');
 const plan=E._settlePlan.prepare(s,[{buffer:tile,originX:0,originY:0,contentRect:null}],{minX:100,minY:100,maxX:1500,maxY:1500},0,80);
 expect(plan).toBeTruthy();
 // No contacts -> first op is stitch in this fixture; half-resolution copies allocate now.
 plan.ops[0]();const created=acquire.mock.results.map((x:any)=>x.value);const destroyed=created.map((b:any)=>vi.spyOn(b,'destroy'));
 E._startSettle(s,[()=>{},...plan.ops.slice(1)],()=>plan.finish());E._cancelSettle();
 expect(release.mock.calls.filter(([b]:any)=>created.includes(b))).toHaveLength(0);
 s.destroy();pool.release(tile);engine.destroy();
 expect(destroyed.filter((spy:any)=>spy.mock.calls.length===0).length).toBeGreaterThanOrEqual(3);
 for(const b of created)b.destroy();
})
