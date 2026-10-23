import {writeFileSync} from 'node:fs';
import {ev} from '/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/night-overlay/apps/web/scripts/devices/bridge.mjs';
const ops=await ev('twm2vt',`if(!window.__oracle?.ops)throw Error('no fixture');return window.__oracle.ops;`,15000);
writeFileSync(new URL('./surface-dense-native-ops.json',import.meta.url),JSON.stringify(ops));
console.log(JSON.stringify({ops:ops.length,bytes:JSON.stringify(ops).length,types:ops.map(x=>x.type)}));
