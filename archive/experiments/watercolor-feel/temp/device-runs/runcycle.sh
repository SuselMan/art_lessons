#!/bin/bash
# One multitest cycle on all four devices in a fresh room, with the iPad's
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
for ua in Android Macintosh Windows; do timeout 60 $B eval $(ids $ua) "__devNavigate('/room/$R'); return 'ok'" >/dev/null 2>&1; done
ssh surface "echo https://192.168.1.70:5277/room/$R> C:\ProgramData\grafetto\url.txt" >/dev/null 2>&1
sleep 25
for try in 1 2 3; do
  miss=0
  for ua in Android Macintosh Windows; do
    id=$(ids $ua); href=$($B clients 2>&1 | grep -A3 "\"id\": \"$id\"" | grep href)
    if [ -z "$id" ] || ! echo "$href" | grep -q "$R"; then miss=1; [ -n "$id" ] && timeout 60 $B eval $id "__devNavigate('/room/$R'); return 'ok'" >/dev/null 2>&1; fi
  done
  [ $miss = 0 ] && break; echo "retry navigate $try"; sleep 20
done
A=$(ids Android); I=$(ids Macintosh); S=$(ids Windows); L=$(ids X11)
echo "room $R android $A ipad $I surface $S laptop $L"
node -e "import('./apps/web/scripts/devices/bridge.mjs').then(async ({joinAndInstall}) => { for (const p of process.argv.slice(1)) await joinAndInstall(p).catch(e => console.log(p, String(e).slice(0,80))) })" $A $I $S $L
node -e "import('./apps/web/scripts/devices/bridge.mjs').then(async ({ev}) => { const fs = await import('node:fs'); console.log('ipad', await ev(process.argv[1], fs.readFileSync('temp/device-runs/gputrack.js','utf8')), await ev(process.argv[1], fs.readFileSync('temp/device-runs/blackbox.js','utf8'))) })" $I
nohup node temp/device-runs/mempoll.mjs $I > temp/device-runs/mempoll-$R.log 2>&1 &
SIZE_SCALE=0.4 timeout 2400 node apps/web/scripts/devices/multitest.mjs "$R" android=$A ipad=$I surface=$S laptop=$L > temp/device-runs/mt-$R.log 2>&1
echo "exit $?"
touch temp/device-runs/mempoll.stop
grep -E "^== after reload|^   |Error:" temp/device-runs/mt-$R.log | tail -4 | cut -c1-300
echo "ipad origins: $(grep -o 'origin: [0-9]*' temp/device-runs/mempoll-$R.log | awk '{print substr($2,1,3)}' | sort -u | tr '\n' ' ')"
python3 - "$R" <<'PY'
import re,sys
mx={}
for l in open(f'temp/device-runs/mempoll-{sys.argv[1]}.log'):
    for k,v in re.findall(r'(\w+): (\d+)', l):
        if k!='origin': mx[k]=max(mx.get(k,0),int(v))
print('ipad max', mx)
PY
I2=$(ids Macintosh)
node -e "import('./apps/web/scripts/devices/bridge.mjs').then(async ({ev}) => { const fs = await import('node:fs'); const r = await ev(process.argv[1], 'return localStorage.__bb || null').catch(e => String(e)); fs.writeFileSync('temp/device-runs/bb-' + process.argv[2] + '.json', typeof r === 'string' ? r : JSON.stringify(r)); console.log('blackbox saved') })" $I2 $R
