import { expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { createTestEngine } from '../../../../apps/web/src/engine/testing/engineTestUtils'
// QA runtime wrapper only: no production module imports it.
// @ts-expect-error private diagnostic .mjs intentionally outside TS source
import { installFirstDownAllocation } from './allocation.mjs'

it('records actual cold native first-dab calls for sizes100/400 without a preceding settle', async () => {
  const results=[]
  for (const size of [100,400]) {
    const {engine}=createTestEngine({pageWidth:1754,pageHeight:2480,paper:'fine',gradientFibres:true,asyncFinish:false,materialPresentation:false}, {width:640,height:480})
    let probe: ReturnType<typeof installFirstDownAllocation> | undefined
    try {
      engine.setBaseLayers(['layer-1']);engine.setActiveLayer('layer-1');engine.setCompositeOrder([{id:'layer-1',opacity:1}]);
      await engine.paperReady();engine.setLocked(false);engine.setTool('watercolor');engine.setPencil('normal:100:100:PB29:round');engine.setSize(size)
      const seam=engine as unknown as {_onStart:(event:unknown)=>void;_settle:unknown}
      expect(seam._settle).toBeNull()
      probe=installFirstDownAllocation(engine)
      seam._onStart({x:400,y:400,pressure:.8,tiltX:0,tiltY:0,speed:0,pointerType:'pen',timeStamp:performance.now()})
      probe.stop()
      expect(probe.summary().dropped).toBe(0)
      expect(probe.rows.filter((r:{name:string;size?:number[]})=>r.name==='rgba8-storage'&&r.size?.[0]===1024&&r.size?.[1]===1024)).toHaveLength(8)
      expect(probe.rows.filter((r:{name:string})=>r.name==='checkFramebufferStatus-enter'||r.name==='createProgram-enter'||r.name==='compileShader-enter'||r.name==='linkProgram-enter')).toHaveLength(0)
      expect(probe.rows.some((r:{name:string})=>r.name==='_paintDabs-enter')).toBe(true)
      expect(probe.rows.some((r:{name:string})=>r.name==='getOrCreate-enter')).toBe(true)
      expect(probe.rows.some((r:{name:string})=>r.name==='draw-submitted')).toBe(true)
      results.push({size,summary:probe.summary(),rows:probe.rows})
    } finally {probe?.dispose();engine.destroy()}
  }
  writeFileSync('temp/cpu/first-down-actual-calls.json',JSON.stringify({source:'27ee2f12',scope:'actual engine/MockGL reachable calls; NOT device timings or pixel-visible proof',results},null,2))
},60000)
