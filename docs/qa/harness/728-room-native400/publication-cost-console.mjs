export function parsePublicationCostConsole(message){
 const args=message.params?.args;if(args?.[0]?.value!=='[native-room-publication]')return null
 const row=JSON.parse(args[1]?.value)
 if(!['canvasSubmit','queuePrefixAck','glCanvasImport','glStateRead'].includes(row.phase)||!Number.isFinite(row.wallMs)||row.wallMs<0||typeof row.ok!=='boolean'||!Number.isSafeInteger(row.ownerEpoch)||row.ownerEpoch<1||!Number.isSafeInteger(row.requestId)||row.requestId<0||!Number.isSafeInteger(row.fifoEpoch)||row.fifoEpoch<0||!['source','material'].includes(row.requestKind))throw Error('Invalid publication cost provenance')
 return{phase:row.phase,wallMs:row.wallMs,ok:row.ok,ownerEpoch:row.ownerEpoch,requestId:row.requestId,fifoEpoch:row.fifoEpoch,requestKind:row.requestKind}
}
