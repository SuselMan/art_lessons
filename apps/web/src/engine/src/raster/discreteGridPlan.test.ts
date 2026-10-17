import {expect,it,vi} from 'vitest'
import {WatercolorSettlePlan} from './WatercolorSettlePlan'
import {createTestEngine} from '../../testing/engineTestUtils'
import {RibbonStrokeScratch} from '../buffers/RibbonStrokeScratch'
import {ribbonProfileFor} from '../dabs/ribbonProfile'
it.each(['m70-r2-v1','front8-detail-flow-v4'])('propagates M70-only policy through prepare, capture, and dry group: %s',model=>{
 const {engine}=createTestEngine({paper:'flat'},{width:64,height:64})
 const pool=engine['_ribbonScratchPool'],passes=engine['_watercolorPasses'],previous=engine['_settlePlan']
 const owner=new WatercolorSettlePlan((previous as unknown as {ctx:ConstructorParameters<typeof WatercolorSettlePlan>[0]}).ctx)
 engine['_wcAb'].opDry=false
 const group=vi.spyOn(owner,'groupTideOps')
 const tile=pool.acquire(64,64),scratch=new RibbonStrokeScratch(pool,true,true),bounds={minX:8,minY:8,maxX:56,maxY:56}
 engine.initLayer('policy');scratch.filmBuffers(tile);scratch.paints.add('1,0,0');scratch.paints.add('0,0,1')
 const preset=`normal:100:69:PB15:round:wc@${model}`
 scratch.noteFinish({target:engine['_layers'].get('policy')!,preset:engine['_resolvePreset']('watercolor',preset),profile:ribbonProfileFor('watercolor',preset)!,color:[1,0,0],opacity:1,bounds,fieldSeed:[0,0],landedWet:1,wetPeak:1,radiusPx:40,dwellMs:0})
 const field=vi.spyOn(passes,'fieldOp').mockImplementation(()=>{}),front=vi.spyOn(passes,'waterFrontStep').mockImplementation(()=>{}),diffuse=vi.spyOn(passes,'diffuseStep').mockImplementation(()=>{})
 let job:ReturnType<typeof owner.prepare>=null
 try{
 job=owner.prepare(scratch,[{buffer:tile,originX:0,originY:0,contentRect:null}],bounds,0,40,1,1,1,1)!
 expect(job).not.toBeNull();for(const op of job.ops)op();job.finish()
 const enabled=model==='m70-r2-v1'
 expect(group).toHaveBeenCalled();expect(group.mock.calls[0].at(-1)??false).toBe(enabled)
 expect(field.mock.calls.length).toBeGreaterThan(10);expect(front.mock.calls.length).toBeGreaterThan(0);expect(diffuse.mock.calls.length).toBeGreaterThan(0)
 for(const call of field.mock.calls)expect(call[5]?.discreteGrid??false).toBe(enabled)
 for(const call of front.mock.calls)expect(call[12]??false).toBe(enabled)
 for(const call of diffuse.mock.calls)expect(call[13]??false).toBe(enabled)
 }finally{job?.dispose();vi.restoreAllMocks();owner.destroyTextures();scratch.destroy();pool.release(tile);engine.destroy()}
})
