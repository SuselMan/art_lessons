#!/bin/bash
# androidstress.sh '<js expr for the fragment source, m = shaders module>' [N] [salt:front|end|none]
cd /home/suselman/projects/pencil-agents/watercolor-feel
A=~/tools/platform-tools/adb; AD=$(cat temp/device-runs/android.adb); B="npx tsx apps/web/scripts/devbridge.ts"
$A -s $AD shell am force-stop com.android.chrome; sleep 1
$A -s $AD shell am start -a android.intent.action.VIEW -d "https://192.168.1.70:5277/create?t=$(date +%s)" -p com.android.chrome >/dev/null; sleep 11
P=$($B clients 2>&1 | grep -B1 Android | grep '"id"' | sed 's/.*"id": "\(.*\)".*/\1/' | tail -1)
$A -s $AD logcat -c
SRC=$(python3 - "$1" "${2:-3}" "${3:-front}" <<'PY'
import sys
s=open('temp/device-runs/linkstress.js').read()
expr,n,mode=sys.argv[1],sys.argv[2],sys.argv[3]
s=s.replace('const FRAG = window.__stressFrag || m.WC_FIELD_OP_FRAG','const FRAG = ('+expr+')')
s=s.replace('const N = window.__stressN || 200','const N = '+n)
if mode=='end':
    s=s.replace('salt + FRAG','FRAG + "\\n" + salt').replace('salt + m.DISPLAY_VERT','m.DISPLAY_VERT + "\\n" + salt')
elif mode=='none':
    s=s.replace('salt + FRAG','FRAG').replace('salt + m.DISPLAY_VERT','m.DISPLAY_VERT')
print(s)
PY
)
R=$(node -e "import('./apps/web/scripts/devices/bridge.mjs').then(async ({ev}) => { console.log(JSON.stringify(await ev('$P', 'return await ' + process.argv[1], 600000))) }).catch(e=>console.log('ERR', String(e).slice(0,200)))" "$SRC" 2>&1|tail -1)
echo "$R crashes=$($A -s $AD logcat -d | grep -cE 'GPU process exited')"
