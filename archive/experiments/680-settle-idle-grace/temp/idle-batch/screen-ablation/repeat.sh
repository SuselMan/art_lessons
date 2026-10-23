#!/usr/bin/env bash
set -euo pipefail
: "${PERF_GPU_SLOT:?Root grant required}"
base="$1"
for case_mode in pair1-off:0 pair1-on:1 pair2-on:1 pair2-off:0; do
 name="${case_mode%:*}"; mode="${case_mode#*:}"
 test ! -e "$base/$name"
 PERF_SCENARIOS=burst PERF_SCREEN_NOOP="$mode" PERF_IDLE_BATCH=0 PERF_CDP_TRACE=0 PERF_GL_CALL_TRACE=0 node temp/idle-batch/screen-ablation/run.mjs "$base/$name"
done
