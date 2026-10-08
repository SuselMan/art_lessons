import test from 'node:test'
import assert from 'node:assert/strict'
import {stampBuildCode} from './buildProvenance.mjs'
test('every serialized diagnostic entry gets exact immutable code passport',()=>{
 const code='3f7fadd3ac27e8a4ee88f01adb50ce8cc42d8bce'
 const result=stampBuildCode('__CODE__ __SOURCE_CODE__ __SOURCE_CODE__',code)
 assert.equal(result,[code,code,code].join(' '))
 assert.throws(()=>stampBuildCode('__SOURCE_CODE__','guessed'),/passport/)
})
