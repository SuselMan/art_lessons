import { describe,expect,it } from 'vitest'
import { lightnessMaterialColor,lightnessMaterialCoverage,lightnessMaterialMips } from './lightnessMaterial'
import { beginBrushBehavior,behaviorStampsForDab } from './brushBehavior'
import { DIGITAL_BRUSHES } from './digitalBrushPresets'
import type { BrushDescriptor,Dab,AssetId } from '@grafetto/shared'
const asset=(n:number):AssetId=>`asset:${n.toString(16).padStart(64,'0')}`
describe('tip lightness material source gates',()=>{
  it.each([
    [.6,[.9,.3,.3]],[.9,[1,.8,.8]],[.1,[.2,0,0]],[0,[0,0,0]],[1,[1,1,1]],
  ])('uses channel shift and gamut fit for gray %s',(gray,expected)=>{
    const actual=lightnessMaterialColor([.8,.2,.2],gray,1)
    actual.forEach((c,i)=>expect(c).toBeCloseTo(expected[i],12))
  })
  it('keeps neutral/zero-strength foreground and min alpha independent of flow',()=>{
    for(const rgb of [[0,0,0],[.2,.4,.8],[1,1,1]]){
      lightnessMaterialColor(rgb,.5,1).forEach((c,i)=>expect(c).toBeCloseTo(rgb[i],12))
      lightnessMaterialColor(rgb,1,0).forEach((c,i)=>expect(c).toBeCloseTo(rgb[i],12))
    }
    expect(lightnessMaterialCoverage(.5,.3)).toBe(.3)
    expect(lightnessMaterialCoverage(.5,.3)*.2).toBe(.06)
  })
  it('filters premultiplied gray, not transparent garbage gray, without modifying CAS planes',()=>{
    const alpha=new Uint8Array([0,255,0,255]),gray=new Uint8Array([0,255,0,255])
    const levels=lightnessMaterialMips(alpha,gray)
    expect([...levels[0]]).toEqual([0,0,255,255,0,0,255,255])
    expect([...levels[1]]).toEqual([128,128])
    expect(levels[1][0]/levels[1][1]).toBe(1)
    const dark=lightnessMaterialMips(alpha,new Uint8Array([255,64,255,64]))
    expect(dark[1][0]/dark[1][1]).toBe(.25)
    expect([...alpha]).toEqual([0,255,0,255]);expect([...gray]).toEqual([0,255,0,255])
    expect(()=>lightnessMaterialMips(alpha,new Uint8Array(1))).toThrow('equal POT')
  })
  it('selects gray by the same logical index even when alpha frames repeat, with unequal child frame counts',()=>{
    const tip:BrushDescriptor['tip']={kind:'bitmap',mask:asset(1),hardness:1,aspect:1,rotation:'fixed',angle:0,animation:{mode:'incremental',frames:Array(5).fill(asset(1))},material:{kind:'lightness',gray:asset(11),grayFrames:[11,12,13,14,15].map(asset),strength:1}}
    const child:BrushDescriptor={...DIGITAL_BRUSHES[0],tip:{...tip,mask:asset(2),material:undefined,animation:{mode:'incremental',frames:[2,3,4,5,6,7,8].map(asset)}}}
    const brush:BrushDescriptor={...DIGITAL_BRUSHES[0],tip,scatter:{count:3,radius:.1,scale:1,sizeJitter:0,angleJitter:0,flowJitter:0},behavior:{version:2,dual:{brush:child,blendMode:'multiply'}}}
    const dabs:Dab[]=Array.from({length:19},(_,i)=>({x:i*10,y:20,size:20,pressure:1,angle:0,aspectRatio:1,tiltX:0,tiltY:0,opacity:1,t:i*10}))
    const state=beginBrushBehavior(dabs[0]),full=dabs.flatMap(d=>behaviorStampsForDab(brush,d,state,[.8,.2,.2]))
    let replay=beginBrushBehavior(dabs[0]);const chunks:typeof full=[]
    for(let i=0;i<dabs.length;i+=4){chunks.push(...dabs.slice(i,i+4).flatMap(d=>behaviorStampsForDab(brush,d,replay,[.8,.2,.2])));replay=structuredClone(replay)}
    expect(chunks).toEqual(full)
    for(let i=0;i<dabs.length;i++) for(const stamp of full.slice(i*3,i*3+3)){
      expect(stamp.mask).toBe(asset(1));expect(stamp.gray).toBe(asset(11+i%5));expect(stamp.dualMask).toBe(asset(2+i%7));expect(stamp.dualGray).toBeUndefined()
    }
    expect(state.dabOrdinal).toBe(dabs.length)
  })
})
