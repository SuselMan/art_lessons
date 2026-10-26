import { describe, expect, it } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { digitalBrushFromPreset } from '../presets/digitalBrushPresets'
import { installBrushPixels } from '../presets/importedBrushes'
import { brushPreparationResources, brushPreparationBytes, brushTextureLeaseResources, brushTextureResourceKey, brushTipResource } from './BrushPreparation'
import { BrushTextureCache } from './BrushTextureCache'

describe('physical material group residency',()=>{
  it('keeps the five-material/seven-alpha/grain/surface set within the existing lease across random frame scans',()=>{
    const asset=(index:number)=>`asset:${index.toString(16).padStart(64,'0')}` as const
    const alpha=Array.from({length:5},(_,i)=>asset(0x2400+i)),gray=Array.from({length:5},(_,i)=>asset(0x2410+i))
    const childFrames=Array.from({length:7},(_,i)=>asset(0x2420+i)),grain=asset(0x2430)
    for(const id of [...alpha,...gray,...childFrames,grain])installBrushPixels(id,new Uint8Array(512*512))
    const parent=structuredClone(digitalBrushFromPreset('hard-round')),child=structuredClone(parent)
    parent.tip={...parent.tip,mask:alpha[0],animation:{mode:'random',frames:alpha},material:{kind:'lightness',gray:gray[0],grayFrames:gray,strength:1}}
    parent.texture={id:grain,strength:1,periodPx:507,patternSize:{width:507,height:507},application:{mode:'subtract',soft:false}}
    child.tip={...child.tip,mask:childFrames[0],animation:{mode:'random',frames:childFrames}}
    parent.behavior={version:2,dual:{brush:child,sampling:'independent',blendMode:'multiply'}}
    const resources=brushPreparationResources(parent),leaseResources=brushTextureLeaseResources(parent,'stamp')
    expect(brushPreparationBytes(resources,id=>id.startsWith('asset:')?512:256)).toBe(15*1024*1024-16)
    expect(new Set(leaseResources.map(r=>r.key)).size).toBe(leaseResources.length)
    const cache=new BrushTextureCache(new MockGL() as unknown as WebGLRenderingContext)
    const release=cache.lease(leaseResources)
    let uploads=0
    for(const resource of resources){
      const key=brushTextureResourceKey(resource)
      cache.protect([key])
      if(!cache.get(key)){uploads++;cache.put(key,{} as WebGLTexture,leaseResources.find(r=>r.key===key)!.bytes)}
    }
    const warmed=uploads
    for(let i=0;i<200;i++){
      const frame=(i*7+3)%5,resource=brushTipResource(alpha[frame],gray[frame],parent.tip)
      const childKey=brushTextureResourceKey(brushTipResource(childFrames[(i*3)%7],undefined,child.tip))
      const key=brushTextureResourceKey(resource)
      cache.protect([key,childKey,'g:cloud','g:grit'])
      if(!cache.get(key))uploads++
      if(!cache.get(childKey))uploads++
    }
    expect(uploads).toBe(warmed)
    expect(cache.bytes).toBe(15*1024*1024-16)
    release()
    cache.clear()
  })
})
