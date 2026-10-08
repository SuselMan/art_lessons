/** OFF source-sampler diagnostics; no transport/height/noise/Q8 arithmetic changes. */
export type CanonicalFrontSourceSampling='manual'|'hardware'
export function frontSamplingShader(shader:string,sampling?:CanonicalFrontSourceSampling):string {
 if(!sampling)return shader
 if(sampling!=='manual'&&sampling!=='hardware')throw new Error('Unknown front source sampling diagnostic')
 if(!shader.includes('fieldAt(input,uv)')||!shader.includes('fieldAt(input,uvj)'))throw new Error('Front source sampling anchors missing')
 const helper=sampling==='hardware'?`@group(0) @binding(8) var sourceSampler:sampler;
fn sourceAt(t:texture_2d<f32>,uv:vec2f,linear:f32)->vec4f {
 if(linear>0.5){return textureSampleLevel(t,sourceSampler,vec2f(uv.x,1.0-uv.y),0.0);}
 return fieldAt(t,uv);
}`:`fn sourceAt(t:texture_2d<f32>,uv:vec2f,linear:f32)->vec4f {
 if(linear>0.5){return fieldLinear(t,uv);}
 return fieldAt(t,uv);
}`
 return shader.replaceAll('fieldAt(input,uv)','sourceAt(input,uv,u.wet.z)').replaceAll('fieldAt(input,uvj)','sourceAt(input,uvj,u.wet.z)')+'\n'+helper
}
