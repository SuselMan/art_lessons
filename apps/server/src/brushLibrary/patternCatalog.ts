import {createHash} from 'node:crypto'
import {canonicalSourcePatternResource,type BrushLibrary,type BrushPattern} from '@grafetto/shared'

/** Identity for a declared catalog resource, never a CAS or author grant. */
export function captureBrushPatterns(library:BrushLibrary):readonly BrushPattern[]{
 const patterns=library.patterns??[]
 if(!Array.isArray(patterns)||patterns.length>128)throw new Error('Invalid pattern catalog')
 const seen=new Set<string>()
 return Object.freeze(patterns.map(pattern=>{
  const resource=canonicalSourcePatternResource(pattern.resource)
  const id='pattern:'+createHash('sha256').update(JSON.stringify(resource,Object.keys(resource).sort()),'utf8').digest('hex')
  if(pattern.id!==id||seen.has(id)||typeof pattern.name!=='string'||!pattern.name.length||pattern.name.length>128)throw new Error('Pattern catalog identity differs')
  for(const asset of [...resource.channels,resource.alphaAsset])if(!library.assets.some(a=>a.id===asset&&a.size===resource.size))throw new Error('Pattern catalog asset unavailable')
  seen.add(id)
  return Object.freeze({id,name:pattern.name,resource})
 }))
}
