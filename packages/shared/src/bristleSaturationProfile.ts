import {isBristleInk,type BrushBristleInk} from './brushBristle.js'

/** Canonical immutable compiler input; SHA-256 is computed by the caller.
 * BRP1, law version, count and flags are LE u32; weights retain binary64.
 * Only the depletion curve is narrowed, exactly as createBristleInkProfile.
 * This helper does not admit saturation brushes or compile their lookup. */
export function bristleSaturationProfileBytes(ink:BrushBristleInk):Uint8Array<ArrayBuffer> {
 if(!isBristleInk(ink))throw new RangeError('Invalid Bristle saturation profile')
 const bytes=new Uint8Array(48+ink.depletion.length*4),view=new DataView(bytes.buffer)
 view.setUint32(0,0x31505242,true)
 view.setUint32(4,1,true)
 view.setUint32(8,ink.depletion.length,true)
 view.setUint32(12,Number(ink.useOpacity)|(Number(ink.useSaturation)<<1)|(Number(ink.useWeights)<<2),true)
 const weights=[ink.pressureWeight,ink.bristleLengthWeight,ink.bristleInkAmountWeight,ink.inkDepletionWeight]
 for(let i=0;i<weights.length;i++)view.setFloat64(16+i*8,weights[i],true)
 for(let i=0;i<ink.depletion.length;i++)view.setFloat32(48+i*4,Math.fround(ink.depletion[i]),true)
 return bytes
}
