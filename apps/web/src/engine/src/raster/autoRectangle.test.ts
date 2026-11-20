import {describe,it,expect} from 'vitest'
import {prepareGaussianRectangle,gaussianRectangleTransparency,prepareCurveRectangle,curveRectangleTransparency,rectangleEdgeTransparency,autoRectangleAlpha,BRUSH_AUTO_RECTANGLE_GLSL,gaussianEllipseAlpha,gaussianRectangleUniforms} from './autoRectangle'
function table(values:number[],affine=false):Uint8Array {
 const out=new Uint8Array(values.length*(affine?8:4)),view=new DataView(out.buffer)
 values.forEach((n,i)=>{view.setUint32(i*(affine?8:4),Math.round(n*4294967295));if(affine)view.setUint32(i*8+4,Math.round((1-n)*4294967295))});return out
}
describe('native-principle rectangle generators',()=>{
 it('Gaussian preserves independent axes/fades and normalized center',()=>{
  const p=prepareGaussianRectangle(20,5,0,1,false)
  // Normalization is mathematically255; native-order floating truncation can yield254.
  expect(gaussianRectangleTransparency(0,0,p)).toBeLessThanOrEqual(1)
  expect(gaussianRectangleTransparency(21,0,p)).toBe(255)
  expect(gaussianRectangleTransparency(10,0,p)).not.toBe(gaussianRectangleTransparency(0,2.5,p))
  const uniforms=gaussianRectangleUniforms(p)
  expect(uniforms.geometry).toEqual([20,5,expect.any(Number),0])
  expect(uniforms.coefficients.every(Number.isFinite)).toBe(true)
  const swapped=prepareGaussianRectangle(5,20,1,0,false)
  expect(gaussianRectangleTransparency(10,2,p)).toBe(gaussianRectangleTransparency(2,10,swapped))
 })
 it('2D edge fader quantizes X then Y, including subpixel negative starts',()=>{
  // Native quint8 base200; X=.5 gives227; Y=.5 gives241.
  expect(rectangleEdgeTransparency(3.5,2.5,4,3,true,()=>200)).toBe(241)
  expect(rectangleEdgeTransparency(0,0,.25,.25,true,()=>0)).toBe(239)
  expect(rectangleEdgeTransparency(4,0,4,3,true,()=>0)).toBe(255)
  expect(rectangleEdgeTransparency(3.5,2.5,4,3,false,()=>200)).toBe(200)
 })
 it('curve rectangle uses four nearest indexed complementary samples, not radius',()=>{
  // C=[0,.25,.5,.75,1]. At center C0=0 => transparency255;
  // at normalized .5,.5 product .5^4=1/16 => floor239.0625.
  const p=prepareCurveRectangle(table([0,.25,.5,.75,1,1]),4,false)
  expect(curveRectangleTransparency(0,0,10,5,p)).toBe(255)
  expect(curveRectangleTransparency(5,2.5,10,5,p)).toBe(239)
  expect(curveRectangleTransparency(10.01,0,10,5,p)).toBe(255)
  // nearest sample index switches at .125; no radial interpolation.
  expect(curveRectangleTransparency(1.24,2.5,10,5,p)).toBe(255)
  expect(curveRectangleTransparency(1.26,2.5,10,5,p)).toBe(251)
 })
 it('affine softness reconstructs before complementary multiplication and owns bytes',()=>{
  const bytes=table([0,.25,.5,.75,1,1],true)
  const p=prepareCurveRectangle(bytes,4,false,{minimum:0,span:1})
  expect(curveRectangleTransparency(0,0,10,5,p,0)).toBe(255)
  expect(curveRectangleTransparency(0,0,10,5,p,.5)).toBe(239)
  expect(curveRectangleTransparency(0,0,10,5,p,1)).toBe(0)
  bytes.fill(255)
  expect(curveRectangleTransparency(0,0,10,5,p,.5)).toBe(239)
  expect(()=>curveRectangleTransparency(0,0,10,5,p,NaN)).toThrow(RangeError)
 })
 it('rotation/spikes retain source ratio and stencil results are bounded',()=>{
  const p=prepareGaussianRectangle(8,2,.5,.8,false)
  const a=autoRectangleAlpha(2,1,8,2,0,2,p)
  expect(autoRectangleAlpha(-1,2,8,2,Math.PI/2,2,p)).toBe(a)
  for(const n of [2,3,7,20])for(let y=-10;y<=10;y++)for(let x=-10;x<=10;x++){
   const v=autoRectangleAlpha(x,y,8,2,.4,n,p);expect(Number.isInteger(v)&&v>=0&&v<=255).toBe(true)
  }
 })
 it('rejects unprepared and malformed inputs without changing old profiles',()=>{
  expect(()=>prepareGaussianRectangle(0,1,.5,.5,false)).toThrow(RangeError)
  expect(()=>prepareGaussianRectangle(1,1,NaN,.5,false)).toThrow(RangeError)
  expect(()=>prepareCurveRectangle(new Uint8Array(1),4,false)).toThrow(RangeError)
  expect(()=>gaussianRectangleTransparency(0,0,{rx:1,ry:1,antialias:false})).toThrow(TypeError)
  const p=prepareCurveRectangle(table([0,.25,.5,.75,1,1]),4,false)
  expect(()=>curveRectangleTransparency(0,0,1,1,p,.5)).toThrow('affine basis')
 })
 it('GLSL assembly explicitly uses nearest complementary samples and sequential edge fade',()=>{
  expect(BRUSH_AUTO_RECTANGLE_GLSL).toContain('floor(a/radii*p.x+0.5)')
  expect(BRUSH_AUTO_RECTANGLE_GLSL).toContain('p.x-ij.x')
  expect(BRUSH_AUTO_RECTANGLE_GLSL).toContain('sx*(1.0-tx)*sy*(1.0-ty)')
  expect(BRUSH_AUTO_RECTANGLE_GLSL.indexOf('if(a.x>')).toBeLessThan(BRUSH_AUTO_RECTANGLE_GLSL.indexOf('if(a.y>'))
  expect(BRUSH_AUTO_RECTANGLE_GLSL).not.toContain('dot(point,point)')
 })
})

it('explicit Gaussian ellipse keeps circular law but scales the native source Y after fold',()=>{
 expect(gaussianEllipseAlpha(4,1,10,2,.5,false)).toBe(gaussianEllipseAlpha(4,5,10,10,.5,false))
 expect(gaussianEllipseAlpha(0,2.1,10,2,.5,false)).toBe(0)
 expect(()=>gaussianEllipseAlpha(0,0,10,2,0,false)).toThrow(RangeError)
 for(const s of [2,3,20])expect(gaussianEllipseAlpha(0,0,10,2,.5,true,0,s)).toBeGreaterThan(0)
})
