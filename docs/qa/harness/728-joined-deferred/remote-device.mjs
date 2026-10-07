import {execFileSync} from 'node:child_process';
/** A remote run must measure its renderer device, never substitute VPS/HOME memory. */
export function remoteMemoryMiB(probe,execute=execFileSync){
 if(!probe||typeof probe.file!=='string'||!Array.isArray(probe.args)||probe.args.some(x=>typeof x!=='string'))throw Error('Explicit readonly device memory probe required');
 const raw=String(execute(probe.file,probe.args,{encoding:'utf8',timeout:10000})).trim();
 if(!/^\d+$/.test(raw))throw Error('Device FreePhysicalMemory must be integer KiB');
 const value=Number(raw)/1024;if(!Number.isSafeInteger(Number(raw))||value<=0)throw Error('Invalid actual device memory');return value;
}
/** Only contexts created here are closed; neither remote default pages nor Browser.close is called. */
export function ownedRemoteBrowser(browser){
 const contexts=new Set();let closed=false;
 if(typeof browser?._connection?.close!=='function')throw Error('Unsupported Playwright disconnect seam');
 return{async newContext(options){if(closed)throw Error('Remote transport already closed');const c=await browser.newContext(options);contexts.add(c);return c},async close(){if(closed)return;closed=true;for(const c of contexts)await c.close().catch(()=>{});contexts.clear();browser._connection.close()},ownedOnly:true};
}
