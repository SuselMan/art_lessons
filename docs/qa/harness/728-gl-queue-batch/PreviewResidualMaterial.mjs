/** Virtual high-resolution material residual; presentation only, never authoritative output. */
export function residualPreviewMaterialShader(fragment){
 const p='vec4 previewPAt(vec2 uv){return previewMomentAt(u_previewFixedP,uv)+u_previewMobileWeight*previewMomentAt(u_inkLoad,uv);}',c='vec4 previewCAt(vec2 uv){return previewMomentAt(u_previewFixedC,uv)+u_previewMobileWeight*previewMomentAt(u_inkColor,uv);}';
 if(!fragment.source.includes(p)||!fragment.source.includes(c))throw Error('Exact finite paired helper anchors required');
 const uniforms='uniform sampler2D u_previewSourceP;uniform sampler2D u_previewSourceC;uniform sampler2D u_previewInitialP;uniform sampler2D u_previewInitialC;\n';
 const helper=(letter,source,initial,body)=>`vec4 preview${letter}At(vec2 uv){vec4 transported=${body};return clamp(texture2D(${source},uv)+(transported-previewMomentAt(${initial},uv)),0.0,1.0);}`;
 return{...fragment,source:fragment.source.replace(p,uniforms+helper('P','u_previewSourceP','u_previewInitialP','previewMomentAt(u_previewFixedP,uv)+u_previewMobileWeight*previewMomentAt(u_inkLoad,uv)')).replace(c,helper('C','u_previewSourceC','u_previewInitialC','previewMomentAt(u_previewFixedC,uv)+u_previewMobileWeight*previewMomentAt(u_inkColor,uv)'))};
}
export function residualMomentReference(base,initial,transported){if([base,initial,transported].some(a=>a.length!==4||Array.from(a).some(v=>!Number.isFinite(v))))throw Error('Finite RGBA moments');return base.map((v,i)=>Math.min(1,Math.max(0,Math.fround(Math.fround(v)+Math.fround(Math.fround(transported[i])-Math.fround(initial[i]))))));}
