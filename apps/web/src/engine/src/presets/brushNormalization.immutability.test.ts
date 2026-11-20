import{expect,it}from'vitest'
import{library141}from'../../../../../../packages/shared/src/bristleInitialization141.testFixture'
import{installBrushLibrary,importedBrushes,retainImportedBrushResources}from'../../brushLibrary'
import{hasBristleInitializationScope}from'@grafetto/shared'
import{normalizeBrush}from'./brushNormalization'
it('preserves the immutable imported policy view without freezing a mutable caller or copying source hairs',()=>{
 const library=library141();installBrushLibrary(library)
 try{
  const source=importedBrushes().find(b=>b.descriptor.id===library.brushes[0].descriptor.id)!.descriptor,view=normalizeBrush(source)
  expect(Object.isFrozen(source)).toBe(true);expect(Object.isFrozen(view)).toBe(true);expect(view.bristle).toBe(source.bristle);expect(view.behavior).toBe(source.behavior);expect(normalizeBrush(source)).toBe(view);expect(hasBristleInitializationScope(view)).toBe(true)
  const mutable=structuredClone(source),mutableView=normalizeBrush(mutable)
  expect(Object.isFrozen(mutableView)).toBe(false);expect(Object.isFrozen(mutable)).toBe(false);expect(hasBristleInitializationScope(mutableView)).toBe(true)
 }finally{retainImportedBrushResources([])}
})
