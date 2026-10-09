/** OFF preview-only seed. V.A is support, not liquid thickness. Production unchanged. */
export const PREVIEW_WET_PATH_SEED_FRAGMENT=`
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_pressure;
uniform sampler2D u_water;
uniform vec2 u_resolution;
uniform float u_band;
bool inside(vec2 p){return p.x>=0.0&&p.y>=0.0&&p.x<u_resolution.x&&p.y<u_resolution.y;}
bool supported(vec2 p){
 if(!inside(p))return false;
 vec2 uv=(p+0.5)/u_resolution;
 return texture2D(u_pressure,uv).r<=u_band && texture2D(u_water,uv).a>0.0;
}
float path(vec2 p,vec2 d){return supported(p)&&supported(p+d)?1.0:0.0;}
void main(){vec2 p=floor(v_uv*u_resolution);gl_FragColor=vec4(path(p,vec2(1.0,0.0)),path(p,vec2(-1.0,0.0)),path(p,vec2(0.0,1.0)),path(p,vec2(0.0,-1.0)));}
`;
/** Literal seed predicate, explicit nearest aligned128 V input prerequisite. */
export function wetPathSeedOracle(cost,water,width,height,band){
 if(cost.length!==width*height||water.length!==cost.length)throw Error('Aligned path fields');
 const a=new Float32Array(cost.length*4),dirs=[[1,0],[-1,0],[0,1],[0,-1]],supports=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&cost[y*width+x]<=band&&water[y*width+x]>0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let k=0;k<4;k++){const[dx,dy]=dirs[k];a[(y*width+x)*4+k]=supports(x,y)&&supports(x+dx,y+dy)?1:0}return a;
}
/** Preinput-only compilation. Subsequent reductions call the unchanged production program. */
export async function createPreviewWetPathSeed(passes){
 const[{DISPLAY_VERT},{createProgram}]=await Promise.all([import('/src/engine/src/raster/shaders.ts'),import('/src/engine/src/raster/utils.ts')]);
 const ctx=passes.ctx,gl=ctx.gl(),program=createProgram(gl,DISPLAY_VERT,PREVIEW_WET_PATH_SEED_FRAGMENT);let disposed=false;
 try{const position=gl.getAttribLocation(program,'a_position'),u=Object.fromEntries(['pressure','water','resolution','band'].map(k=>[k,gl.getUniformLocation(program,'u_'+k)]));
 return{draw(out,pressure,water,band){
 if(disposed||!Number.isFinite(band)||[out,pressure,water].some(f=>f.width!==128||f.height!==128)||out.texture===pressure.texture||out.texture===water.texture)throw Error('Owned path seed contract');
 out.beginReplaceDraw();try{gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,ctx.screenBuf());gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,pressure.texture);gl.uniform1i(u.pressure,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,water.texture);gl.uniform1i(u.water,1);gl.uniform2f(u.resolution,128,128);gl.uniform1f(u.band,band);gl.drawArrays(gl.TRIANGLES,0,6)}finally{out.endDraw()}
 },disposeAfterKnownIdle(){if(disposed)return;disposed=true;gl.deleteProgram(program)}};
 }catch(error){gl.deleteProgram(program);throw error}
}
