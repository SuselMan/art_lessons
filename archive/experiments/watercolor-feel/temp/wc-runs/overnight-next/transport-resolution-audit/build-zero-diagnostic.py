import pathlib,json,hashlib
p=pathlib.Path('temp/wc-runs/overnight-next');d=p/'transport-resolution-audit'
b=json.loads((p/'transport-distance-audit/production-max-paired-headroom2-microcoupled-curvature10.json').read_text());js=(p/'settle-leveling-audit/actual-5288-settle.js').read_text()
a=js.index('for (const contact of contacts) ops.push(() => {');z=js.index('\n\t\t// (§17.42)',a);before=js[a:z]
x={k:v for k,v in b.items() if k in ('parent','baseEngine','comparisons')}
x['id']='production-physical22-brush-zero-diagnostic'
x['runtimePatches']=b['runtimePatches']+[{'kind':'vite-module-exact','module':'/src/engine/src/raster/WatercolorSettlePlan.ts','before':before,'after':'/* Diagnostic: omit ONLY post-source brush contact sweep. Source/fine/carry/tide unchanged. */','countPerResponse':1}]
x['mechanism']='Physical22 diagnostic ablation: omit queued post-source brush transport sweep while retaining source, wet merge, carry, fine diffusion and final tide.'
x['proof']='Exact one contact-loop anchor from actual home5288 module; no source/operation edits, no added buffers. Expected brush draw count zero.'
x['risks']=['Diagnostic only: eliminating brush interaction may preserve unwanted circles and harms physical mixing.','No claim of improved watercolour or production suitability.','Mixed colours keep prior paired diffusion schedule; only brush contacts omitted.']
(d/(x['id']+'.json')).write_text(json.dumps(x,indent=2)+'\n')
(d/'zero-diagnostic-patched.mjs').write_text(js[:a]+x['runtimePatches'][-1]['after']+js[z:])
print(x['id'],js.count(before),hashlib.sha256(before.encode()).hexdigest())
