/** Stable descriptor bytes shared by server pinning and local author checks.
 * Input is an already validated descriptor; this is not a schema or grant. */
function normalizedDescriptor(value:unknown):unknown {
  if(Array.isArray(value))return value.map(normalizedDescriptor)
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined)
    .sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,normalizedDescriptor(v)]))
  return value
}
export function canonicalBrushDescriptorJSON(descriptor:unknown):string {
  return JSON.stringify(normalizedDescriptor(descriptor))
}
