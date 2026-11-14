import {describe,it,expect} from 'vitest'
import {hasFilterMask192Scope,isBrushLibrary,hasBrushSourceInputs,hasFilterGaussian153Scope,hasFilterUnsharp159Scope} from './brushes.js'
import {filter192,library192,FILTER192_MASK,FILTER192_FRAME,FILTER192_TEXTURE} from './filterMask192.testFixture.js'
import {filterLibrary147} from './filterSmudge147.testFixture.js'
describe('whole native Filter192 mask contract',()=>{
  it.each(['invert','desaturate','posterize','gaussian','unsharp'] as const)('%s accepts both real source update modes',kind=>{
    for(const mode of [false,true]){const b=filter192(kind,mode);expect(hasFilterMask192Scope(b)).toBe(true);expect(isBrushLibrary(library192(b))).toBe(true);expect(hasFilterGaussian153Scope(b)).toBe(kind==='gaussian');expect(hasFilterUnsharp159Scope(b)).toBe(kind==='unsharp')}
  })
  it('validates actual referenced unequal GIH frames and each selector without a Pixel descriptor',()=>{
    for(const mode of ['incremental','pressure','velocity'] as const){const b=filter192();b.tip={kind:'bitmap',mask:FILTER192_MASK,hardness:1,aspect:1,angle:0,rotation:'fixed',maskBounds:{x:0,y:0,width:1,height:1},animation:{mode,frames:[FILTER192_MASK,FILTER192_FRAME],geometry:{version:1,frames:[{sourceWidth:4,sourceHeight:4,maskBounds:{x:0,y:0,width:1,height:1}},{sourceWidth:2,sourceHeight:4,maskBounds:{x:0,y:0,width:1,height:1}}]}}};if(mode!=='incremental')b.tip.animation!.rank=2;if(mode==='velocity')b.behavior!.speedInput={version:1,space:'view',maximum:30,estimator:'grafettoEMA30ms'};expect(isBrushLibrary(library192(b)),mode).toBe(true)}
  })
  it('accepts native auto shapes, density and randomness in the common mask',()=>{
    const b=filter192();b.tip.autoShape={version:1,spikes:5};b.tip.autoNoise={version:1,density:.6,randomness:.4};expect(isBrushLibrary(library192(b))).toBe(true)
    delete b.tip.autoShape;b.tip.profile={kind:'gaussian2D',shape:'ellipse',horizontalFade:.3,verticalFade:.7,antialias:true};expect(isBrushLibrary(library192(b))).toBe(true)
  })
  it('allows the native circle curve antialias flag only in the new whole mask scope',()=>{
    const b=filter192();b.tip.profile={kind:'radialCurve',lookup:FILTER192_MASK,resolution:1,encoding:'unorm32be',antialias:true};expect(isBrushLibrary(library192(b))).toBe(true)
    b.version=147;expect(isBrushLibrary(library192(b))).toBe(false)
  })
  it('keeps scalar texture modes and static destination opacity independent of the kernel',()=>{
    for(const mode of ['multiply','subtract','height','linearHeight','heightPhotoshop','linearHeightPhotoshop'] as const){const b=filter192();b.opacity=.4;b.texture={id:FILTER192_TEXTURE,strength:.75,periodPx:4,patternSize:{width:4,height:4},application:{mode,soft:false}};expect(isBrushLibrary(library192(b))).toBe(true)}
  })
  it('rejects Pixel-only controls, foreign engines and disguised color paint',()=>{
    for(const field of ['opacity','flow','softness','sharpness','scatter'] as const){const b=filter192();b.behavior!.dynamics={[field]:{control:'pressure',minimum:0,jitter:0}};expect(isBrushLibrary(library192(b))).toBe(false)}
    const b=filter192();b.tip.color={planes:[FILTER192_MASK,FILTER192_MASK,FILTER192_MASK]};expect(isBrushLibrary(library192(b))).toBe(false)
  })
  it('requires canonical recorded geometry before queue/replay acceptance',()=>{
    const b=filter192(),d={x:0,y:0,size:16,pressure:1,tiltX:0,tiltY:0,aspectRatio:1,angle:0,opacity:1,t:0,sourceSize:16,sourceScale:1,sourceAngle:Math.PI/7};expect(hasBrushSourceInputs(b,[d])).toBe(true);expect(hasBrushSourceInputs(b,[{...d,sourceSize:undefined}])).toBe(false);expect(hasBrushSourceInputs(b,[{...d,sourceScale:.1}])).toBe(false)
  })
  it('does not widen historical147 or allow an orphan192 mask',()=>{
    expect(isBrushLibrary(filterLibrary147())).toBe(true);const old=filterLibrary147();old.brushes[0].descriptor.tip=filter192().tip;expect(isBrushLibrary(old)).toBe(false);const b=filter192();delete b.filter;expect(isBrushLibrary(library192(b))).toBe(false)
  })
})
