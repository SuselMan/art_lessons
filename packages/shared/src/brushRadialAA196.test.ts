import {expect,it} from 'vitest'
import {isBrushLibrary,type BrushDescriptor} from './brushes.js'
import {filter147} from './filterSmudge147.testFixture.js'
import {library192,FILTER192_MASK} from './filterMask192.testFixture.js'
function brush():BrushDescriptor {
 const d=filter147();delete d.filter;delete d.mixer;d.model='stamp';d.version=196
 d.tip={kind:'procedural',hardness:1,aspect:1,angle:0,rotation:'fixed',autoShape:{version:1,spikes:9},profile:{kind:'radialCurve',lookup:FILTER192_MASK,resolution:1,encoding:'unorm32be',antialias:true}}
 return d
}
it('accepts only root ordinary Pixel radial AA196 and rejects downgrade or foreign features',()=>{
 const d=brush();expect(isBrushLibrary(library192(d))).toBe(true)
 for(const edit of [(b:BrushDescriptor)=>{b.version=31},(b:BrushDescriptor)=>{b.tip.profile!.antialias=false},(b:BrushDescriptor)=>{delete b.tip.autoShape},(b:BrushDescriptor)=>{b.behavior!.timing={version:1,rate:1,ignoreDistanceSpacing:false}},(b:BrushDescriptor)=>{b.model='mixer'},(b:BrushDescriptor)=>{b.behavior!.erase=true}]){const b=brush();edit(b);expect(isBrushLibrary(library192(b))).toBe(false)}
})
