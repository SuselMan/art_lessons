import {ev,joinAndInstall} from '/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/night-overlay/apps/web/scripts/devices/bridge.mjs';
console.log(await joinAndInstall('twm2vt','3b45ba95'));
console.log(await ev('twm2vt',`const e=window.__engine; return {page:e._pageSize(),lost:e.gl.isContextLost(),visibility:document.visibilityState,origin:performance.timeOrigin,workspace:'_wetOverlayWorkspace' in e};`));
