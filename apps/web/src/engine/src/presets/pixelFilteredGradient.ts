import {isBrushGradient} from '@grafetto/shared'
/** Independent gray and alpha: gray is deliberately NOT premultiplied. */
export function pixelGradientSourcePixels(alpha:Uint8Array,gray:Uint8Array):Uint8Array{
 if(alpha.length!==gray.length||alpha.length>512*512)throw Error('Invalid filtered-gray source planes')
 const pixels=new Uint8Array(alpha.length*4)
 for(let i=0;i<alpha.length;i++){pixels[i*4]=gray[i];pixels[i*4+1]=gray[i];pixels[i*4+2]=gray[i];pixels[i*4+3]=alpha[i]}
 return pixels
}
export function pixelGradientPalettePixels(lut:string):Uint8Array{
 if(!isBrushGradient(lut))throw Error('Filtered-gray palette requires captured gradient')
 return Uint8Array.from({length:1024},(_,i)=>parseInt(lut.slice(i*2,i*2+2),16))
}
/** Filter gray first, quantize to U8, then use exact captured palette texel.
 * Native QImage scaling/ICC may differ; this preserves operation ordering. */
export const PIXEL_FILTERED_GRADIENT_GLSL=`
uniform sampler2D u_gradientPalette;
vec4 brushFilteredGradient(vec4 sampleValue){
 float gray=floor(clamp(sampleValue.r,0.0,1.0)*255.0+0.5);
 vec4 palette=texture2D(u_gradientPalette,vec2((gray+0.5)/256.0,0.5));
 return vec4(palette.rgb,sampleValue.a*palette.a);
}
`
