import{it,expect,vi}from'vitest'
import{isBrushLibrary,type ImportedBrush,type BrushDescriptor}from'@grafetto/shared'
import{installBrushLibrary,importedBrushes as installedBrushes,importedBrushFromPreset,retainImportedBrushResources}from'../../engine/src/presets/importedBrushes'
const owned=vi.hoisted(()=>({records:[]as ImportedBrush[]}))
vi.mock('../../engine/brushLibrary',()=>({importedBrushes:()=>owned.records}))
import{pickerImportedBrushes,importedBrushPhotoLookup}from'./brushCatalog'
function record(name:string,id:string,version:number):ImportedBrush{const descriptor:BrushDescriptor={id,version,model:'stamp',category:'paint',tip:{kind:'round',angle:0,aspect:1,hardness:1,rotation:'fixed'},paperInteraction:0,spacing:.1,flow:1,flowPer:'stamp',opacity:1,pressureSmoothingPx:0,sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]]};return{name,source:name+'.kpp',warnings:[],descriptor}}
it('real picker selects refreshed same source/name while immutable old definitions remain available to history',()=>{const old=record('OwnStock127','imported-127000000000000000000000',27),fresh=record('OwnStock127','imported-127111111111111111111111',81),other=record('Other127','imported-127222222222222222222222',27);const before=JSON.stringify(old);owned.records=[old,other,fresh];try{expect(pickerImportedBrushes().map(b=>b.descriptor.id)).toEqual([other.descriptor.id,fresh.descriptor.id]);expect(owned.records.find(b=>b.descriptor.id===old.descriptor.id)).toBe(old);expect(JSON.stringify(old)).toBe(before);expect(importedBrushPhotoLookup({[old.descriptor.id]:'same-authored-photo'})(fresh)).toBe('same-authored-photo')}finally{owned.records=[]}})
it('same name from another source does not hide or rewrite original operation definitions',()=>{const a=record('OwnStock127','imported-127333333333333333333333',27),b=record('OwnStock127','imported-127444444444444444444444',81);b.source='AnotherSource.kpp';owned.records=[a,b];try{expect(pickerImportedBrushes()).toEqual([a,b])}finally{owned.records=[]}})

it('archived metadata hides only picker entries while real immutable preset resolution and artwork remain available',()=>{
 const historical=record('Archived own fixture','imported-127555555555555555555555',139),current=record('Archived own fixture','imported-127666666666666666666666',140),ordinary=record('Real imported brush','imported-127777777777777777777777',140)
 historical.archived=true;current.archived=true;ordinary.archived=false
 const library={schemaVersion:1 as const,assets:[],skipped:[],brushes:[historical,current,ordinary]}
 expect(isBrushLibrary(library)).toBe(true)
 for(const archived of[null,0,1,'true',[],{}])expect(isBrushLibrary({...library,brushes:[{...current,archived}]})).toBe(false)
 try{
  installBrushLibrary(library);owned.records=[...installedBrushes()]
  expect(pickerImportedBrushes().map(b=>b.descriptor.id)).toEqual([ordinary.descriptor.id])
  expect(importedBrushFromPreset('brush:'+historical.descriptor.id+'@139')).toEqual(historical.descriptor)
  expect(importedBrushFromPreset('brush:'+current.descriptor.id+'@140')).toEqual(current.descriptor)
  expect(importedBrushPhotoLookup({[historical.descriptor.id]:'retained-history-artwork'})(current)).toBe('retained-history-artwork')
  expect(installedBrushes().find(b=>b.descriptor.id===historical.descriptor.id)?.archived).toBe(true)
 }finally{owned.records=[];retainImportedBrushResources([])}
})
