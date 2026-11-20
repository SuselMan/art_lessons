import {describe,expect,it} from 'vitest'
import {previewResource} from './previewFiles.js'
describe('isolated preview asset access',()=>{
 it('serves the renderer and hashed dependencies',()=>{
  expect(previewResource('/app/preview','http://127.0.0.1/brush-preview.html')?.contentType).toBe('text/html')
  expect(previewResource('/app/preview','http://127.0.0.1/brush-kernels/a.wasm')?.contentType).toBe('application/wasm')
 })
 it('refuses server paths, encoded escapes and unexpected files',()=>{
  for(const p of ['/api/me','/.env','/assets/%2e%2e%2fsecret.js','/assets/%5csecret.js','/assets/private.txt','/assets/%zz']) expect(previewResource('/app/preview','http://127.0.0.1'+p)).toBeUndefined()
 })
})
