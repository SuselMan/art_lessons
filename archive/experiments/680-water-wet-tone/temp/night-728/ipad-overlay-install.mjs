import {ev,joinAndInstall} from '/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/night-overlay/apps/web/scripts/devices/bridge.mjs';
console.log(await joinAndInstall('cb955808','cb955808'));
console.log(await ev('cb955808',`const e=window.__engine; return {page:e._pageSize(),lost:e.gl.isContextLost(),visibility:document.visibilityState,origin:performance.timeOrigin,workspace:'_wetOverlayWorkspace' in e};`));
