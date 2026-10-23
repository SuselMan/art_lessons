#!/bin/bash
# Rebuild layer-1 on the given pages and report rebuild step durations (gl.finish-timed).
cd /home/suselman/projects/pencil-agents/watercolor-feel
B="npx tsx apps/web/scripts/devbridge.ts"
node -e "import('./apps/web/scripts/devices/bridge.mjs').then(async ({joinAndInstall, ev}) => { for (const p of process.argv.slice(1)) { await joinAndInstall(p); console.log(p, await ev(p, '(()=>{const e=window.__engine,gl=e.gl,P=Object.getPrototypeOf(e);const st=window.__steps=[];e._stepRebuildJob=function(j){gl.finish();const t=performance.now();P._stepRebuildJob.call(this,j);gl.finish();st.push(performance.now()-t)};window.__rt0=performance.now();e._rebuildLayer(\"layer-1\");return e._log.layerPixelOps(\"layer-1\").length})()')) } })" "$@"
for i in $(seq 1 40); do sleep 10; busy=0; for p in "$@"; do r=$($B eval $p 'return window.__engine._rebuildJobs.size' 2>&1|tail -1); [ "$r" != " 0" ] && busy=1; done; [ $busy = 0 ] && break; done
for p in "$@"; do echo "== $p"; $B eval $p 'const s=window.__steps.slice().sort((a,b)=>b-a);return {n:s.length, total:Math.round(s.reduce((a,b)=>a+b,0)), top:s.slice(0,10).map(Math.round), over50:s.filter(x=>x>50).length, over100:s.filter(x=>x>100).length, over200:s.filter(x=>x>200).length}' 2>&1|tail -1; done
