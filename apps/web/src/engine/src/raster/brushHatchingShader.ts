/** Opt-in variant; historical shader strings and absent descriptors are intact. */
export function hatchingStampFragment(source:string):string{
 const marker='  void main() {',amount='    float amount = shape * v_opacity;'
 if(source.split(marker).length!==2||source.split(amount).length!==2)throw Error('Hatching shader template mismatch')
 return source.replace(marker,`uniform vec4 u_hatch0;uniform vec4 u_hatch1;uniform vec4 u_hatch2;uniform vec2 u_hatchStyle;
 float hatchLine(vec4 plane,vec2 p){if(plane.w<=0.)return 0.;float d=abs(mod(dot(plane.xy,p)+plane.z+plane.w*.5,plane.w)-plane.w*.5);return u_hatchStyle.y>.5?clamp(.5+u_hatchStyle.x*.5-d,0.,1.):step(d,u_hatchStyle.x*.5);}
 ${marker}`).replace(amount,`vec2 hp=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y);
 shape*=1.-(1.-hatchLine(u_hatch0,hp))*(1.-hatchLine(u_hatch1,hp))*(1.-hatchLine(u_hatch2,hp));
 ${amount}`)
}
