#!/bin/bash
# One multitest with GPU-step profiling on the three weak devices.
cd /home/suselman/projects/pencil-agents/watercolor-feel
B="npx tsx apps/web/scripts/devbridge.ts"
ids() { $B clients 2>&1 | grep -B1 "$1" | grep '"id"' | sed 's/.*"id": "\(.*\)".*/\1/' | tail -1; }
R=$1
A=$(ids Android); I=$(ids Macintosh); S=$(ids Windows); L=$(ids X11)
node -e "import('./apps/web/scripts/devices/bridge.mjs').then(async ({joinAndInstall, ev}) => { const fs = await import('node:fs'); const src = fs.readFileSync('temp/device-runs/gpuprof2.js','utf8'); for (const p of process.argv.slice(1)) { await joinAndInstall(p); console.log(p, await ev(p, src)) } })" $A $I $S $L
NORELOAD=1 SIZE_SCALE=0.4 timeout 2400 node apps/web/scripts/devices/multitest.mjs "$R" android=$A ipad=$I surface=$S laptop=$L > temp/device-runs/mt-gpu-$R.log 2>&1
echo "exit $?"
for p in $A $I $S; do echo "=== $p"; $B eval $p 'return window.__gpuWorst ? window.__gpuWorst() : "none"' 2>&1 | tail -1 | sed 's/\\n/\n/g' | head -25; done
