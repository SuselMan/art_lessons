import{expect,it,vi}from'vitest'
const trace=vi.hoisted(()=>({events:[]as string[]}))
vi.mock('./PreparedGlSourceDraw',()=>({createPreparedGlSourcePort:(input:{bindCurrentCanonical:()=>unknown})=>({bindCurrentCanonical:input.bindCurrentCanonical,clear:()=>trace.events.push('clear'),copy:()=>trace.events.push('copy'),draw:()=>trace.events.push('draw'),basePlusFilm:()=>trace.events.push('sum')})}))
import{OwnedGlPreparedSource,type PreparedOwnedComposite}from'./OwnedGlPreparedSource'
import type{OwnedGlSourceFields}from'./OwnedGlSourceFields'
import type{RibbonPasses,RibbonPassesContext}from'../../../../apps/web/src/engine/src/raster/RibbonPasses'
import type{WatercolorPasses}from'../../../../apps/web/src/engine/src/raster/WatercolorPasses'
import type{CanonicalDrawCommand}from'../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
it('actual adapter keeps own field bindings across chunks and cannot touch a newer presentation on retirement',()=>{
 trace.events=[];const release=vi.fn(),newerRelease=vi.fn(),composite=vi.fn()
 const fields=Object.fromEntries(['presentation','original','coverage','coverageFilm','pigmentLoad','pigmentBase','pigmentFilm','colourLoad','colourBase','colourFilm','solventLoad','solventBase','solventFilm'].map(role=>[role,{role}]))
 const lease={fields,release}as unknown as OwnedGlSourceFields
 const owner=new OwnedGlPreparedSource({lease,context:{}as RibbonPassesContext,ribbon:{drawRibbonCompositeRect:composite}as unknown as RibbonPasses,watercolor:{}as WatercolorPasses})
 const command={kind:'ribbon',phase:'solvent',batch:{vertices:new Float32Array(11),inkBlend:'max',uniforms:{}}}as CanonicalDrawCommand
 const c={preset:{hardness:1},profile:{normalizeDeposit:false},bounds:{minX:1,minY:1,maxX:2,maxY:2}}as PreparedOwnedComposite
 owner.paint({commands:[command],rect:[0,0,1,1],film:true,waterOnly:true,composite:c});const boundary=trace.events.length
 owner.paint({commands:[command],rect:[0,0,1,1],film:true,waterOnly:true,composite:c})
 expect(trace.events.slice(boundary)).toEqual(['draw','sum']);expect(composite).toHaveBeenCalledTimes(2)
 expect(composite.mock.calls[0][0].buffer).toBe(fields.presentation);expect(composite.mock.calls[0][4]).toBe(fields.original)
 owner.retire();owner.retire();expect(release).toHaveBeenCalledTimes(1);expect(newerRelease).not.toHaveBeenCalled();expect(()=>owner.paint({commands:[],rect:null,film:true,waterOnly:true,composite:c})).toThrow('Retired')
})
