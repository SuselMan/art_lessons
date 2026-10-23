#!/bin/bash
set -euo pipefail
qa_task_root=/home/suselman/projects/pencil-agents/680-water-wet-tone
qa_task_own=/home/suselman/projects/pencil-agents/728-bounded-ui-optin
qa_task_runtime="$qa_task_own/temp/native-source-offline/runtime-room-92e0626a"
qa_task_out="$qa_task_own/temp/device-runs/room-firstwater-trace92"
cd "$qa_task_root"
export QA_SOURCE=92e0626a3dbe60388c556fa38067d6a018f6a90c
export QA_APP=https://tools.pecni.com CDP_BASE=http://127.0.0.1:9455
export QA_ENTRY_FILE=/home/suselman/.local/share/project-services/watercolor-qa/native-room-firstlive92.url
export QA_RUNTIME="$qa_task_runtime" QA_MANIFEST="$qa_task_runtime-manifest.json" QA_PAPER_MANIFEST="$qa_task_runtime-paper-manifest.json" QA_ORIGIN_MANIFEST="$qa_task_runtime-origin-manifest.json"
export QA_OUT="$qa_task_out" QA_SCENARIO=four400 QA_CAPTURE_FIELDS=0 QA_CARRY_HARDWARE_PRESSURE=1 QA_RAW_CANVAS_WARMUP=0 QA_FIRST_LIVE_WARMUP=1 QA_CPU_PROFILE=0 QA_TIMELINE_TRACE=1
node docs/qa/harness/728-room-native400/controller.mjs
