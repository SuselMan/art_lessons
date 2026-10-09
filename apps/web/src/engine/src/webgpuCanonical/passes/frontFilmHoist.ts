/** Exact DEV shader variant; no field math or Q8 boundary changes. */
export const frontFilmExpression='smoothstep(0.02,0.15,max(fieldAt(coverage,uv).a,u.wet.y*fieldLinear(foreignFilm,uv).r))'
export function frontFilmHoistShader(shader:string,enabled=false):string {
 if(!enabled)return shader
 const declaration=`let film=${frontFilmExpression};`
 if(shader.split(declaration).length!==2||shader.split('for(var k=0;k<8;k++) {').length!==2)throw Error('Exact single front anchors required')
 return shader.replace('for(var k=0;k<8;k++) {','var film=0.0;var filmReady=false;\n for(var k=0;k<8;k++) {').replace(declaration,`if(!filmReady){film=${frontFilmExpression};filmReady=true;}`)
}
