import{it,expect}from'vitest'
import type{ImportedBrush}from'@grafetto/shared'
import{importedBrushPhotoLookup}from'./brushCatalog'
import{installBrushLibrary}from'../../engine/brushLibrary'
import{DIGITAL_BRUSHES}from'../../engine/src/presets/digitalBrushPresets'
it('retains illustrations across immutable rendering revisions without borrowing another source',()=>{
 const make=(id:string,version:number,source='stock.kpp',name='Stock tool'):ImportedBrush=>({name,source,warnings:[],descriptor:{...DIGITAL_BRUSHES[0],id,version}})
 const old=make('imported-aaaaaaaaaaaaaaaa',10),current=make('imported-bbbbbbbbbbbbbbbb',63),other=make('imported-cccccccccccccccc',63,'other.kpp')
 installBrushLibrary({schemaVersion:1,assets:[],skipped:[],brushes:[old,current,other]})
 const lookup=importedBrushPhotoLookup({[old.descriptor.id]:'existing-tool.png'})
 expect(lookup(current)).toBe('existing-tool.png');expect(lookup(other)).toBeUndefined()
 expect(lookup({...current,name:'Different tool'})).toBeUndefined()
 const direct=importedBrushPhotoLookup({[old.descriptor.id]:'existing-tool.png',[current.descriptor.id]:'new-tool.png'})
 expect(direct(current)).toBe('new-tool.png')
})
