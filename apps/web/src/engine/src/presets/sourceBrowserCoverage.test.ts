import {expect,it,vi} from 'vitest'
import {sourceDabGeometryEqual} from './sourceDabCache'
import type {SourceDefaultAutoData} from '@grafetto/shared'
import * as f64 from './sourceFmaF64'
import {prepareSourceGaussianDab} from './sourceGaussianDab'
import * as f32 from './sourceFmaF32'
import {prepareSourceDefaultAutoMask} from './sourceDefaultAutoMaskReference'
import {compileSourceSoftCircleProgram,prepareSourceSoftCircleDab} from './sourceSoftCircleDab'
import tables from './fixtures/sourceSoftCircle/tables.native.json'
import {sourceGaussianBrowserErf} from './sourceGaussianBionicErf'
import {prepareSourceGaussianResolvedMask} from './sourceGaussianResolvedMaskReference'
const profile='browser-number-coverage-v1' as const
function drain(e:ReturnType<typeof prepareSourceDefaultAutoMask>,step:number){const a=new Uint8Array(e.pixels);while(!e.done)e.advance(a,e.completedPixels,step);return a}
for(const shape of ['circle','rect'] as const)it(`browser ${shape} coverage is bounded, stripe-independent, and calls no native FMA`,()=>{
 const a=vi.spyOn(f64,'sourceFmaF64'),b=vi.spyOn(f32,'sourceFmaF32')
 try{const request={tip:{kind:'auto' as const,generator:'default' as const,shape,diameter:6,ratio:.7,horizontalFade:1,verticalFade:1,antialias:true,spikes:2 as const,softness:1 as const,randomness:0 as const,density:1 as const},profile,scaleX:1,scaleY:1,cos:Math.cos(.3),sin:Math.sin(.3),centerX:6,centerY:6,width:13,height:13,maxPixels:169,maxWorkSamples:169*36}
 const e=prepareSourceDefaultAutoMask(request),bytes=drain(e,7)
 expect(e.route).toBe('browser-number');expect(e.samplesPerPixel).toBe(9);expect(bytes).toEqual(drain(prepareSourceDefaultAutoMask(request),65536));expect(bytes[0]).toBe(0);expect(Math.max(...bytes)).toBeGreaterThan(100)
 expect(()=>prepareSourceDefaultAutoMask({...request,maxPixels:1})).toThrow();const cancelled=prepareSourceDefaultAutoMask(request);cancelled.cancel();expect(()=>cancelled.advance(new Uint8Array(1),0,1)).toThrow()
 expect(a).not.toHaveBeenCalled();expect(b).not.toHaveBeenCalled()
 }finally{a.mockRestore();b.mockRestore()}
})
it('browser Gaussian uses the same bounded cursor without native FMA',()=>{
 const a=vi.spyOn(f64,'sourceFmaF64'),b=vi.spyOn(f32,'sourceFmaF32')
 try{const request={profile,coefficients:{ycoef:1,center:-2,distfactor:1,alphafactor:-127.5,radius:4,fadeStartValue:200,fadeStart:3,fadeCoeff:55},effectiveWidth:8,effectiveHeight:8,antialias:true,centerX:5,centerY:5,cos:1,sin:0,width:11,height:11,maxPixels:121,maxWorkSamples:4356}
 const e=prepareSourceGaussianResolvedMask(request);expect(e.route).toBe('browser-number');const bytes=drain(e,5);expect(bytes).toEqual(drain(prepareSourceGaussianResolvedMask(request),9999));expect(bytes[0]).toBe(0);expect(bytes[60]).toBeGreaterThan(240);expect(a).not.toHaveBeenCalled();expect(b).not.toHaveBeenCalled()
 }finally{a.mockRestore();b.mockRestore()}
})

it('browser soft samples the retained radial program without native FMA',()=>{
 const row=tables.constructors[0],g=row.generator
 const program=compileSourceSoftCircleProgram({kind:'auto',generator:'soft',shape:'circle',diameter:+g.diameter,ratio:+g.ratio,horizontalFade:+g.hfade,verticalFade:+g.vfade,spikes:2,softness:1,randomness:0,density:1,antialias:false},{points:row.points,coefficients:row.coefficients.map(c=>[c[0],c[1],c[2],c[3]]as const)},row.values.length)
 const a=vi.spyOn(f64,'sourceFmaF64'),b=vi.spyOn(f32,'sourceFmaF32')
 try{const request={dialect:'krita-soft-circle-qt5-arm64-v1' as const,program,storedScale:.1,storedAngle:.2,shape:{scale:.1,ratio:.7,rotation:.3},subpixelX:.2,subpixelY:.4,coverageProfile:profile,maxPixels:1048576,maxWorkSamples:16777216}
 const e=prepareSourceSoftCircleDab(request).evaluator;expect(e.route).toBe('browser-number');const bytes=drain(e,3);expect(bytes).toEqual(drain(prepareSourceSoftCircleDab(request).evaluator,9999));expect(Math.max(...bytes)).toBeGreaterThan(100);expect(a).not.toHaveBeenCalled();expect(b).not.toHaveBeenCalled()
 }finally{a.mockRestore();b.mockRestore()}
})
it('browser erf retains independently known values, odd symmetry and monotonicity',()=>{
 const values=[0,.1,.5,1,2,3,6],expected=[0,.1124629160182849,.5204998778130465,.8427007929497149,.9953222650189527,.9999779095030014,1]
 for(let i=0;i<values.length;i++){const x=values[i],v=sourceGaussianBrowserErf(x);expect(v).toBeCloseTo(expected[i],14);expect(sourceGaussianBrowserErf(-x)).toBeCloseTo(-v,14);if(i)expect(v).toBeGreaterThan(sourceGaussianBrowserErf(values[i-1]))}
})

it('whole browser Gaussian preparation including coefficients calls no native FMA',()=>{
 const a=vi.spyOn(f64,'sourceFmaF64'),b=vi.spyOn(f32,'sourceFmaF32')
 try{const e=prepareSourceGaussianDab({dialect:'krita-gaussian-auto-qt5-arm64-v1',tip:{kind:'auto',generator:'gauss',shape:'circle',diameter:8,ratio:.7,horizontalFade:.5,verticalFade:.8,spikes:2,softness:1,randomness:0,density:1,antialias:true},storedScale:1,storedAngle:.2,shape:{scale:1,ratio:.8,rotation:.1},subpixelX:.2,subpixelY:.3,coverageProfile:profile,maxPixels:1024,maxWorkSamples:36864}).evaluator
 expect(Math.max(...drain(e,17))).toBeGreaterThan(100);expect(a).not.toHaveBeenCalled();expect(b).not.toHaveBeenCalled()
 }finally{a.mockRestore();b.mockRestore()}
})

it('browser coverage cannot share native dab geometry cache identity',()=>{
 const source:SourceDefaultAutoData={kind:'defaultAuto',generator:'default',shape:'circle',diameter:8,ratio:1,horizontalFade:1,verticalFade:1,spikes:2,randomness:0,density:1,antialias:true}
 const browser={kind:'defaultAuto' as const,source,coverageProfile:profile}
 expect(sourceDabGeometryEqual(browser,{...browser})).toBe(true)
 expect(sourceDabGeometryEqual(browser,{...browser,coverageProfile:'scalar-f64-fma-v1'})).toBe(false)
})
