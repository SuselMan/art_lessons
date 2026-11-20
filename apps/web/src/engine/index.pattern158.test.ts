import{it,expect,vi}from'vitest'
import{experiment158,library158,pattern158}from'../../../../packages/shared/src/experimentPattern158.testFixture'
import{installBrushLibrary,installBrushPixels}from'./brushLibrary'
import{createTestEngine,paperReady,pointerSample}from'./testing/engineTestUtils'
import{brushPatternAssetIds}from'@grafetto/shared'
it('public selected prepare includes captured full CAS, then author captures immutable selection; cold preparation has no unborn context requirement',async()=>{
 const brush=experiment158(),pattern=pattern158(),library=library158(brush)
 if(pattern.kind!=='rgba')throw Error('fixture')
 library.assets=brushPatternAssetIds(pattern).map(id=>({id,size:4,file:id.slice(6)+'.bin'}));installBrushLibrary(library)
 for(const[id,index]of brushPatternAssetIds(pattern).map((id,index)=>[id,index]as const))installBrushPixels(id,new Uint8Array(16).fill(64+index*30))
 const {engine}=createTestEngine()
 try{await paperReady(engine);engine.initLayer('own158');engine.setActiveLayer('own158');engine.setTool('digitalBrush');engine.setPencil(`brush:${brush.id}@158`);engine.setBrushPattern(pattern)
  const before=engine.getOperations();await expect(engine.prepareBrush(`brush:${brush.id}@158`,{pattern})).resolves.toEqual({status:'ready'});expect(engine.getOperations()).toEqual(before)
  const upload=vi.spyOn(engine['gl'],'texImage2D');await engine.prepareBrush(`brush:${brush.id}@158`,{pattern});expect(upload).not.toHaveBeenCalled()
  const snapshot=engine['_captureAuthorStart'](pointerSample(-7,2),0);expect(snapshot?.brushSource?.pattern).toEqual(pattern);expect(Object.isFrozen(snapshot?.brushSource?.pattern)).toBe(true)
  engine.setBrushPattern({version:1,kind:'none'});expect(snapshot?.brushSource?.pattern).toEqual(pattern);expect(engine['_captureAuthorStart'](pointerSample(-7,2),0)?.brushSource?.pattern).toEqual({version:1,kind:'none'})
 }finally{engine.destroy()}
})
