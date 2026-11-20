import {expect,it,vi} from 'vitest'
import {bristle141} from '../../../../packages/shared/src/bristleInitialization141.testFixture'
import {bristle143,source143} from '../../../../packages/shared/src/bristleSource143.testFixture'
import {installBrushLibrary,installBrushPixels} from './brushLibrary'
import {createTestEngine,paperReady} from './testing/engineTestUtils'

it.each([142,143,144])('prepares recorded native point capability only for opted-in revision%s',async version=>{
 const descriptor=version===142?bristle141():bristle143();descriptor.version=version
 installBrushLibrary({schemaVersion:1,brushes:[{name:`Native coverage${version}`,source:'own.kpp',warnings:[],descriptor}],assets:version===142?[]:[{id:source143,size:4,file:source143.slice(6)+'.bin'}],skipped:[]})
 if(version!==142)installBrushPixels(source143,new Uint8Array(16).fill(128))
 const {engine}=createTestEngine()
 try{
  await paperReady(engine)
  const native=vi.spyOn(engine['_brush'],'prepareBristleNativeAA142').mockImplementation(()=>{})
  const capsule=vi.spyOn(engine['_brush'],'prepareSketchLines').mockImplementation(()=>{})
  const operations=engine.getOperations()
  expect(await engine.prepareBrush(`brush:${descriptor.id}@${version}`)).toEqual({status:'ready'})
  expect(native.mock.calls.length).toBe(version===143?0:1)
  expect(capsule.mock.calls.length).toBe(version===143?1:0)
  expect(engine.getOperations()).toEqual(operations)
 }finally{engine.destroy()}
})
