import{expect,it}from'vitest'
import type{BrushHatching}from'@grafetto/shared'
import{hatchingPlacement,hatchingPlane}from'./brushHatching'
import{isBrushHatching}from'../../../../../../packages/shared/src/brushHatching'
import{hatchingStampFragment}from'../raster/brushHatchingShader'
import{createBrushStampFragment}from'../raster/brushBehaviorShaders'
const h:BrushHatching={version:1,angle:0,separation:8,thickness:2,origin:[0,0],style:'none',intervals:4,antialias:true,subpixel:true}
const c={angle:1,cross:1,separation:1,thickness:1}
it('always draws configured unchecked cross passes but gates checked ones',()=>{expect(hatchingPlacement({...h,style:'perpendicular'},c).angles).toEqual([Math.PI/2,0]);expect(hatchingPlacement({...h,style:'perpendicular',dynamics:{cross:[]}},{...c,cross:.5}).angles).toEqual([0]);expect(hatchingPlacement({...h,style:'minusPlus',dynamics:{cross:[]}},{...c,cross:.5}).angles).toEqual([-Math.PI/4,0])})
it('moire replaces the base hatch and uses the cross sensor angle',()=>{expect(hatchingPlacement({...h,style:'moire'},c).angles[0]).toBeCloseTo(-10*Math.PI/180);expect(hatchingPlacement({...h,style:'moire',dynamics:{cross:[]}},{...c,cross:.25}).angles).toEqual([Math.PI/2])})
it('uses native closed-upper dyadic separation intervals',()=>{const b={...h,dynamics:{separation:[]}};expect([0,.25,.5,.75,1].map(separation=>hatchingPlacement(b,{...c,separation}).separation)).toEqual([16,16,8,4,2])})
it('rounds thickness and retains a minimum one-pixel contact',()=>{expect(hatchingPlacement(h,{...c,thickness:0}).thickness).toBe(1);expect(hatchingPlacement({...h,thickness:2.6},c).thickness).toBe(3)})
it('world phase matches across tile boundaries and negative coordinates',()=>{const angle=.37,sep=18,a=hatchingPlane(angle,sep,[20,-30],-512,0,true),b=hatchingPlane(angle,sep,[20,-30],0,0,true);const mod=(v:number)=>(v%sep+sep)%sep;expect(mod(a[0]*512+a[2])).toBeCloseTo(b[2],10);expect(a[2]).toBeGreaterThanOrEqual(0);expect(a[2]).toBeLessThan(sep)})
it('validates geometry and generates an opt-in shader without changing legacy',()=>{expect(isBrushHatching(h)).toBe(true);expect(isBrushHatching({...h,separation:0})).toBe(false);expect(isBrushHatching({...h,extra:true})).toBe(false);const legacy=createBrushStampFragment(true,true,true),s=hatchingStampFragment(legacy);expect(s).toContain('hatchLine');expect(legacy).not.toContain('hatchLine');expect(()=>hatchingStampFragment('bad')).toThrow()})
