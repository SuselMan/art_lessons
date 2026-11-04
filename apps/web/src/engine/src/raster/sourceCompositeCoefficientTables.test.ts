import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {SOURCE_GREATER_WEIGHT_GLSL as shader,SOURCE_SCALAR4_COS_GLSL as cosShader,SOURCE_SCALAR4_COS_Q} from './sourceCompositeCoefficientTables'
import {SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL as es1} from './sourceRgba8CompositeWebGL1'
import {SOURCE_RGBA8_COMPOSITE_GLSL as es3} from './sourceRgba8CompositeShader'
type Decision=number|{threshold:number;left:Decision;right:Decision}
function readShader(source=shader,name='sourceGreaterWeight',variable='delta'):Decision{
 const tokens=source.match(/[a-zA-Z_]\w*|-?\d+(?:\.\d+)?|[{}();<]/g)!
 let next=0
 const take=(expected:string)=>{expect(tokens[next++]).toBe(expected)}
 const number=()=>{const value=Number(tokens[next++]);expect(Number.isFinite(value)).toBe(true);return value}
 const block=():Decision=>{
  take('{');let result:Decision
  if(tokens[next]==='return'){take('return');result=number();take(';')}
  else{take('if');take('(');take(variable);take('<');const threshold=number();take(')');const left=block();take('else');result={threshold,left,right:block()}}
  take('}');return result
 }
 take('float');take(name);take('(');take('float');take(variable);take(')');const tree=block();expect(next).toBe(tokens.length);return tree
}
function evaluate(tree:Decision,delta:number):number{return typeof tree==='number'?tree:evaluate(delta<tree.threshold?tree.left:tree.right,delta)}
it('keeps all511 pinned Q65535 results at integer and fractional decision boundaries',()=>{
 const tree=readShader()
 for(const offset of [0,.25,.5,.999]){
  const bytes=new Uint8Array(511*2),view=new DataView(bytes.buffer)
  for(let index=0;index<511;index++)view.setUint16(index*2,evaluate(tree,index-255+offset),true)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('8f1f9b1d94f76bf9cb31cd7f047a8876664ba6607717fd865a1fd4bc2735e5be')
 }
 expect(evaluate(tree,-Infinity)).toBe(0);expect(evaluate(tree,Infinity)).toBe(65535);expect(evaluate(tree,NaN)).toBe(65535)
})
it('uses the shared compact lookup in both kernels within the mobile branch budget',()=>{
 expect(shader.length).toBeLessThan(8000)
 expect(shader.match(/return /g)!.length).toBeLessThan(200)
 expect(es1).toContain(shader);expect(es3).toContain(shader)
})

it('preserves all pinned cosine shader values without reflected helper calls',()=>{
 const tree=readShader(cosShader,'sourceScalar4Cos','v')
 for(const offset of [0,.25,.5,.999]){
  const bytes=new Uint8Array(256*4),view=new DataView(bytes.buffer)
  for(let index=0;index<256;index++){
   const value=evaluate(tree,index+offset);expect(value).toBe(SOURCE_SCALAR4_COS_Q[index]);view.setInt32(index*4,value,true)
  }
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('2323fb3eb8145bdc632de7bb8437800f763f5ea34c204259a7c9a0dcbbe60ecf')
 }
 expect(evaluate(tree,-Infinity)).toBe(65535);expect(evaluate(tree,Infinity)).toBe(-65535);expect(evaluate(tree,NaN)).toBe(-65535)
 expect(cosShader.match(/sourceScalar4Cos\(/g)!.length).toBe(1);expect(es1).toContain(cosShader);expect(es3).toContain(cosShader)
})
