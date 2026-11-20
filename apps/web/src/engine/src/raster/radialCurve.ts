/** Native radial table: immutable UNORM32BE values, including two sentinels.
 * The authored table resolution stays independent of the placed dab diameter. */
export function radialCurveTextureSide(bytes: Uint8Array, resolution: number): number {
  const side = Math.sqrt(bytes.length)
  if (!Number.isInteger(side) || side < 4 || (side & (side - 1)) !== 0 || !Number.isInteger(resolution) || resolution < 1 || resolution > 40000 || bytes.length < (resolution + 2) * 4) throw Error('Invalid radial curve lookup resource')
  return side / 2
}

export function radialCurveAlpha(q: number, bytes: Uint8Array, resolution: number, antialiasRadii?:readonly[number,number]): number {
  radialCurveTextureSide(bytes, resolution)
  if (!Number.isFinite(q) || q < 0 || q > 1) return 0
  const value = (i: number): number => {
    const offset = i * 4
    return (bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3]) / 4294967295
  }
  const transparency=(distance:number):number=>{const position=distance*resolution,index=Math.floor(position),fraction=position-index;const coverage=value(index)*(1-fraction)+value(index+1)*fraction;return Math.floor(Math.max(0,Math.min(255,(1-coverage)*255)))}
  if(antialiasRadii){const[rx,ry]=antialiasRadii;if(![rx,ry].every(r=>Number.isFinite(r)&&r>0))throw Error('Invalid radial antialias geometry');const start=(.5*(Math.max(0,1-1/rx)+Math.max(0,1-1/ry)))**2;if(q>start){const base=transparency(start);return 255-Math.floor(base+(q-start)*(255-base)/(1-start))}}
  return 255-transparency(q)
}

/** Only compiled into the explicit lookup capability. Uses the existing tip
 * samplers, so WebGL1 needs no extra texture units. */
export const BRUSH_RADIAL_CURVE_GLSL = `
float brushCurveValue(sampler2D lookup,float index,float side) {
 vec2 pixel=vec2(mod(index,side),floor(index/side));
 highp vec4 channels=texture2D(lookup,(pixel+0.5)/side);
 return dot(channels,vec4(0.9960937502319217,0.0038909912118439674,0.000015199184421263446,0.000000059371814145793454));
}
float brushRadialCurveTransparency(sampler2D lookup,float q,vec4 profile){
 float position=q*profile.y,index=floor(position);
 float value=mix(brushCurveValue(lookup,index,profile.z),brushCurveValue(lookup,index+1.0,profile.z),position-index);
 return floor(clamp((1.0-value)*255.0,0.0,255.0));
}
float brushRadialCurveMask(sampler2D lookup,float q,vec4 profile,vec2 radii){
 if(q>1.0)return 0.0;
 if(profile.w>.5){vec2 f=max(vec2(0.0),vec2(1.0)-vec2(1.0)/radii);float start=pow(.5*(f.x+f.y),2.0);if(q>start){float base=brushRadialCurveTransparency(lookup,start,profile);return (255.0-floor(base+(q-start)*(255.0-base)/(1.0-start)))/255.0;}}
 return (255.0-brushRadialCurveTransparency(lookup,q,profile))/255.0;
}
float brushProceduralMaskWithCurve(vec2 pixel,mat2 frame,vec4 geometry,vec4 profile,sampler2D lookup) {
 if(profile.x<2.5)return brushProceduralMask(pixel,frame,geometry,profile);
 float n=geometry.z;vec2 p=(frame*pixel)/geometry.xy;
 if(profile.w<.5||n<1.5)return brushRadialCurveMask(lookup,dot(p,p),profile,geometry.xy);
 float sum=0.0;
 for(int y=0;y<6;y++)for(int x=0;x<6;x++){if(float(x)<n&&float(y)<n){vec2 u=(frame*(pixel+vec2(float(x),float(y))/n))/geometry.xy;sum+=floor(255.0*(1.0-brushRadialCurveMask(lookup,dot(u,u),profile,geometry.xy))+.5);}}
 return (255.0-floor(sum/(n*n)))/255.0;
}
`;
