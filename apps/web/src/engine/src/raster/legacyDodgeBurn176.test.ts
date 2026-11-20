import{createHash}from'node:crypto'
import{it,expect}from'vitest'
import{colorSmudgeCompositeCode,colorSmudgeLegacyFragment,colorSmudgeDodgeBurn176Fragment}from'./colorSmudgeStrategyShader'
import{wetTransferFragment}from'./wetMixShaders'
import{pre176Shaders}from'./legacyDodgeBurn176.shaderFixture'
it('176 separate factory leaves ALL old four compiler strings exact; endpoint division precedes foreground union',()=>{const base=wetTransferFragment(true,true,true),old=[colorSmudgeLegacyFragment(base),colorSmudgeLegacyFragment(base,true),colorSmudgeLegacyFragment(base,false,true),colorSmudgeLegacyFragment(base,false,false,true)];expect(old.map(s=>createHash('sha256').update(s).digest('hex'))).toEqual([pre176Shaders.old83,pre176Shaders.old154,pre176Shaders.old172,pre176Shaders.old175]);const next=colorSmudgeDodgeBurn176Fragment(base);expect(next).toContain('if(destination>=1.0)return 1.0;');expect(next).toContain('if(source<=0.0)return 0.0;');expect(next).toContain('if(source>=1.0)return destination<=0.0?0.0:1.0;');expect(next).toContain('1.0-min(1.0,(1.0-destination)/source)');expect(next).toContain('min(1.0,destination/(1.0-source))');expect(next).toContain('u_previousCanvasForeground.rgb*b*(1.0-source.a)+blended*source.a*b');expect(next).not.toContain('source*=1.0-b');expect(['multiply','screen','erase','overlay','darken','lighten','add','subtract','dodge','burn'].map(colorSmudgeCompositeCode)).toEqual([4,5,6,7,8,9,10,11,12,13])})
// Independent normalized native GenericSC + finalCOPY law. No production math imports.
function native(d:number,a:number,f:number,op:'dodge'|'burn',b=.5,q=.5){const B=op==='dodge'?(f===1?(d===0?0:1):Math.min(1,d/(1-f))):d===1?1:f===0?0:1-Math.min(1,(1-d)/f),c=d*a,C=(1-b)*c+(1-a)*b*f+a*b*B,A=a+b*(1-a);return{B,pma:(1-q)*c+q*C,alpha:(1-q)*a+q*A}}
const literals=[{mode:'dodge',name:'opaque-low',d:1/4,a:1,f:1/2,pma:5/16,alpha:1,B:1/2},
{mode:'dodge',name:'opaque-clamp',d:3/4,a:1,f:1/2,pma:13/16,alpha:1,B:1},
{mode:'dodge',name:'partial-low',d:1/4,a:1/2,f:1/2,pma:7/32,alpha:5/8,B:1/2},
{mode:'dodge',name:'partial-clamp',d:3/4,a:1/2,f:1/2,pma:15/32,alpha:5/8,B:1},
{mode:'dodge',name:'endpoint-black-full-source',d:0,a:1,f:1,pma:0,alpha:1,B:0},
{mode:'dodge',name:'endpoint-white-zero-source',d:1,a:1,f:0,pma:1,alpha:1,B:1},
{mode:'dodge',name:'endpoint-mid-zero-source',d:1/2,a:1,f:0,pma:1/2,alpha:1,B:1/2},
{mode:'dodge',name:'endpoint-mid-full-source',d:1/2,a:1,f:1,pma:5/8,alpha:1,B:1},
{mode:'dodge',name:'transparent',d:0,a:0,f:1/2,pma:1/8,alpha:1/4,B:0},
{mode:'burn',name:'opaque-low',d:1/4,a:1,f:1/2,pma:3/16,alpha:1,B:0},
{mode:'burn',name:'opaque-clamp',d:3/4,a:1,f:1/2,pma:11/16,alpha:1,B:1/2},
{mode:'burn',name:'partial-low',d:1/4,a:1/2,f:1/2,pma:5/32,alpha:5/8,B:0},
{mode:'burn',name:'partial-clamp',d:3/4,a:1/2,f:1/2,pma:13/32,alpha:5/8,B:1/2},
{mode:'burn',name:'endpoint-black-full-source',d:0,a:1,f:1,pma:0,alpha:1,B:0},
{mode:'burn',name:'endpoint-white-zero-source',d:1,a:1,f:0,pma:1,alpha:1,B:1},
{mode:'burn',name:'endpoint-mid-zero-source',d:1/2,a:1,f:0,pma:3/8,alpha:1,B:0},
{mode:'burn',name:'endpoint-mid-full-source',d:1/2,a:1,f:1,pma:1/2,alpha:1,B:1/2},
{mode:'burn',name:'transparent',d:0,a:0,f:1/2,pma:1/8,alpha:1/4,B:0}]as const
for(const r of literals)it(r.mode+' independent '+r.name,()=>{expect(native(r.d,r.a,r.f,r.mode)).toEqual({B:r.B,pma:r.pma,alpha:r.alpha})})
it('zeroRate/zeroO retain bothPMA/alpha and clampBEFORE alpha union',()=>{for(const mode of['dodge','burn']as const){for(const[b,q]of[[0,.5],[.5,0]]){const n=native(.25,.5,.5,mode,b,q);expect([n.pma,n.alpha]).toEqual([.125,.5])}}expect(native(.75,1,.5,'dodge').pma).toBe(13/16);expect(native(.75,1,.5,'dodge').pma).not.toBe(15/16);expect(native(.25,1,.5,'burn').pma).toBe(3/16);expect(native(.25,1,.5,'burn').pma).not.toBe(1/16)})
