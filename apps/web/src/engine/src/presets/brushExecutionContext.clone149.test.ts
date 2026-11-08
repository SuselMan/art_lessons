import{it,expect}from'vitest'
import{assertBrushExecutionContext,brushExecutionContext}from'./brushExecutionContext'
import{spray133}from'../../../../../../packages/shared/src/sprayWash133.testFixture'
it('merged149 needs captured projection and clone coordinates; historical54 needs only clone',()=>{
 const b=spray133();delete b.spray;b.version=149;b.behavior!.rendering!.accumulation='directOver';b.clone={version:1,moveSourcePoint:true,source:'projectionCanvas',sourcePolicy:'canonical-begin-v1'}
 const clone={x:3,y:4,offsetX:-2,offsetY:1}
 expect(()=>assertBrushExecutionContext(b,brushExecutionContext(undefined,{version:1,clone}))).toThrow('projection')
 expect(()=>assertBrushExecutionContext(b,brushExecutionContext(undefined,{version:1,projection:[]}))).toThrow('recorded source')
 expect(()=>assertBrushExecutionContext(b,brushExecutionContext(undefined,{version:1,projection:[],clone}))).not.toThrow()
 b.version=54;b.clone={version:1,moveSourcePoint:true};expect(()=>assertBrushExecutionContext(b,brushExecutionContext(undefined,{version:1,clone}))).not.toThrow()
})
