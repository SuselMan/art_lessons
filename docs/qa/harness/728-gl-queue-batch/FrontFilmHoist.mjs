/** Isolated source transform, never installed in a runtime. */
export const filmExpression='smoothstep(0.02,0.15,max(fieldAt(coverage,uv).a,u.wet.y*fieldLinear(foreignFilm,uv).r))'
export function hoistFrontFilm(shader){
 const declaration=`let film=${filmExpression};`
 if(shader.split(declaration).length!==2||shader.split('for(var k=0;k<8;k++) {').length!==2)throw Error('Exact single front anchors required')
 return shader.replace('for(var k=0;k<8;k++) {','var film=0.0;var filmReady=false;\n for(var k=0;k<8;k++) {').replace(declaration,`if(!filmReady){film=${filmExpression};filmReady=true;}`)
}
const F=Math.fround,add=(a,b)=>F(F(a)+F(b)),mul=(a,b)=>F(F(a)*F(b))
function filmValue(c,w,foreign){const x=F(Math.max(F(c),mul(w,foreign))),t=F(Math.max(0,Math.min(1,F(F(x-F(.02))/F(F(.15)-F(.02))))));return mul(mul(t,t),F(3-mul(2,t)))}
/** Scalar f32 scheduling oracle. Same arithmetic, no texture/GPU equivalence claim. */
export function frontFilmOracle(input,hoisted){
 let best=mul(input.source,input.max),film,loads=0
 for(const n of input.neighbors){if(!n.inside||F(n.ci)>=F(.999))continue
  if(!hoisted||film===undefined){film=filmValue(input.coverage,input.foreignWet,input.foreign);loads++}
  const relief=F(Math.max(mul(input.floor,input.stride),add(input.stride,mul(input.climb,F(input.hj-n.hi)))))
  const mixed=add(mul(input.dry,F(1-film)),film),edge=mul(mul(n.len,relief),mixed)
  best=F(Math.min(best,add(mul(n.ci,input.max),edge)))
 }
 const value=F(F(Math.min(best,F(input.max)))/F(input.max));return{value,q8:Math.round(Math.max(0,Math.min(1,value))*255),loads}
}
