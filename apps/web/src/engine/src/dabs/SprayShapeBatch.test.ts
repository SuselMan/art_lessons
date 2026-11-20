import { expect, it, vi } from 'vitest'
import { MockGL } from '../../testing/mockGL'
import { SprayShapeBatch } from './SprayShapeBatch'
import { beginBrushBehavior, behaviorStampsForDab } from '../presets/brushBehavior'
import { DIGITAL_BRUSHES } from '../presets/digitalBrushPresets'
import type { Dab } from '@grafetto/shared'
it('uploads large populations in bounded ordered draw calls and releases attributes',()=>{
 const mock=new MockGL(),gl=mock as unknown as WebGLRenderingContext,draw=vi.spyOn(gl,'drawArrays'),disable=vi.spyOn(gl,'disableVertexAttribArray')
 const dab:Dab={x:50,y:50,size:10,angle:0,aspectRatio:1,pressure:1,opacity:1,t:0,tiltX:0,tiltY:0}
 const stamp=behaviorStampsForDab({...DIGITAL_BRUSHES[0],behavior:{version:2}},dab,beginBrushBehavior(dab),[1,0,0])[0]
 const placed={...stamp,radius:5,flow:1,ceiling:1,pressure:1}
 const batch=new SprayShapeBatch(gl);batch.prepare();batch.paint(Array.from({length:2070},()=>({...placed})),'ellipse',0,0,100,100)
 expect(draw.mock.calls.map(c=>c[2])).toEqual([2048*6,22*6]);expect(disable).toHaveBeenCalledTimes(4);batch.destroy()
})
