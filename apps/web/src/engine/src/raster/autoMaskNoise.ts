/** Functional Auto-mask randomness/density, not Krita's mutable RNG sequence.
 * Native order: stencil/U8 coverage -> random attenuation -> visible-pixel
 * density rejection -> sharpness/texture/flow/opacity (performed by caller).
 *
 * Pixel coordinates are integers on the FULL DAB allocation grid, before source
 * rotation/folding. Derive them from worldPixel - canonicalFullDabPixelOrigin;
 * never from a tile, clipped bbox, normalized UV or supersample coordinate.
 * If the generated dab is mirrored, reflect the integer grid with its full
 * width/height (width-1-gridX), not a tile width. Never inverse-rotate noise.
 * Source orientation affects that full allocation and its coverage, not the
 * independent per-output-pixel noise. Capture the origin once with dab geometry.
 * Coordinates/counters wrap low32 explicitly; all safe-integer origins accepted.
 */
export const AUTO_MASK_NOISE_LAW='functional-auto-mask-d16-r8-v1'
export interface AutoMaskNoise {
 readonly law:typeof AUTO_MASK_NOISE_LAW
 readonly densityU16:number
 readonly randomnessU8:number
}
const issued=new WeakSet<AutoMaskNoise>()
export function prepareAutoMaskNoise(density:number,randomness:number):AutoMaskNoise {
 if(!Number.isFinite(density)||density<0||density>1||!Number.isFinite(randomness)||randomness<0||randomness>1)throw new RangeError('Invalid Auto-mask noise')
 const value=Object.freeze({law:AUTO_MASK_NOISE_LAW,densityU16:Math.round(density*65535),randomnessU8:Math.round(randomness*255)})
 issued.add(value);return value
}
function check(noise:AutoMaskNoise):void {
 if(!issued.has(noise))throw new TypeError('Expected prepared Auto-mask noise')
}
export function autoMaskNoiseUniforms(noise:AutoMaskNoise):[number,number] {
 check(noise);return [noise.densityU16,noise.randomnessU8]
}
/** Same full32 avalanche graph as the existing brushDabRandom sampler. */
function mix(h:number):number {
 h=Math.imul(h^(h>>>16),0x85ebca6b)>>>0
 h=Math.imul(h^(h>>>13),0xc2b2ae35)>>>0
 return (h^(h>>>16))>>>0
}
export function autoMaskNoiseKey(strokeSeed:number,dabOrdinal:number,placement:number,role:0|1):number {
 if(!Number.isInteger(strokeSeed)||strokeSeed<0||strokeSeed>0xffffffff||!Number.isSafeInteger(dabOrdinal)||dabOrdinal<0||!Number.isSafeInteger(placement)||placement<0||(role!==0&&role!==1))throw new RangeError('Invalid Auto-mask identity')
 return mix(strokeSeed^Math.imul((dabOrdinal>>>0)+1,0x9e3779b1)^Math.imul((placement>>>0)+1,0x85ebca77)^(role===0?0xa511e9b3:0xd1b54a35))
}
/** Exact byte ABI for ES1 uniforms, little-endian RGBA, no float32 uint cast. */
export function autoMaskNoiseCoordinateBytes(coordinate:number):[number,number,number,number] {
 if(!Number.isSafeInteger(coordinate))throw new RangeError('Invalid Auto-mask coordinate')
 const word=coordinate>>>0
 return [word&255,(word>>>8)&255,(word>>>16)&255,word>>>24]
}
export function autoMaskNoiseHash(key:number,gridX:number,gridY:number):number {
 if(!Number.isInteger(key)||key<0||key>0xffffffff||!Number.isSafeInteger(gridX)||!Number.isSafeInteger(gridY))throw new RangeError('Invalid Auto-mask sample identity')
 return mix(key^Math.imul(gridX>>>0,0x9e3779b1)^Math.imul(gridY>>>0,0x85ebca77))
}
export function autoMaskNoiseAlpha(alphaU8:number,noise:AutoMaskNoise,key:number,gridX:number,gridY:number):number {
 check(noise)
 if(!Number.isInteger(alphaU8)||alphaU8<0||alphaU8>255)throw new RangeError('Invalid Auto-mask coverage')
 if(alphaU8===0||noise.densityU16===0)return 0
 if(noise.randomnessU8===0&&noise.densityU16===65535)return alphaU8
 const hash=autoMaskNoiseHash(key,gridX,gridY)
 // Disjoint high8 and low16 avalanche bits are independent functional channels.
 // Integer numerator <=255*65025<2^24: the ES1 highp graph is exact.
 const r=noise.randomnessU8
 const alpha=r===0?alphaU8:Math.floor(alphaU8*((255-r)*255+r*(hash>>>24))/65025)
 return alpha!==0&&(noise.densityU16===65535||(hash&65535)<=noise.densityU16)?alpha:0
}
/** ES1/ES3-compatible exact-byte arithmetic, only compiled for opt-in noise.
 * Inputs: U8 alpha; quantized(D16,R8); little-endian key/gridX/gridY bytes.
 * addOffset lets a caller use a preencoded full-dab origin plus tile-local
 * integer fragment offset. Offset must be exactly representable in highp.
 * No texture, lookup table, global RNG state or GPU/CPU synchronization.
 */
export const BRUSH_AUTO_MASK_NOISE_GLSL=`
float brushNoiseXorByte(float a,float b) {
 float value=0.0,bit=1.0;
 for(int i=0;i<8;i++){
  if(mod(a,2.0)!=mod(b,2.0))value+=bit;
  a=floor(a*0.5);b=floor(b*0.5);bit*=2.0;
 }
 return value;
}
vec4 brushNoiseXor(vec4 a,vec4 b) {
 return vec4(brushNoiseXorByte(a.x,b.x),brushNoiseXorByte(a.y,b.y),brushNoiseXorByte(a.z,b.z),brushNoiseXorByte(a.w,b.w));
}
vec4 brushNoiseMultiply(vec4 a,vec4 b) {
 float t=a.x*b.x;float x=mod(t,256.0);
 t=a.x*b.y+a.y*b.x+floor(t/256.0);float y=mod(t,256.0);
 t=a.x*b.z+a.y*b.y+a.z*b.x+floor(t/256.0);float z=mod(t,256.0);
 t=a.x*b.w+a.y*b.z+a.z*b.y+a.w*b.x+floor(t/256.0);
 return vec4(x,y,z,mod(t,256.0));
}
vec4 brushNoiseRight16(vec4 a){return vec4(a.z,a.w,0.0,0.0);}
vec4 brushNoiseRight13(vec4 a){return vec4(floor(a.y/32.0)+mod(a.z,32.0)*8.0,floor(a.z/32.0)+mod(a.w,32.0)*8.0,floor(a.w/32.0),0.0);}
vec4 brushNoiseMix(vec4 h) {
 h=brushNoiseMultiply(brushNoiseXor(h,brushNoiseRight16(h)),vec4(107.0,202.0,235.0,133.0));
 h=brushNoiseMultiply(brushNoiseXor(h,brushNoiseRight13(h)),vec4(53.0,174.0,178.0,194.0));
 return brushNoiseXor(h,brushNoiseRight16(h));
}
vec4 brushNoiseAddOffset(vec4 base,float offset) {
 float t=base.x+offset;float x=mod(t,256.0);
 t=base.y+floor(t/256.0);float y=mod(t,256.0);
 t=base.z+floor(t/256.0);float z=mod(t,256.0);
 return vec4(x,y,z,mod(base.w+floor(t/256.0),256.0));
}
float brushNoisePositiveFloor(float numerator,float denominator) {
 float q=floor(numerator/denominator),r=numerator-q*denominator;
 return r<0.0?q-1.0:r>=denominator?q+1.0:q;
}
float brushAutoMaskNoiseU8(float alpha,vec2 config,vec4 key,vec4 gridX,vec4 gridY) {
 if(alpha<=0.0||config.x<0.5)return 0.0;
 if(config.y<0.5&&config.x>=65535.0)return alpha;
 vec4 h=brushNoiseMix(brushNoiseXor(key,brushNoiseXor(brushNoiseMultiply(gridX,vec4(177.0,121.0,55.0,158.0)),brushNoiseMultiply(gridY,vec4(119.0,202.0,235.0,133.0)))));
 if(config.y>=0.5){
  float factor=(255.0-config.y)*255.0+config.y*h.w;
  alpha=brushNoisePositiveFloor(alpha*factor,65025.0);
 }
 if(alpha<=0.0)return 0.0;
 float densitySample=h.x+h.y*256.0;
 return config.x>=65535.0||densitySample<=config.x?alpha:0.0;
}
`

export interface AutoMaskNoiseGrid {
 readonly originX:number;readonly originY:number
 readonly width:number;readonly height:number
 readonly flipX:1|-1;readonly flipY:1|-1
}
const grids=new WeakSet<AutoMaskNoiseGrid>()
/** Functional v1 enclosing grid: no trigonometric integer-boundary decision.
 * F32 source axes, not clipped/rotated tile bounds, define a conservative square
 * containing the complete dab at every angle. Native pixel/RNG identity is not
 * claimed. This grid is stable for local/replay, prediction and frame cuts. */
export function prepareAutoMaskNoiseGrid(centerX:number,centerY:number,sourceRx:number,sourceRy:number,spiked:boolean,flipX:1|-1=1,flipY:1|-1=1):AutoMaskNoiseGrid {
 const rx=Math.fround(sourceRx),ry=Math.fround(sourceRy)
 if(typeof spiked!=='boolean'||!Number.isFinite(centerX)||!Number.isFinite(centerY)||!Number.isFinite(rx)||!Number.isFinite(ry)||rx<=0||ry<=0||(flipX!==1&&flipX!==-1)||(flipY!==1&&flipY!==-1))throw new RangeError('Invalid Auto-mask grid geometry')
 const extent=Math.ceil(spiked?2*rx:rx+ry)
 const originX=Math.floor(centerX)-extent,originY=Math.floor(centerY)-extent,size=2*extent+1
 if(!Number.isSafeInteger(extent)||!Number.isSafeInteger(originX)||!Number.isSafeInteger(originY)||!Number.isSafeInteger(size)||!Number.isSafeInteger(originX+size-1)||!Number.isSafeInteger(originY+size-1))throw new RangeError('Unsafe Auto-mask grid bounds')
 const grid=Object.freeze({originX,originY,width:size,height:size,flipX,flipY})
 grids.add(grid);return grid
}
/** Per-dab/tile uniforms only. Pixel centers are converted to integer pixel
 * indices; top-down y is derived from the actual target height, not viewport. */
export function autoMaskNoiseGridUniforms(grid:AutoMaskNoiseGrid,tileX:number,tileY:number,targetHeight:number):{x:[number,number,number,number];y:[number,number,number,number];stepX:number;stepY:number} {
 if(!grids.has(grid))throw new TypeError('Expected prepared Auto-mask grid')
 if(!Number.isSafeInteger(tileX)||!Number.isSafeInteger(tileY)||!Number.isSafeInteger(targetHeight)||targetHeight<1)throw new RangeError('Invalid Auto-mask target')
 const baseX=tileX-grid.originX,baseY=(tileY-grid.originY)+(targetHeight-1)
 const x=grid.flipX===1?baseX:grid.width-1-baseX,y=grid.flipY===1?baseY:grid.height-1-baseY
 return {x:autoMaskNoiseCoordinateBytes(x),y:autoMaskNoiseCoordinateBytes(y),stepX:grid.flipX,stepY:-grid.flipY}
}
