import{spawnSync}from'node:child_process';
for(const script of ['watercolorParity','charcoalParity','markerRibbonParity','parkedWashParity']){const r=spawnSync(process.execPath,['apps/web/scripts/devices/'+script+'.mjs','laptop=uqqucb','surface=5sdfa7','ipad=quyopf'],{stdio:'inherit',env:process.env});if(r.status!==0)process.exit(r.status||1);}
