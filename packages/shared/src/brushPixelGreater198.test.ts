import {expect,it} from 'vitest'
import {isBrushLibrary,type BrushDescriptor} from './brushes.js'
import {filter147} from './filterSmudge147.testFixture.js'
import {library192} from './filterMask192.testFixture.js'
function brush():BrushDescriptor{const d=filter147();delete d.filter;delete d.mixer;d.model='stamp';d.version=198;d.behavior!.rendering!.accumulation='alphaDarken';d.behavior!.rendering!.pixelComposite='greater';return d}
it('requires a root Pixel wash and rejects foreign or downgraded composites',()=>{
 expect(isBrushLibrary(library192(brush()))).toBe(true)
 for(const edit of [(b:BrushDescriptor)=>{b.version=74},(b:BrushDescriptor)=>{delete b.behavior!.rendering!.pixelComposite},(b:BrushDescriptor)=>{b.behavior!.rendering!.accumulation='directOver'},(b:BrushDescriptor)=>{b.behavior!.erase=true},(b:BrushDescriptor)=>{b.model='mixer'}]){const b=brush();edit(b);expect(isBrushLibrary(library192(b))).toBe(false)}
})
it('requires a root Pixel wash for deterministic dissolve and keeps old records separate',()=>{
 const d=brush();d.version=201;d.behavior!.rendering!.pixelComposite='dissolve';expect(isBrushLibrary(library192(d))).toBe(true)
 for(const edit of [(b:BrushDescriptor)=>{b.version=198},(b:BrushDescriptor)=>{b.behavior!.rendering!.pixelComposite='greater'},(b:BrushDescriptor)=>{b.behavior!.rendering!.accumulation='directOver'},(b:BrushDescriptor)=>{b.behavior!.erase=true},(b:BrushDescriptor)=>{b.model='mixer'}]){const b=structuredClone(d);edit(b);expect(isBrushLibrary(library192(b))).toBe(false)}
})
