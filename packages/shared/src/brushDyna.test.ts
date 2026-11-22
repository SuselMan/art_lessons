import{expect,it}from'vitest'
import{hasDyna210Scope,isBrushLibrary}from'./brushes.js'
import{library137}from'./gridWash137.testFixture.js'
it('admits only a bounded root DynaDraw circle profile',()=>{
 const library=library137(),b=library.brushes[0].descriptor;b.version=210;b.model='stamp';b.category='paint';delete b.grid;delete b.mixer;b.dyna={version:1,mass:0,drag:.65,diameter:3};b.tip={kind:'round',hardness:1,aspect:1,rotation:'fixed',angle:0};b.behavior={version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'directOver',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}
 expect(hasDyna210Scope(b)).toBe(true);expect(isBrushLibrary(library)).toBe(true)
 b.dyna.diameter=2;expect(hasDyna210Scope(b)).toBe(false);expect(isBrushLibrary(library)).toBe(false);b.dyna.diameter=3;b.version=50;expect(isBrushLibrary(library)).toBe(false)
})
