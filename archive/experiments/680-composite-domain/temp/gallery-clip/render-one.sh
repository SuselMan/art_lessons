#!/usr/bin/env bash
set -euo pipefail
cd /home/suselman/projects/pencil-agents/680-composite-domain
: "${GALLERY_GPU_SLOT:?Explicit root GPU grant required}"
sheet="${1:?one sheet id required}"
case "$sheet" in
 1) room='GmfTsw9Y' ;;
 2) room='DUjBDqFk' ;;
 3) room='USvHhyi8' ;;
 4) room='5Jc_TU2S' ;;
 5) room='uuLV3qiU' ;;
 6) room='ejYs3bTr' ;;
 7) room='hnRdNfoZ' ;;
 8) room='91gFLNh2' ;;
 9) room='Trf00NSq' ;;
 10) room='ush1q8hI' ;;
 *) exit 2 ;;
esac
env DISPLAY=:0 GALLERY_NATIVE_BATCH=1 APP_URL=https://localhost:5318 /home/suselman/.nvm/versions/node/v22.20.0/bin/node temp/gallery-clip/render.mjs "temp/gallery-clip/ops_${room}.json" "temp/gallery-clip/sheet${sheet}-1e49aa99.png" > "temp/gallery-clip/sheet${sheet}.log" 2>&1
