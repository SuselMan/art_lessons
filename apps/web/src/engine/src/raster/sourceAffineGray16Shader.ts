/** Profile proof only: existing affineImageSpan16 source-decode/interpolation,
 * with gray16/alpha16 returned as four RGBA8 bytes. No straight store, mask
 * conversion, renderer admission or device-dependent profile selection.
 */
export interface SourceAffineGray16Row {
  /** integerX,fractionX,integerY,fractionY; fractions in [0,65535]. */
  readonly origin: readonly [number, number, number, number]
  readonly step: readonly [number, number, number, number]
  readonly length: number
  readonly decode: 'wide8' | 'narrow4' | 'scalar'
  readonly products: 'separate' | 'summed'
}
export function assertSourceAffineGray16Row(row: SourceAffineGray16Row, precisionBits: number): void {
  if (precisionBits < 23 || !Number.isInteger(precisionBits) || !Number.isSafeInteger(row.length) || row.length < 1 || row.length > 2048
    || !['wide8', 'narrow4', 'scalar'].includes(row.decode) || !['separate', 'summed'].includes(row.products)) throw new RangeError('Unverified affine16 shader profile')
  for (const value of [row.origin, row.step]) {
    if (value.length !== 4 || value.some(v => !Number.isSafeInteger(v))
      || value[1] < 0 || value[1] > 65535 || value[3] < 0 || value[3] > 65535) throw new RangeError('Invalid split fixed16 row')
  }
  for (const offset of [0, 2]) {
    const origin = row.origin[offset] * 65536 + row.origin[offset + 1]
    const step = row.step[offset] * 65536 + row.step[offset + 1]
    if (Math.abs(origin) >= 0x7fffffff || Math.abs(step) >= 0x7fffffff || Math.abs(origin + step * row.length) >= 0x7fffffff) throw new RangeError('Affine16 shader fixed-point range exceeded')
  }
}

/** All product/carry intermediates are <=196605 (18 bits), rather than a
 * rounded float32 32-bit product. Admission additionally requires highp>=23
 * and actual GPU proof; minimum GLSL ES1.00 highp alone is not an exactness claim.
 * Source texture must be straight RGBA8 grayscale, NEAREST/CLAMP, with alpha.
 * Pixel index is relative to the complete native covered span, never the tile.
 */
export const SOURCE_AFFINE_GRAY16_GLSL = `
vec2 affine16Product(float a,float b) {
 vec2 aa=vec2(floor(a/256.0),mod(a,256.0));
 vec2 bb=vec2(floor(b/256.0),mod(b,256.0));
 float low=aa.y*bb.y;
 float cross=aa.x*bb.y+aa.y*bb.x;
 float high=aa.x*bb.x+floor((cross+floor(low/256.0))/256.0);
 return vec2(high,mod(mod(cross,256.0)*256.0+low,65536.0));
}
vec2 affine16Position(float index,vec2 origin,vec2 step) {
 vec2 product=affine16Product(step.y,index);
 float sum=origin.y+product.y;
 return vec2(origin.x+step.x*index+product.x+floor(sum/65536.0),mod(sum,65536.0));
}
vec2 affine16Raw(highp sampler2D image,vec2 size,vec4 origin,vec4 step,float index,float side,float bottom) {
 vec2 px=affine16Position(index,origin.xy,step.xy);
 vec2 py=affine16Position(index,origin.zw,step.zw);
 vec2 texel=clamp(vec2(px.x+side,py.x+bottom),vec2(0.0),size-1.0);
 return floor(texture2D(image,(texel+0.5)/size).ra*255.0+0.5);
}
float affine16OpaqueGroup(highp sampler2D image,vec2 size,vec4 origin,vec4 step,float index,float bottom,float length,float groupSize) {
 float start=floor(index*2.0/groupSize)*groupSize;
 float opaque=1.0;
 for(int j=0;j<8;j++) {
  float lane=start+float(j);
  if(float(j)<groupSize && lane<length*2.0) {
   float alpha=affine16Raw(image,size,origin,step,floor(lane/2.0),mod(lane,2.0),bottom).y;
   if(alpha<255.0)opaque=0.0;
  }
 }
 return opaque;
}
vec2 affine16Decode(vec2 bytes,float opaque,float vectorGroup) {
 float value=bytes.x*257.0;
 float alpha=bytes.y*257.0;
 if(opaque>0.5)return vec2(value,alpha);
 vec2 product=affine16Product(value,alpha);
 float gray=vectorGroup>0.5 ? product.x+floor(product.x/32768.0)
  : product.x+floor((product.y+product.x+32768.0)/65536.0);
 return vec2(gray,alpha);
}
vec2 affine16Lerp(vec2 a,vec2 b,float weight,float summed) {
 if(weight==0.0)return a;
 vec2 ag=affine16Product(a.x,65536.0-weight);
 vec2 bg=affine16Product(b.x,weight);
 vec2 aa=affine16Product(a.y,65536.0-weight);
 vec2 ba=affine16Product(b.y,weight);
 vec2 high=vec2(ag.x+bg.x,aa.x+ba.x);
 return summed>0.5 ? high+floor(vec2(ag.y+bg.y,aa.y+ba.y)/65536.0) : high;
}
vec4 sourceAffineGray16Packed(highp sampler2D image,vec2 size,vec4 origin,vec4 step,float length,float index,float decodeMode,float summed) {
 vec2 px=affine16Position(index,origin.xy,step.xy);
 vec2 py=affine16Position(index,origin.zw,step.zw);
 float groupSize=decodeMode<0.5 ? 8.0 : decodeMode<1.5 ? 4.0 : 1.0;
 float start=floor(index*2.0/groupSize)*groupSize;
 float count=min(groupSize,length*2.0-start);
 float vectorGroup=decodeMode<0.5 || (decodeMode<1.5 && count==4.0) ? 1.0 : 0.0;
 float topOpaque=groupSize>1.0 ? affine16OpaqueGroup(image,size,origin,step,index,0.0,length,groupSize) : 0.0;
 float bottomOpaque=groupSize>1.0 ? affine16OpaqueGroup(image,size,origin,step,index,1.0,length,groupSize) : 0.0;
 vec2 tl=affine16Decode(affine16Raw(image,size,origin,step,index,0.0,0.0),topOpaque,vectorGroup);
 vec2 tr=affine16Decode(affine16Raw(image,size,origin,step,index,1.0,0.0),topOpaque,vectorGroup);
 vec2 bl=affine16Decode(affine16Raw(image,size,origin,step,index,0.0,1.0),bottomOpaque,vectorGroup);
 vec2 br=affine16Decode(affine16Raw(image,size,origin,step,index,1.0,1.0),bottomOpaque,vectorGroup);
 vec2 result=affine16Lerp(affine16Lerp(tl,bl,py.y,summed),affine16Lerp(tr,br,py.y,summed),px.y,summed);
 return vec4(floor(result.x/256.0),mod(result.x,256.0),floor(result.y/256.0),mod(result.y,256.0))/255.0;
}
`
