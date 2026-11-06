import{it,expect}from'vitest'
import{tangentNormalColor}from'./brushTangentNormal'
import{copyBrushSourceContext,brushSourceKey,isBrushSourceContext,type BrushTangentNormal,type Dab}from'@grafetto/shared'
import{DabSystem}from'../dabs/DabSystem'
const option:BrushTangentNormal={version:1,direction:'tilt',channels:[0,2,4],elevationSensitivity:1,mix:.5}
const dab:Dab={x:0,y:0,pressure:1,tiltX:0,tiltY:0,size:20,aspectRatio:1,angle:0,sourceAngle:0,opacity:1,t:0}
it('encodes the upright neutral normal and ignores foreground/pressure',()=>{
 expect(tangentNormalColor(option,dab,0)).toEqual([128/255,128/255,1])
 expect(tangentNormalColor(option,{...dab,pressure:0},1)).toEqual([128/255,128/255,1])
})
it('follows stroke direction independently of nib angle and viewport',()=>{
 const d={...option,direction:'direction' as const}
 expect(tangentNormalColor(d,{...dab,angle:1,sourceAngle:0},1)).toEqual([0,127/255,0])
 expect(tangentNormalColor(d,{...dab,sourceAngle:Math.PI/2},0)).toEqual([127/255,1,0])
 expect(tangentNormalColor({...d,elevationSensitivity:0},dab,0)[2]).toBe(1)
})
it('captures tilt direction in world space and swizzles signs',()=>{
 const tilted={...dab,tiltX:60}
 const a=tangentNormalColor(option,tilted,0),b=tangentNormalColor(option,tilted,Math.PI/2)
 expect(a).toEqual([1,128/255,0]);expect(b).toEqual([128/255,1,0])
 expect(tangentNormalColor({...option,channels:[1,3,5]},tilted,0)).toEqual([0,128/255,1])
})
it('preserves Krita linear angular mixture and elevation sensitivity',()=>{
 const mixed={...option,direction:'mix' as const,mix:0}
 expect(tangentNormalColor(mixed,{...dab,tiltY:30},0)).toEqual(tangentNormalColor(option,{...dab,tiltY:30},0))
 expect(tangentNormalColor({...mixed,elevationSensitivity:0},dab,0)).toEqual([128/255,128/255,1])
})
it('records viewport in the immutable gesture context',()=>{
 const a=copyBrushSourceContext({version:1,normalRotation:0})
 expect(isBrushSourceContext(a)).toBe(true);expect(a.normalRotation).toBe(0)
 expect(brushSourceKey(a)).not.toBe(brushSourceKey({version:1,normalRotation:1}))
 expect(isBrushSourceContext({version:1,normalRotation:NaN})).toBe(false)
})
it('records the centreline angle independently of fixed nib orientation',()=>{
 const system=new DabSystem();system.captureSourceAngle=true
 const first=system.startStroke(0,0,1,0,0,20)
 expect(first[0]?.sourceAngle).toBeTypeOf('number')
 const more=[...system.continueStroke(50,50,1,0,0,20),...system.endStroke(20)]
 expect(more.length).toBeGreaterThan(0);expect(more.every(d=>Number.isFinite(d.sourceAngle))).toBe(true)
})
