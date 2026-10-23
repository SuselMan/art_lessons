#!/bin/bash
set -euo pipefail
qa_task_root=/home/suselman/projects/pencil-agents/680-water-wet-tone
qa_task_own=/home/suselman/projects/pencil-agents/728-bounded-ui-optin
qa_task_runtime="$qa_task_own/temp/native-source-offline/runtime-room-23f5ebb8"
qa_task_out="$qa_task_own/temp/device-runs/room-actual-asyncpressure23"
cd "$qa_task_root"
export QA_SOURCE=23f5ebb842a0f424aba80bbbf9727d6fc70fa252
export QA_APP=https://tools.pecni.com CDP_BASE=http://127.0.0.1:9455
export QA_ENTRY_FILE=/home/suselman/.local/share/project-services/watercolor-qa/native-room-async-pressure23.url
export QA_RUNTIME="$qa_task_runtime" QA_MANIFEST="$qa_task_runtime-manifest.json" QA_PAPER_MANIFEST="$qa_task_runtime-paper-manifest.json" QA_ORIGIN_MANIFEST="$qa_task_runtime-origin-manifest.json"
export QA_OUT="$qa_task_out" QA_SCENARIO=water-pigment400 QA_CAPTURE_FIELDS=0 QA_CARRY_HARDWARE_PRESSURE=1 QA_RAW_CANVAS_WARMUP=0 QA_FIRST_LIVE_WARMUP=1 QA_CPU_PROFILE=0 QA_TIMELINE_TRACE=0 QA_PLANNER_ATTRIBUTION=0 QA_SELECTED_FRONT_FENCE=0 QA_NATIVE_INFLIGHT_LIMIT=0 QA_ASYNC_PRESSURE_PIPELINE=0 QA_ACTUAL_ASYNC_PRESSURE=1
node docs/qa/harness/728-room-native400/controller.mjs
