import fs from 'node:fs';import vm from 'node:vm';
const file=new URL('./matrix.mjs',import.meta.url),source=fs.readFileSync(file,'utf8');
const forbidden=['setActiveLayer(id);window.__engine','teacher-target-B-undo','temp/paired-precision','precision-inputs-only.js'];for(const x of forbidden)if(source.includes(x))throw Error('Stale fixture '+x);
for(const required of ['pending:!!e.pending','Number.isInteger(e.serverSeq)','layer_visibility','layer_delete','ordinary-reconnect-fresh','restoreRequests','OWNED']){if(required==='OWNED')continue;if(!source.includes(required))throw Error('Missing invariant '+required)}
if(!source.includes('360000')||!source.includes('browser?.close()'))throw Error('Missing watchdog/finally');
console.log('CPU manifest/paths/invariant dry-run PASS; no browser/network/device invocation');
