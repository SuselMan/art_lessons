#!/bin/bash
# Rebuild layer-1 on every page given (first is the reference), wait, compare.
cd /home/suselman/projects/pencil-agents/watercolor-feel
B="npx tsx apps/web/scripts/devbridge.ts"
for p in "$@"; do $B eval $p 'window.__engine._rebuildLayer("layer-1");return 1' >/dev/null 2>&1; done
for i in $(seq 1 120); do busy=0; for p in "$@"; do r=$($B eval $p 'return window.__engine._rebuildJobs.size' 2>&1|tail -1); [ "$r" != " 0" ] && busy=1; done; [ $busy = 0 ] && break; sleep 5; done
timeout 900 node temp/device-runs/comparelayers.mjs "$@" 2>&1 | tail -3
echo "compare done"
