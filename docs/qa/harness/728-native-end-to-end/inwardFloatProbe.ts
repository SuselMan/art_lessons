/** QA shader-only capture. No production kernel or default scheduling changes. */
export const INWARD_PROBE_CELLS=Object.freeze([[683,346],[682,347],[683,347]] as const)
export const INWARD_PROBE_FLOATS=16
export const INWARD_PROBE_BYTES=INWARD_PROBE_CELLS.length*INWARD_PROBE_FLOATS*4
export const INWARD_PROBE_FIELDS=['initialCost','finalCost','height','climb','winnerDx','winnerDy','winnerCostNormalized','winnerRelief','winnerFilm','winnerEdge','winnerCandidate','winnerFound','uvX','uvY','winnerUvX','winnerUvY'] as const
/** Instrument only canonical baseline kernel; shader keeps original min and Q8 store exactly. */
export function inwardFloatProbeShader(source:string){
 const anchors=['var best=source.r*u.coefficients.z;let hj=heightAt(px);','let edge=len*relief*mix(u.wet.x,1.0,film);best=min(best,ci*u.coefficients.z+edge);','textureStore(output,vec2i(q),vec4f(min(best,u.coefficients.z)/u.coefficients.z,hj,source.b,1));']
 if(anchors.some(a=>source.split(a).length!==2)||source.includes('binding(9)'))throw Error('Exact baseline front probe anchors required')
 let s=source.replace(anchors[0],anchors[0]+'let debugInitial=best;var debugWinner=vec4f(0);var debugMore=vec4f(0);var debugUv=vec2f(0);')
 s=s.replace(anchors[1],'let edge=len*relief*mix(u.wet.x,1.0,film);let debugCandidate=ci*u.coefficients.z+edge;if(debugCandidate<best){debugWinner=vec4f(o,ci,relief);debugMore=vec4f(film,edge,debugCandidate,1);debugUv=uvj;}best=min(best,ci*u.coefficients.z+edge);')
 const cases=INWARD_PROBE_CELLS.map(([x,y],i)=>`if(all(q==vec2u(${x},${y}))){debugIndex=${i}u;}`).join('')
 s=s.replace(anchors[2],anchors[2]+`var debugIndex=3u;${cases}if(debugIndex<3u){let d=debugIndex*4u;probe[d]=vec4f(debugInitial,best,hj,climb);probe[d+1u]=debugWinner;probe[d+2u]=debugMore;probe[d+3u]=vec4f(uv,debugUv);}`)
 return s+'\n@group(0) @binding(9) var<storage,read_write> probe:array<vec4f>;\n'
}
export function decodeInwardFloatProbe(bytes:ArrayBuffer){
 if(bytes.byteLength!==INWARD_PROBE_BYTES)throw Error('Exact bounded probe byte size required')
 const a=new Float32Array(bytes);if(a.some(v=>!Number.isFinite(v)))throw Error('Nonfinite front intermediate')
 return INWARD_PROBE_CELLS.map(([x,y],i)=>({x,y,values:Object.fromEntries(INWARD_PROBE_FIELDS.map((name,k)=>[name,a[i*INWARD_PROBE_FLOATS+k]]))}))
}
/** Native-like scalar layout, GL counterpart. Caller needs actual float framebuffer support.
 * u_probeView=-1 preserves original Q8 output; 0..3 emits raw vec4 diagnostics.
 * Tiny viewport crop MUST match full-view Q8 reference before values are interpreted. */
export function inwardGlFloatProbeShader(source:string){
 const start='float best = texture2D(u_cost, v_uv).r * u_costMax;'
 const edge='best = min(best, ci * u_costMax + edge);'
 const output='gl_FragColor = vec4(min(best, u_costMax) / u_costMax, hj, texture2D(u_cost, v_uv).b, 1.0);'
 if([start,edge,output].some(a=>source.split(a).length!==2)||source.includes('u_probeView'))throw Error('Exact baseline GL front probe anchors required')
 let s=source.replace('uniform float u_stride;','uniform float u_stride;\n uniform float u_probeView;')
 s=s.replace(start,start+'float debugInitial=best;vec4 debugWinner=vec4(0.0);vec4 debugMore=vec4(0.0);vec2 debugUv=vec2(0.0);')
 s=s.replace(edge,'float debugCandidate=ci*u_costMax+edge;if(debugCandidate<best){debugWinner=vec4(o,ci,relief);debugMore=vec4(film,edge,debugCandidate,1.0);debugUv=uvj;}'+edge)
 s=s.replace(output,output+'if(u_probeView> -0.5){if(u_probeView<0.5)gl_FragColor=vec4(debugInitial,best,hj,climb);else if(u_probeView<1.5)gl_FragColor=debugWinner;else if(u_probeView<2.5)gl_FragColor=debugMore;else gl_FragColor=vec4(v_uv,debugUv);}')
 return s
}
