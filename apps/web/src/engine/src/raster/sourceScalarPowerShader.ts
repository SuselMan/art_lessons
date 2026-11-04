import type {SourceScalarPowerMode} from '../presets/sourceScalarPowerTable'
/** A private program variant: ordinary shader strings/ABIs remain byte-identical.
 * Lookup is a byte page with D rows, four consecutive S bytes per RGBA texel. */
export const SOURCE_SCALAR_POWER_LOOKUP_GLSL=`
uniform highp sampler2D scalarPowerTexture;
highp float sourceScalarPowerByte(highp float S,highp float D){
 highp float cell=floor(S/4.0),component=S-cell*4.0;
 highp vec4 atlasTexel=floor(texture2D(scalarPowerTexture,vec2((cell+0.5)/64.0,(D+0.5)/256.0))*255.0+0.5);
 return component<0.5?atlasTexel.r:component<1.5?atlasTexel.g:component<2.5?atlasTexel.b:atlasTexel.a;
}
`
const ids:Readonly<Record<SourceScalarPowerMode,number>>=Object.freeze({easyDodge:95,easyBurn:96,pNormA:97,superLight:99,softLightIfs:100})
/** Derives the actual current fragment, including its policy ABI and source style.
 * Only the selected finite-U8 functor changes. Never splice an apply constructor. */
export function scalarPowerFragmentVariant(fragment:string,mode:SourceScalarPowerMode,dialect:'webgl1'|'webgl2'='webgl1'):string{
 const id=ids[mode]
 if(id===undefined)throw new TypeError('Unknown scalar atlas mode')
 const expression=new RegExp('if\\(mode=='+id+'\\.0\\)[^\\n]*')
 const matches=fragment.match(new RegExp(expression.source,'g'))
 if(!matches||matches.length!==1||fragment.includes('uniform highp sampler2D scalarPowerTexture;'))throw new TypeError('Scalar atlas shader provenance changed')
 const rewritten=fragment.replace(expression,'if(mode=='+id+'.0)return sourceScalarPowerByte(s,d);')
 const anchor='float sourceRgba8Scalar23Real('
 const offset=rewritten.indexOf(anchor)
 if(offset<0)throw new TypeError('Scalar atlas kernel missing')
 return rewritten.slice(0,offset)+(dialect==='webgl2'?SOURCE_SCALAR_POWER_LOOKUP_GLSL.replace('texture2D(','texture('):SOURCE_SCALAR_POWER_LOOKUP_GLSL)+rewritten.slice(offset)
}
