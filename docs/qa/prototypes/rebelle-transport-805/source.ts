import {FLUX,WATER,PIG_D,PIG_G} from './snapshot/shaders.js'
function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Curtis snapshot source anchor drift');return s.replace(a,b)}
/** Immutable original-mask boundaries are part of operators, never a final image crop. */
export function fixedDomainSources(){
 const prepare=(s:string)=>{let r=once(s,'float paperRaw(vec2 fc)',`uniform sampler2D u_domain;
float originalWet(vec2 fc){if(fc.x<0.5||fc.y<0.5||fc.x>u_n-0.5||fc.y>u_n-0.5)return 0.0;return step(0.5,texture2D(u_domain,fc*u_px).r);}
float paperRaw(vec2 fc)`);r=once(r,'vec2 fc=gl_FragCoord.xy;','vec2 fc=gl_FragCoord.xy;if(originalWet(fc)<0.5){gl_FragColor=vec4(0.0);return;}');return r.replaceAll('uniform sampler2D','uniform highp sampler2D')}
 let flux=prepare(FLUX),water=prepare(WATER),pigD=prepare(PIG_D),pigG=prepare(PIG_G)
 flux=once(flux,'return ok*max(0.0,','return originalWet(q)*ok*max(0.0,')
 water=once(water,'s += T(sl,c.g)+T(sr,c.g)+T(sd,c.g)+T(su,c.g) - T(c.g,sl)-T(c.g,sr)-T(c.g,sd)-T(c.g,su);','s += (T(sl,c.g)-T(c.g,sl))*originalWet(L)+(T(sr,c.g)-T(c.g,sr))*originalWet(R)+(T(sd,c.g)-T(c.g,sd))*originalWet(Dn)+(T(su,c.g)-T(c.g,su))*originalWet(Up);')
 for(const q of['L','R','Dn','Up'])pigG=once(pigG,'*step(e,'+({L:'wl',R:'wr',Dn:'wd',Up:'wu'}[q])+'.r)*inb('+q+')','*step(e,'+({L:'wl',R:'wr',Dn:'wd',Up:'wu'}[q])+'.r)*inb('+q+')*originalWet('+q+')')
 const preClampG=once(pigG,'gl_FragColor=max(vec4(0.0),gn);','gl_FragColor=gn;')
 return{flux,water,pigD,pigG,preClampG}
}
