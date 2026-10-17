import {m70Windows,type M70WindowRect} from './M70WindowPolicy'

/** Several interiors at the sheet edge share an identical immutable input
 * window. Solve that window once and scatter every owned interior from it. */
export function m70WindowGroups(page:{width:number;height:number},domain:{width:number;height:number},provenRadius:number){
  const groups=new Map<string,{field:M70WindowRect;cores:M70WindowRect[]}>()
  for(const {field,core} of m70Windows(page,domain,provenRadius)){
    const key=`${field.x},${field.y},${field.width},${field.height}`
    const group=groups.get(key)
    if(group)group.cores.push(core)
    else groups.set(key,{field,cores:[core]})
  }
  return [...groups.values()]
}
