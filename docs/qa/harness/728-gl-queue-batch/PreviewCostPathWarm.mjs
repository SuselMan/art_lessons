/** Opt-in, before-input only. Own masks will be fully rewritten at each later carry tick. */
export function warmPreviewCostPath(gl,passes,pressurePool,pathPool){
 if(gl.isContextLost()||pressurePool.active.size||pathPool.active.size)throw Error('Warm requires live preinput idle ownership');
 const masks=pathPool.available[0],pressure=pressurePool.available[0]?.pressure0;
 if(!masks||!pressure||new Set([...masks,pressure].map(f=>f.texture)).size!==3)throw Error('Warm own distinct fields');
 const start=performance.now();passes.costDomainStep(masks[0],pressure,[0,0,128,128],0,0);passes.costDomainStep(masks[1],masks[0],[0,0,128,128],0,1);
 if(gl.isContextLost())throw Error('Lost during preinput warm');gl.finish();return{cpuWallMs:performance.now()-start,draws:2,knownIdle:!gl.isContextLost()};
}
