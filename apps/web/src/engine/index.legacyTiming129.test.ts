import{it,expect,vi}from'vitest'
import{brush129,dab129,library129}from'../../../../packages/shared/src/legacySmudgeTiming129.testFixture.js'
import{installBrushLibrary}from'./brushLibrary'
import{createTestEngine,paperReady}from'./testing/engineTestUtils'
import{brushExecutionContext}from'./src/presets/brushExecutionContext'
import type{ILayerBuffer}from'./src/buffers/ILayerBuffer'
it('actual index paintDabs validates129 sourceTime and capturedseed before target/state dispatch',async()=>{const b=brush129();installBrushLibrary(library129(b));const{engine}=createTestEngine({userId:'owner'},{width:32,height:32});await paperReady(engine);const touch=vi.fn(),target=new Proxy({},{get(){touch();throw Error('target touched')}})as ILayerBuffer;try{for(const sourceTime of[undefined,NaN,Infinity,-1])expect(()=>engine['_paintDabs'](target,[{...dab129(0),sourceTime}],'digitalBrush','brush:'+b.id+'@129',[1,0,0],'owner',undefined,undefined,undefined,undefined,undefined,undefined,false,false,undefined,brushExecutionContext({version:1,sequentialSeed:17,strokeSeed:42}))).toThrow('source');expect(touch).not.toHaveBeenCalled()}finally{engine.destroy()}})
