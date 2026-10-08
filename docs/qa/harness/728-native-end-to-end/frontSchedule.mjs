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
 const copy=trace.ops.find(o=>o.index===38)?.events.at(-1)
 if(copy?.[0]!=='fieldOp'||copy[1].buffer!==pressure||copy[2].buffer!==a||copy[3].buffer!==a||copy[4]!==1||copy[5]!==0)throw Error('Final pressure copy contract')
 for(let i=0;i<calls.length;i++){
  const e=calls[i]
  if(e[1].w!==1536||e[1].h!==1536||e[5].buffer!==(i%2?a:pressure)||e[6].buffer!==(i%2?pressure:a)||JSON.stringify(e.slice(7))!==JSON.stringify(first.slice(7))||JSON.stringify(e.slice(2,5))!==JSON.stringify(first.slice(2,5)))throw Error('Outbound chronology/recipe changed')
 }
 return {steps:141,sourceFilters:['linear','nearest'],firstOp:3,lastOp:38,copyAfterLast:true,recipe:{x0:first[2],y0:first[3],dryCost:first[4],max:first[7],climb:first[8],floor:first[9],stride:first[10],scale:first[11]},limits:'Filters from actual production field factory. CPU chronology, not GPU proof. Copy after final step must remain in later planner-boundary gate.'}
}

export function firstInwardSchedule(trace){
 const calls=[]
 for(const op of trace.ops){if(op.index<40||op.index>43)continue;for(const e of op.events){if(e[0]==='front')calls.push(e);else if(!(op.index===43&&e[0]==='fieldOp'&&e[4]===1&&e[5]===0))throw Error('Unexpected inward operation')}}
 if(calls.length!==11)throw Error('Actual inward must contain11 steps')
 const first=calls[0],mask=first[5].buffer,a=first[6].buffer,copy=trace.ops.find(o=>o.index===43)?.events.at(-1)
 if(copy?.[0]!=='fieldOp'||copy[1].buffer!==mask||copy[2].buffer!==a||copy[3].buffer!==a||copy[4]!==1||copy[5]!==0)throw Error('Final mask copy contract')
 for(let i=0;i<calls.length;i++){
  const e=calls[i];if(e[1].w!==1536||e[1].h!==1536||e[5].buffer!==(i%2?a:mask)||e[6].buffer!==(i%2?mask:a)||e[7]!==12||e[8]!==(i<2?0:15)||e[9]!==(i<2?1:.5)||e[10]!==1||e[11]!==1||e[12]!==null||JSON.stringify(e.slice(2,5))!==JSON.stringify(first.slice(2,5)))throw Error('Inward chronology/recipe changed')
 }
 return{steps:11,firstOp:40,lastOp:43,sourceFilters:['linear','nearest'],copyAfterLast:true,phases:[{steps:2,costMax:12,climb:0,floor:1},{steps:9,costMax:12,climb:15,floor:.5}],x0:first[2],y0:first[3],dryCost:first[4],stride:1,scale:1,limits:'Actual CPU chronology only. G actual paper height; B earlier-base R0 for this packet. No mixing or GPU parity claim.'}
}
