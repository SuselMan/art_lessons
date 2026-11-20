import {prepareRadialSoftnessBasis} from './radialSoftness'
import {expect,it} from 'vitest'
import {autoSpikeFold,autoSpikeAllocation} from './autoSpikes'
import {proceduralMaskAlpha,proceduralSampleCount} from './brushProcedural'
import {brushFootprintBounds} from '../dabs/brushFootprint'
import {createBrushStampFragment} from './brushBehaviorShaders'
import {gaussianTransparency} from './gaussianTip'

it('matches native sector rotations at odd/even counts without a star primitive',()=>{
 for(const count of [3,4,5,20])for(const theta of [.01,.2,1,2,Math.PI]){
  const r=8,x=r*Math.cos(theta),y=r*Math.sin(theta)
  // Independent closed-form sector identity; production retains native loop.
  const sector=Math.PI/count,k=Math.max(0,Math.ceil((theta-sector)/(2*sector)))
  const angle=theta-k*2*sector
  const actual=autoSpikeFold(x,y,count)
  expect(actual[0]).toBeCloseTo(r*Math.cos(angle),11)
  expect(actual[1]).toBeCloseTo(r*Math.sin(angle),11)
 }
 const boundary=Math.PI/5
 expect(autoSpikeFold(8*Math.cos(boundary-1e-8),8*Math.sin(boundary-1e-8),5)[1]).toBeGreaterThan(0)
 expect(autoSpikeFold(8*Math.cos(boundary+1e-8),8*Math.sin(boundary+1e-8),5)[1]).toBeLessThan(0)
 expect(autoSpikeFold(0,0,3)).toEqual([0,0])
 expect(()=>autoSpikeFold(1,2,21)).toThrow(RangeError)
})
it('retains the standard-rectangle abs ordering that differs from circles for odd counts',()=>{
 const circle=autoSpikeFold(-3,7,3),rectangle=autoSpikeFold(-3,7,3,true)
 expect(Math.abs(circle[1])).toBeLessThan(2)
 expect(Math.abs(rectangle[1])).toBeGreaterThan(6)
 const ellipse={kind:'standard',shape:'ellipse',horizontalFade:1,verticalFade:1,antialias:false} as const
 const rect={...ellipse,shape:'rectangle'} as const
 expect(proceduralMaskAlpha(-3,7,20,4,ellipse,0,undefined,1,undefined,3)).toBe(255)
 expect(proceduralMaskAlpha(-3,7,20,4,rect,0,undefined,1,undefined,3)).toBe(0)
})
it('places spikes outside the source ellipse while respecting native square allocation',()=>{
 const p={kind:'standard',shape:'ellipse',horizontalFade:1,verticalFade:1,antialias:false} as const
 expect(proceduralMaskAlpha(0,8,20,4,p)).toBe(0)
 expect(proceduralMaskAlpha(0,8,20,4,p,0,undefined,1,undefined,4)).toBe(255)
 const rect={...p,shape:'rectangle'} as const,angle=Math.PI/4
 const x=3*Math.cos(angle)-10.5*Math.sin(angle),y=3*Math.sin(angle)+10.5*Math.cos(angle)
 expect(proceduralMaskAlpha(x,y,20,20,rect,angle,undefined,1,undefined,3)).toBe(255)
 expect(proceduralMaskAlpha(3,10.5,20,20,rect,0,undefined,1,undefined,3)).toBe(0)
 const allocation=autoSpikeAllocation(2,5,4)
 expect(allocation).toEqual({radius:10,aspect:1})
 const bounds=brushFootprintBounds(-128,-64,allocation.radius,allocation.aspect,angle)!
 expect(bounds.minY).toBeCloseTo(-64-10*Math.SQRT2)
 expect(bounds.maxX).toBeCloseTo(-128+10*Math.SQRT2)
 expect(autoSpikeAllocation(2,5)).toEqual({radius:2,aspect:5})
})
it('preserves source ratio and source-axis AA thresholds for folded Gaussian masks',()=>{
 const p={kind:'gaussian',fade:.5,antialias:false} as const
 const folded=autoSpikeFold(-3,7,3)
 const expected=255-gaussianTransparency(folded[0],folded[1]*5,10,.5,false)
 expect(proceduralMaskAlpha(-3,7,20,4,p,0,undefined,1,undefined,3)).toBe(expected)
 expect(proceduralSampleCount(4,true)).toBe(3)
 expect(proceduralSampleCount(.5,true)).toBe(6)
 // Gaussian setSoftness is inherited storage only; its coverage ignores it.
 for(const s of [0,.2,1])expect(proceduralMaskAlpha(-3,7,20,4,p,0,undefined,s,undefined,3)).toBe(expected)
})
it('emits primary/mask folding before source normalization and old-count delegation',()=>{
 const shader=createBrushStampFragment(true,true,true)
 expect(shader).toContain('if(spikes<2.5)return brushProceduralMaskWithSoftness')
 expect(shader).toContain('vec2 p=brushAutoSpikeFold(point,spikes,profile.x>1.5&&profile.x<2.5)')
 expect(shader).toContain('p.y*radii.x/radii.y')
 expect(shader).toContain('u_autoSpikes.x,u_autoSpikeAngle')
 expect(shader).toContain('u_dualSoftness,u_autoSpikes.y)')
 expect(shader).toContain('dualUV=(mat2(c,-s,s,c)*pixel)/u_dualProceduralGeometry.xy')
 expect(shader).toContain('dualUV *= u_dualFlip')
 expect(createBrushStampFragment(true,false,false)).not.toContain('brushAutoSpikeFold')
})
it('keeps historical count2 samples and uses the folded q for the dynamic soft basis',()=>{
 const profiles=[{kind:'standard',shape:'ellipse',horizontalFade:.7,verticalFade:.3,antialias:false},{kind:'standard',shape:'rectangle',horizontalFade:.7,verticalFade:.3,antialias:false},{kind:'gaussian',fade:.5,antialias:true}] as const
 for(const p of profiles)for(const x of [-10,-3,0,2,8])expect(proceduralMaskAlpha(x,2,20,4,p,.3,undefined,1,undefined,2)).toBe(proceduralMaskAlpha(x,2,20,4,p,.3))
 const bytes=new Uint8Array(24),view=new DataView(bytes.buffer)
 for(const i of [1,2])view.setUint32(i*8+4,0xffffffff,false)
 const basis=prepareRadialSoftnessBasis(bytes,{resolution:1,minimum:0,span:1})
 const p={kind:'radialCurveSoftness',lookup:`asset:${'b'.repeat(64)}`,resolution:1,encoding:'softness-affine-unorm32be-v1',minimum:0,span:1,antialias:false} as const
 expect(proceduralMaskAlpha(0,8,20,4,p,0,undefined,1,basis)).toBe(0)
 expect(proceduralMaskAlpha(0,8,20,4,p,0,undefined,1,basis,4)).toBe(164)
 expect(proceduralMaskAlpha(0,8,20,4,p,0,undefined,.5,basis,4)).toBe(82)
})
