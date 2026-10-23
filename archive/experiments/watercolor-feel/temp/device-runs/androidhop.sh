#!/bin/bash
# Restart Chrome on the tablet, hop between two rooms until the GPU process
# crashes (or N hops), print the last shader links the page recorded.
cd /home/suselman/projects/pencil-agents/watercolor-feel
B="npx tsx apps/web/scripts/devbridge.ts"; AD=$(cat temp/device-runs/android.adb); A=~/tools/platform-tools/adb
$A -s $AD shell am force-stop com.android.chrome; sleep 1
$A -s $AD shell am start -a android.intent.action.VIEW -d "https://192.168.1.70:5277/create?t=$(date +%s)" -p com.android.chrome >/dev/null; sleep 12
P=$($B clients 2>&1 | grep -B1 Android | grep '"id"' | sed 's/.*"id": "\(.*\)".*/\1/' | tail -1)
$B eval $P 'localStorage.__linkSpy="1"; localStorage.removeItem("__linkLast"); localStorage.removeItem("__linkDone"); return 1' >/dev/null 2>&1
$A -s $AD logcat -c
J='for (let i = 0; i < 40 && !window.__engine; i++) { const b = [...document.querySelectorAll("button")].find(b => /Войти|Join/i.test(b.textContent)); if (b) b.click(); await new Promise(r => setTimeout(r, 500)) } await new Promise(r => setTimeout(r, 4000)); return [!!window.__engine, localStorage.__linkDone]'
for i in $(seq 1 ${1:-12}); do for R in EhbrMPhn RBBDMxlW; do
  $B eval $P "__devNavigate('/room/$R'); return 1" >/dev/null 2>&1; sleep 3
  out=$(timeout 60 $B eval $P "$J" 2>&1|tail -1)
  if $A -s $AD logcat -d | grep -q "GPU process exited"; then
    echo "CRASH at hop $i $R $out"
    $B eval $P 'return JSON.parse(localStorage.__linkLog).slice(-3).map(r=>r.n+" "+r.sigs.join("|")+" "+r.uniforms[1].slice(0,40))' 2>&1|tail -1
    exit 0
  fi
done; done
echo "no crash in ${1:-12} rounds"
