export const sourceABrowserPaths=['stamp.ts','deposit.ts','render.ts','roomTileBridge.ts','brush.ts','passes/fieldOps.ts','exactPipelinePreparation.ts','sourcePipelinePreparation.ts','seedBridgeCost.ts'].map(p=>'apps/web/src/engine/src/webgpuCanonical/'+p)
export function assertSourceABrowserPassport(rows,expected){
 if(rows?.length!==sourceABrowserPaths.length||new Set(rows.map(r=>r.path)).size!==sourceABrowserPaths.length||sourceABrowserPaths.some(path=>! /^[a-f0-9]{64}$/.test(rows.find(r=>r.path===path)?.sha256??'')||rows.find(r=>r.path===path)?.sha256!==expected?.find(r=>r.path===path)?.sha256))throw Error('Source A actual browser factory passport differs')
 return rows
}
