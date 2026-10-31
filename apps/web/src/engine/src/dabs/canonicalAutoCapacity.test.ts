import {expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {isBrushLibrary,canonicalBrushDescriptorJSON,canonicalDefaultAutoSourceBinding,canonicalSourceComposition,CANONICAL_MATERIAL_LIMITS,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE as D,sourceAutoGeometry,type CanonicalDefaultAutoRecipe,type CanonicalDefaultAutoSource} from '@grafetto/shared'
import fixture from '../presets/fixtures/sourceDefaultAutoWholePath/markerDry.normal.native.json'
import {sourceStrokeAuthorDescriptor} from '../presets/sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceStrokeAuthorState,type SourceStrokeAuthorStep} from '../presets/sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter} from '../presets/sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder} from '../presets/sourceCanonicalFrameEncoder'
import {canonicalAutoMaskCapacity,assertCanonicalAutoRecipeCapacity} from './canonicalAutoCapacity'
function pin(){
 const library:unknown={schemaVersion:1,brushes:[fixture.imported],assets:[],skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid original Marker')
 const descriptor=library.brushes[0].descriptor,sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
 expect(sha).toBe(fixture.canonicalDescriptorSHA256)
 return {descriptor,source:canonicalDefaultAutoSourceBinding(descriptor,sha,D,G)}
}
function recipe(source:CanonicalDefaultAutoSource,scale=1,rotation=0,subX=0,subY=0):CanonicalDefaultAutoRecipe{
 const g=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:source.source.diameter,ratio:source.source.ratio,spikes:2,scale:source.brushScale,angle:source.brushAngle},{scale,ratio:1,rotation},subX,subY)
 return {kind:'defaultAuto',source:source.source,coverageProfile:source.coverageProfile,brushScale:source.brushScale,brushAngle:source.brushAngle,scale,ratio:1,rotation,subX,subY,width:g.maskSize[0],height:g.maskSize[1],mirrorH:false,mirrorV:false}
}
it('bounds all actual29frames/17draw Marker producer recipes without rerunning selection on replay',()=>{
 const {descriptor,source}=pin(),compiled=sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'normal-import-black',lodScale:1,inputProfile:'krita-freehand-no-smoothing-v1',coverageProfile:D})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const composition=canonicalSourceComposition(descriptor,G);if(!composition)throw Error('Missing original composition')
 const material={version:2 as const,assets:[],primarySource:source,budget:{workUnits:CANONICAL_MATERIAL_LIMITS.workUnits,outputBytes:CANONICAL_MATERIAL_LIMITS.outputBytes,drawPixels:CANONICAL_MATERIAL_LIMITS.drawPixels}}
 const author=new SourceStrokeAuthor(compiled.program);let state=author.createState(4321,7654,.3)
 const adapter=new SourceStrokeMaterialAdapter(compiled.program,material,state),encoder=new SourceCanonicalFrameEncoder({rasterProfile:G,brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:fixture.strokeId,pigmentRgb8:[0,0,0],composition:{...composition,alphaDarken:'creamy',outerResourceOpacity:1},material})
 const recipes:CanonicalDefaultAutoRecipe[]=[];let frames=0,draws=0,empty=0
 const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const c of chunks){const f=encoder.encode(c.packed).frame;frames++;draws+=f.draws.length;if(!f.draws.length)empty++;for(const r of f.definitions){if(!('kind'in r)||r.kind!=='defaultAuto')throw Error('Wrong original recipe');recipes.push(r)}}}
 const consume=(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>)=>{while(true){const n=iterator.next();if(n.done){state=n.value;return}accept(adapter.accept(n.value));const cut=adapter.flush();if(cut)accept([cut])}}
 for(const p of fixture.packets){accept(adapter.beginInput(state));if(p===fixture.packets[0]){const cut=adapter.flush();if(cut)accept([cut])}consume(author.plan(state,p))}
 accept(adapter.beginInput(state));consume(author.finish(state));accept(adapter.finish(state))
 expect({frames,draws}).toEqual({frames:29,draws:17});expect(empty).toBeGreaterThan(0);expect(encoder.ended).toBe(true)
 const capacity=canonicalAutoMaskCapacity(source);expect(capacity).toEqual({width:54,height:54,slots:1})
 expect(Math.max(...recipes.flatMap(r=>[r.width,r.height]))).toBe(40)
 for(const r of recipes)expect(()=>assertCanonicalAutoRecipeCapacity(r,source,capacity)).not.toThrow()
})
it('preserves legacy fixed-angle capacity and rejects its rotated domain',()=>{
 const {source}=pin(),legacy:CanonicalDefaultAutoSource={...source,coverageProfile:'neon64-f32-fma-v1',source:{...source.source,density:1}},capacity=canonicalAutoMaskCapacity(legacy)
 expect(capacity).toEqual({width:19,height:37,slots:1})
 expect(()=>assertCanonicalAutoRecipeCapacity(recipe(legacy),legacy,capacity)).not.toThrow()
 expect(()=>assertCanonicalAutoRecipeCapacity(recipe(legacy,1,.2),legacy,capacity)).toThrow()
})
it('bounds rotation/phase/near-zero scale but keeps forged/static/domain/oversize inputs closed',()=>{
 const {source}=pin(),capacity=canonicalAutoMaskCapacity(source)
 for(const scale of [Number.MIN_VALUE,.00001,.5,1-Number.EPSILON,1])for(let i=-32;i<=32;i++)for(const phase of [0,Number.EPSILON,.5,1-Number.EPSILON]){
  const r=recipe(source,scale,i*Math.PI/16,phase,phase);expect(()=>assertCanonicalAutoRecipeCapacity(r,source,capacity)).not.toThrow()
 }
 const r=recipe(source,1,.7)
 for(const bad of [{...r,scale:0},{...r,scale:1.01},{...r,ratio:.5},{...r,rotation:NaN},{...r,rotation:Infinity},{...r,mirrorH:true},{...r,mirrorV:true},{...r,width:r.width+1},{...r,brushAngle:r.brushAngle+.1},{...r,source:{...r.source,density:1}},{...r,coverageProfile:'neon64-f32-fma-v1' as const}])expect(()=>assertCanonicalAutoRecipeCapacity(bad,source,capacity)).toThrow()
 expect(()=>assertCanonicalAutoRecipeCapacity(r,source,{...capacity,width:1})).toThrow()
 for(const changed of [{...source,brushScale:2},{...source,source:{...source.source,diameter:Infinity}},{...source,source:{...source.source,diameter:1e6}}])expect(()=>canonicalAutoMaskCapacity(changed)).toThrow()
})
it('keeps qint truncation and finite angle normalization inside the existing one-megapixel fence',()=>{
 const {source}=pin(),edge:CanonicalDefaultAutoSource={...source,source:{...source.source,diameter:511.999999999,ratio:1}}
 const capacity=canonicalAutoMaskCapacity(edge);expect(capacity).toEqual({width:1024,height:1024,slots:1})
 for(const rotation of [Number.MAX_VALUE,-Number.MAX_VALUE,Math.PI/4,Math.PI/2])for(const phase of [0,1-Number.EPSILON])expect(()=>assertCanonicalAutoRecipeCapacity(recipe(edge,1,rotation,phase,phase),edge,capacity)).not.toThrow()
 expect(()=>canonicalAutoMaskCapacity({...edge,source:{...edge.source,diameter:512}})).toThrow()
})
