/** Compare captured actual live author; never manufacture a new author baseline. */
export function compareSavedAuthor(saved,replay){
 const author=saved?.author
 if(!author?.fields?.gatePassed||!author.export?.alpha||!Array.isArray(author.chunks)||!saved.strokeObservations?.at(-1)?.live?.meaningfulPigmentVisible)throw Error('Meaningful saved actual live author required')
 const hash=fields=>fields.records.map(({role,sha,absent})=>({role,sha,absent}))
 const material=fields=>fields.records.filter(r=>r.role==='material'||r.role.startsWith('tile0:')).map(({role,sha,absent,sums})=>({role,sha,absent,sums}))
 const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
 const checks={fieldsExact:eq(hash(author.fields),hash(replay.fields)),materialExact:eq(material(author.fields),material(replay.fields)),recipesExact:eq(author.chunks,replay.chunks),exportExact:eq(author.export,replay.export)}
 return {...checks,exact:Object.values(checks).every(Boolean),scope:'Saved actual live author vs fresh packed replay; no repeat author'}
}
