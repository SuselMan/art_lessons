import {it,expect} from 'vitest'
import {createBristleInkProfile} from '../presets/brushBristleInk'
import {bristleInkTextureBytes} from './bristleInkShader'
it('packs exact canonical F32 including endpoints/subnormal and bounded padding',()=>{
 const depletion=[0,1,2**-149,Math.fround(.1),...Array.from({length:65532},(_,i)=>Math.fround(i/65532))]
 const p=createBristleInkProfile({depletion,useOpacity:true,useSaturation:false,useWeights:false,pressureWeight:0,bristleLengthWeight:0,bristleInkAmountWeight:0,inkDepletionWeight:0})
 const {bytes,width,height}=bristleInkTextureBytes(p),view=new DataView(bytes.buffer)
 expect(width).toBe(256);expect(height).toBe(256);expect(bytes.length).toBe(262144)
 for(let i=0;i<p.amount;i++)if(view.getFloat32(i*4,true)!==p.depletion[i])throw Error(`Packed curve differs at ${i}`)
})
