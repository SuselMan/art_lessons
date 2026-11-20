import{createBrushStampFragment}from'./brushBehaviorShaders'
/** Same canonical procedural/GIH/noise functions as ordinary stamps. Only the
 * request's pigment stage belongs to Spray; historical source shader is intact. */
export function spraySource194Fragment(source:string):string{
 const stamp=createBrushStampFragment(true,true,true,true),anchor='  void main() {'
 const index=stamp.lastIndexOf(anchor)
 if(index<0||stamp.indexOf(anchor)!==index)throw Error('Canonical stamp mask entry changed')
 const prefix=stamp.slice(0,index).replace(/\bu_color\b/g,'u_unusedStampColor194')
 const old="if(u_modes.z>.5)coverage=texture2D(u_mask,u_maskBounds.xy+vec2(p.x*v_control.y*.5+.5,p.y*v_control.z*.5+.5)*u_maskBounds.zw).r;else coverage=clamp((1.-length(p))/max(.00001,1.-u_style.w),0.,1.);"
 if(source.split(old).length!==2)throw Error('Spray source mask entry changed')
 const mask=`vec2 pixel=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y)-u_sourceMaskCenter;
 if(u_tipProcedural.x>=-.5){float c=cos(u_sourceMaskAngle),s=sin(u_sourceMaskAngle);coverage=brushEffectsMask(pixel,mat2(c,-s,s,c),u_tipProceduralGeometry,u_tipProcedural,u_tip,u_tipSoftnessBasis,1.0,u_autoSpikes.x);}
 else if(u_sourceMaskApplication>.5){vec4 value=u_gihFrame.x>.5?brushGihFrameSample(u_tip,p):texture2D(u_tip,u_tipBounds.xy+(p*.5+.5)*u_tipBounds.zw);coverage=value.a;nativeGray=u_sourceMaskApplication>1.5?value.r:value.r/max(value.a,.000001);if(u_sourceMaskApplication>1.5){float gray=floor(clamp(nativeGray,0.,1.)*255.+.5);nativePalette=texture2D(u_sourceGradient,vec2((gray+.5)/256.,.5));}}
 else if(u_gihFrame.x>.5)coverage=brushGihFrameSample(u_tip,p).r;
 else if(u_modes.z>.5)coverage=texture2D(u_mask,u_maskBounds.xy+vec2(p.x*v_control.y*.5+.5,p.y*v_control.z*.5+.5)*u_maskBounds.zw).r;
 else coverage=clamp((1.-length(p))/max(.00001,1.-u_style.w),0.,1.);
 vec4 nx=brushNoiseAddOffset(u_autoNoiseGridX,floor(gl_FragCoord.x)*u_autoNoiseConfig.z),ny=brushNoiseAddOffset(u_autoNoiseGridY,floor(gl_FragCoord.y)*u_autoNoiseConfig.w);
 coverage=brushAutoMaskNoiseU8(floor(clamp(coverage,0.0,1.0)*255.0+0.5),u_autoNoiseConfig.xy,u_autoNoiseKey,nx,ny)/255.0;`
 const body=source.replace('precision highp float;','').replace('float coverage=1.;','float coverage=1.,nativeGray=.5;vec4 nativePalette=vec4(1.);').replace(old,mask).replace('alpha*=coverage*painter*v_control.w;','if(u_sourceMaskApplication>1.5){straight=nativePalette.rgb;alpha=nativePalette.a;painter=v_control.x>=0.?v_control.x:u_style.z;}else if(u_sourceMaskApplication>.5)straight=brushMaterialColor(straight,nativeGray,u_sourceLightnessStrength);alpha*=coverage*painter*v_control.w;')
 const joined=prefix+'\nuniform vec2 u_sourceMaskCenter;uniform float u_sourceMaskAngle;uniform float u_sourceMaskApplication;uniform float u_sourceLightnessStrength;uniform sampler2D u_sourceGradient;\n'+body
 const declarations=new Map<string,string>()
 return joined.replace(/\b(uniform|varying)\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)\s*;/g,(text,kind:string,type:string,name:string)=>{const signature=kind+':'+type,old=declarations.get(name);if(old&&old!==signature)throw Error('Conflicting native Spray declaration '+name);declarations.set(name,signature);return old?'':text})
}
