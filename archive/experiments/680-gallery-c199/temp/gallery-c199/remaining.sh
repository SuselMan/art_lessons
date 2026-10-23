#!/usr/bin/env bash
set -eu
cd /home/suselman/projects/pencil-agents/680-gallery-c199
export DISPLAY=:0 GALLERY_GPU_SLOT=granted GALLERY_NATIVE_BATCH=1
export GALLERY_NODE_REQUIRE=/home/suselman/projects/pencil-agents/680-concentration-diffusion/package.json
export APP_URL=https://localhost:5301 APP_WAIT=1000 APP_DRY_WAIT=1000
/home/suselman/.nvm/versions/node/v22.20.0/bin/node temp/gallery-c199/render.mjs temp/gallery-c199/ops_USvHhyi8.json temp/gallery-c199/sheet3-c1997fee.png > temp/gallery-c199/sheet3-c1997fee.log 2>&1
/home/suselman/.nvm/versions/node/v22.20.0/bin/node temp/gallery-c199/render.mjs temp/gallery-c199/ops_5Jc_TU2S.json temp/gallery-c199/sheet4-c1997fee.png > temp/gallery-c199/sheet4-c1997fee.log 2>&1
/home/suselman/.nvm/versions/node/v22.20.0/bin/node temp/gallery-c199/render.mjs temp/gallery-c199/ops_uuLV3qiU.json temp/gallery-c199/sheet5-c1997fee.png > temp/gallery-c199/sheet5-c1997fee.log 2>&1
/home/suselman/.nvm/versions/node/v22.20.0/bin/node temp/gallery-c199/render.mjs temp/gallery-c199/ops_hnRdNfoZ.json temp/gallery-c199/sheet7-c1997fee.png > temp/gallery-c199/sheet7-c1997fee.log 2>&1
/home/suselman/.nvm/versions/node/v22.20.0/bin/node temp/gallery-c199/render.mjs temp/gallery-c199/ops_91gFLNh2.json temp/gallery-c199/sheet8-c1997fee.png > temp/gallery-c199/sheet8-c1997fee.log 2>&1
/home/suselman/.nvm/versions/node/v22.20.0/bin/node temp/gallery-c199/render.mjs temp/gallery-c199/ops_Trf00NSq.json temp/gallery-c199/sheet9-c1997fee.png > temp/gallery-c199/sheet9-c1997fee.log 2>&1
/home/suselman/.nvm/versions/node/v22.20.0/bin/node temp/gallery-c199/render.mjs temp/gallery-c199/ops_ush1q8hI.json temp/gallery-c199/sheet10-c1997fee.png > temp/gallery-c199/sheet10-c1997fee.log 2>&1
