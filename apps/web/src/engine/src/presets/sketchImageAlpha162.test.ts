import{it,expect}from'vitest'
import{sketch162,mask162}from'../../../../../../packages/shared/src/sketchImageAlpha162.testFixture'
import{dab161}from'../../../../../../packages/shared/src/sketchTimer161.testFixture'
import{installBrushPixels}from'./importedBrushes'
import{prepareSketchMask}from'./sketchMask'
import{beginBrushBehavior,behaviorStampsForDab}from'./brushBehavior'
it('raw alpha gate includes opaque white and excludes coloured transparent holes without recolouring foreground',()=>{const alpha=new Uint8Array([255,255,255,255,255,0,0,255,255,0,0,255,255,255,255,255]);installBrushPixels(mask162,alpha);const b=sketch162(),d={...dab161(10),y:10,size:4},view=prepareSketchMask(b)!;expect(view.forDab(d).contains(8.5,8.5)).toBe(true);expect(view.forDab(d).contains(10,10)).toBe(false);const state=beginBrushBehavior(d);behaviorStampsForDab(b,{...d,x:8.5,y:8.5},state,[.2,.4,.8]);const lines=behaviorStampsForDab(b,d,state,[.2,.4,.8]);expect(lines.length).toBeGreaterThan(0);expect(lines.every(s=>s.color[0]===.2&&s.color[1]===.4&&s.color[2]===.8)).toBe(true)})
it('invalid marker/version rejects before existing Sketch history can advance',()=>{const b=sketch162(),d=dab161(),state=beginBrushBehavior(d),before=structuredClone(state);b.version=161;expect(()=>behaviorStampsForDab(b,d,state,[1,0,0])).toThrow('Sketch162');expect(state).toEqual(before)})
