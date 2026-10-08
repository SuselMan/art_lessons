/** CPU trace validation only. No shader execution or inferred pixel equality. */
export function firstOutboundSchedule(trace){
 const calls=[]
 for(const op of trace.ops){
  if(op.index<3)continue
  if(op.index>38)break
  for(const event of op.events){
   if(event[0]==='front')calls.push(event)
   else if(!(op.index===38&&event[0]==='fieldOp'&&event[4]===1&&event[5]===0))throw Error('Unexpected outbound operation')
  }
 }
 if(calls.length!==141)throw Error('Actual outbound must contain141 steps')
 const first=calls[0],pressure=first[5].buffer,a=first[6].buffer
 for(let i=0;i<calls.length;i++){
  const e=calls[i]
  if(e[1].w!==1536||e[1].h!==1536||e[5].buffer!==(i%2?a:pressure)||e[6].buffer!==(i%2?pressure:a)||JSON.stringify(e.slice(7))!==JSON.stringify(first.slice(7))||JSON.stringify(e.slice(2,5))!==JSON.stringify(first.slice(2,5)))throw Error('Outbound chronology/recipe changed')
 }
 return {steps:141,sourceFilters:['linear','nearest'],firstOp:3,lastOp:38,copyAfterLast:true,recipe:{x0:first[2],y0:first[3],dryCost:first[4],max:first[7],climb:first[8],floor:first[9],stride:first[10],scale:first[11]},limits:'Filters from actual production field factory. CPU chronology, not GPU proof. Copy after final step must remain in later planner-boundary gate.'}
}
