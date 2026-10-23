#!/bin/bash
# (runcycle3: without the iPad) One multitest cycle in a fresh room, with the iPad's
# memory polled. Prints the run's summary lines and the iPad's timeOrigin set.
cd /home/suselman/projects/pencil-agents/watercolor-feel
B="npx tsx apps/web/scripts/devbridge.ts"
P=$(ps -eo pid,args | grep "laptoppeer.mjs" | grep -v grep | awk '{print $1}')
touch temp/device-runs/laptoppeer.stop; for i in $(seq 1 30); do [ -z "$P" ] && break; kill -0 $P 2>/dev/null || break; sleep 1; done
rm -f temp/device-runs/laptoppeer.stop temp/device-runs/laptoppeer.room temp/device-runs/mempoll.stop
nohup node apps/web/scripts/devices/laptoppeer.mjs > temp/device-runs/laptoppeer.log 2>&1 &
for i in $(seq 1 60); do [ -f temp/device-runs/laptoppeer.room ] && break; sleep 2; done
R=$(cat temp/device-runs/laptoppeer.room)
ids() { $B clients 2>&1 | grep -B1 "$1" | grep '"id"' | sed 's/.*"id": "\(.*\)".*/\1/' | tail -1; }
for ua in Android Windows; do timeout 60 $B eval $(ids $ua) "__devNavigate('/room/$R'); return 'ok'" >/dev/null 2>&1; done
ssh surface "echo https://192.168.1.70:5277/room/$R> C:\ProgramData\grafetto\url.txt" >/dev/null 2>&1
sleep 25
for try in 1 2 3; do
  miss=0
  for ua in Android Windows; do
    id=$(ids $ua); href=$($B clients 2>&1 | grep -A3 "\"id\": \"$id\"" | grep href)
    if [ -z "$id" ] || ! echo "$href" | grep -q "$R"; then miss=1; [ -n "$id" ] && timeout 60 $B eval $id "__devNavigate('/room/$R'); return 'ok'" >/dev/null 2>&1; fi
  done
  [ $miss = 0 ] && break; echo "retry navigate $try"; sleep 20
done
A=$(ids Android); S=$(ids Windows); L=$(ids X11)
echo "room $R android $A surface $S laptop $L"
node -e "import('./apps/web/scripts/devices/bridge.mjs').then(async ({joinAndInstall}) => { for (const p of process.argv.slice(1)) await joinAndInstall(p).catch(e => console.log(p, String(e).slice(0,80))) })" $A $S $L
node -e "import('./apps/web/scripts/devices/bridge.mjs').then(async ({ev}) => { const fs = await import('node:fs'); const src = fs.readFileSync(process.env.PROF || 'temp/device-runs/heavy.js','utf8').replace(\"e._rebuildLayer('layer-1')\", ''); for (const p of process.argv.slice(1)) console.log(p, await ev(p, 'return await ' + src).catch(e => String(e).slice(0,80))) })" $A $S
NORELOAD=${NORELOAD:-} SIZE_SCALE=0.4 timeout 2400 node apps/web/scripts/devices/multitest.mjs "$R" android=$A surface=$S laptop=$L > temp/device-runs/mt-$R.log 2>&1
echo "exit $?"
grep -E "^== after reload|^   |Error:" temp/device-runs/mt-$R.log | tail -4 | cut -c1-300
for p in $A $S; do echo "== leaf2 $p"; $B eval $p 'return window.__leaf2Dump ? window.__leaf2Dump().slice(0,14) : "none"' 2>&1|tail -1; echo "== heavy $p"; $B eval $p 'const h=window.__hv||[];const ag={};for(const [d,n] of h){const k=n.trim().slice(0,50);const a=ag[k]||(ag[k]=[0,0,0]);a[0]+=d;a[1]++;a[2]=Math.max(a[2],d)}return Object.entries(ag).sort((a,b)=>b[1][2]-a[1][2]).slice(0,8).map(([k,a])=>a.join("/")+" "+k)' 2>&1|tail -1; done
