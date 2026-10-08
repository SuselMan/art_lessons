import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
const root=process.cwd(),source=path.join(root,'apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan.ts'),out=path.join(root,'temp/device-runs/CanonicalLazyContacts.ts')
const original=fs.readFileSync(source,'utf8'),sha=text=>createHash('sha256').update(text).digest('hex')
let code=original
const edits=[
 ['  lazyContacts = false','  lazyContacts = false\n  /** QA ONLY: cloned captured CPU geometry; never claims GPU owner locking. */\n  diagnosticLazyCapturedContacts = false'],
 ['    const lazyContacts = this.lazyContacts && presentationOwnerLocked','    const capturedLazyContacts = this.diagnosticLazyCapturedContacts && finishMetadata !== undefined\n    const lazyContacts = this.lazyContacts && presentationOwnerLocked || capturedLazyContacts\n    const contactTravel = capturedLazyContacts ? metadata.brushTravel.map(d => ({ ...d })) : metadata.brushTravel'],
 ['brushDragContactGroups(metadata.brushTravel, contactRect)','brushDragContactGroups(contactTravel, contactRect)']]
for(const[from,to]of edits){if(code.split(from).length!==2)throw Error('Frozen source seam mismatch: '+from);code=code.replace(from,to)}
// Generated copy only. Production source and live review runtime are untouched.
code=code.replace(/from '([^']+)'/g,(whole,spec)=>spec.startsWith('.')?`from '${path.relative(path.dirname(out),path.resolve(path.dirname(source),spec)).replaceAll(path.sep,'/')}'`:whole)
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,code)
fs.writeFileSync(path.join(root,'temp/device-runs/lazy-contact-edits.json'),JSON.stringify({source,sourceSHA:sha(original),generatedSHA:sha(code),edits},null,2))
console.log(JSON.stringify({generated:path.relative(root,out),productionModified:false}))
