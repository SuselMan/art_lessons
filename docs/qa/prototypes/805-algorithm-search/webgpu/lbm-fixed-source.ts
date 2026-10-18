import {WGSL_COLLIDE,WGSL_STREAM} from './lbm'
const once=(s:string,a:string,b:string)=>{if(s.split(a).length!==2)throw Error('LBM fixed source anchor drift');return s.replace(a,b)}
/** Negative immutable paper sentinel marks closed cells, without a ninth storage binding. */
export function fixedLBMCollide(){return once(WGSL_COLLIDE,'let i=gid.y*p.n+gid.x;var rho=0.0;','let i=gid.y*p.n+gid.x;if(paper[i]<0.0){fluidMacro[i]=vec4f(0);for(var q=0u;q<9u;q++){post[i*9u+q]=f[i*9u+q];}return;}var rho=0.0;')}
export function fixedLBMStream(){let s=WGSL_STREAM;const anchor='@compute @workgroup_size(8,8)';const helper=`
fn openCell(pos:vec2i)->bool{if(any(pos<vec2i(0))||any(pos>=vec2i(i32(p.n)))){return false;}return paper[u32(pos.y)*p.n+u32(pos.x)]>=0.0;}
fn openLink(a:vec2i,b:vec2i)->bool{if(!openCell(a)||!openCell(b)){return false;}if(a.x!=b.x&&a.y!=b.y){return openCell(vec2i(a.x,b.y))&&openCell(vec2i(b.x,a.y));}return true;}
fn wallIndex(a:vec2i,b:vec2i)->u32{if(!openLink(a,b)){return u32(a.y)*p.n+u32(a.x);}return u32(b.y)*p.n+u32(b.x);}
`;
s=once(s,anchor,helper+anchor);s=once(s,'let i=gid.y*p.n+gid.x;','let i=gid.y*p.n+gid.x;if(paper[i]<0.0){for(var q=0u;q<9u;q++){next[i*9u+q]=post[i*9u+q];}colorsNext[i]=vec4f(0);wetNext[i]=0.0;return;}');s=once(s,'if(any(sourcePos<vec2i(0))||any(sourcePos>=vec2i(i32(p.n))))','if(!openLink(pos,sourcePos))');
for(const expression of ['base','base+vec2i(1,0)','base+vec2i(0,1)','base+vec2i(1,1)','pos+vec2i(-1,0)','pos+vec2i(1,0)','pos+vec2i(0,-1)','pos+vec2i(0,1)'])s=once(s,'idx('+expression+')','wallIndex(pos,'+expression+')');return s}
