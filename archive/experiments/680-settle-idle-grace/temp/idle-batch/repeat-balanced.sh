#!/usr/bin/env bash
set -euo pipefail
if [[ "${PERF_GPU_SLOT:-}" != granted ]]; then
  echo 'Explicit parent GPU grant required' >&2
  exit 64
fi
: "${APP_URL:?Frozen7322 runtime required}"
export PERF_SOURCE_MANIFEST=temp/idle-batch/source-manifest.json
export PERF_EXPECTED_SHA=7322
export PERF_SCENARIOS=densezigzag,burst
export PERF_SIZE=80
if [[ -e temp/idle-batch/repeat-7322 ]]; then
  echo 'Balanced artifact directory already exists; preserve it' >&2
  exit 65
fi
for label in pair1-on pair1-off pair2-off pair2-on; do
  case "$label" in *-on) export PERF_IDLE_BATCH=1;; *) export PERF_IDLE_BATCH=0;; esac
  "${PERF_NODE_BINARY:-node}" temp/idle-batch/native-perf/run.mjs "temp/idle-batch/repeat-7322/$label"
done
