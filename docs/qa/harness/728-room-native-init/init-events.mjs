/** Only explicit QA markers; ordinary console and malformed payloads ignored. */
export function parseInitConsoleEvent(event) {
 if(event.method!=='Runtime.consoleAPICalled')return null
 const text=event.params?.args?.[0]?.value
 if(text==='[native-room-init]'&&typeof event.params?.args?.[1]?.value==='string')return {stage:event.params.args[1].value,ms:event.params.timestamp,source:'native-room-init',values:event.params.args.slice(2).map(x=>x.value??x.description)}
 if(typeof text!=='string'||!text.startsWith('QA_NATIVE_INIT '))return null
 try{const marker=JSON.parse(text.slice('QA_NATIVE_INIT '.length));if(typeof marker.stage!=='string'||!Number.isFinite(marker.ms))return null;return marker}catch{return null}
}
