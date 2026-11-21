import {expect,it} from 'vitest'
import {isBrushLibrary,type BrushDescriptor} from './brushes.js'
import {filter147} from './filterSmudge147.testFixture.js'
import {library192} from './filterMask192.testFixture.js'
function brush():BrushDescriptor{const d=filter147();delete d.filter;delete d.mixer;d.model='stamp';d.version=197;d.behavior!.rendering!.accumulation='alphaDarken';d.behavior!.colorMix={version:1,value:.8,pressure:[[0,0],[1,1]]};return d}
it('requires a root Pixel wash and a bounded pressure curve',()=>{
 expect(isBrushLibrary(library192(brush()))).toBe(true)
 for(const edit of [(b:BrushDescriptor)=>{b.version=74},(b:BrushDescriptor)=>{delete b.behavior!.colorMix},(b:BrushDescriptor)=>{b.behavior!.colorMix!.value=2},(b:BrushDescriptor)=>{b.behavior!.colorMix!.pressure=[[0,0],[1,2]]},(b:BrushDescriptor)=>{b.behavior!.rendering!.accumulation='directOver'},(b:BrushDescriptor)=>{b.behavior!.erase=true},(b:BrushDescriptor)=>{b.model='mixer'}]){const b=brush();edit(b);expect(isBrushLibrary(library192(b))).toBe(false)}
})
