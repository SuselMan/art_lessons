import{it,expect}from'vitest'
import{isBrushLibrary}from'./brushes.js'
import{usesRecordedPen188Controls}from'./brushRecordedPen188.js'
import{recordedPen188Library}from'./recordedPen188.testFixture.js'
it('bounded behavior detection skips descriptor hairs; child orphan is still recursively rejected',()=>{
 const l=recordedPen188Library(),d=l.brushes[0].descriptor;let reads=0;const huge={get hairs(){reads++;throw Error('must not scan numeric geometry')}};Reflect.set(d,'bristle',huge);expect(usesRecordedPen188Controls(d.behavior)).toBe(true);expect(isBrushLibrary(l)).toBe(false);expect(reads).toBe(0);delete d.bristle;const child=structuredClone(d);child.version=60;delete d.behavior!.modulations;d.version=60;d.behavior!.dual={brush:child,sampling:'inline',blendMode:'multiply'};Reflect.set(child,'bristle',huge);expect(usesRecordedPen188Controls(d.behavior)).toBe(false);expect(reads).toBe(0);delete child.bristle;expect(isBrushLibrary(l)).toBe(false);expect(reads).toBe(0)
})
