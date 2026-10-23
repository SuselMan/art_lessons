import {ev} from '/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/night-overlay/apps/web/scripts/devices/bridge.mjs';
console.log(await ev('twm2vt',`return {url:location.href,uuid:typeof crypto.randomUUID,engine:!!window.__engine,text:document.body.innerText.slice(0,300)};`,10000));
