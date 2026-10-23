import pathlib,json
p=pathlib.Path(__file__).parent
base={'parent':'baseline','baseEngine':'7ca4cf5d','comparisons':['s6-n6','s9-n3','s8-n1'],'limits':['Post-source brush operator; no chronological source recovery.','CoverageA gate is geometric support, not physical drypaint gate.','RGBA8 quantization prevents exact integer globalmass conservation.']}
hop=dict(base,id='production-brush-long-hop-support',mechanism='Tripled conservative world hop with extra quarter-edge support samples, unchanged donor fractions/CFL. Longer diffusion variance is a deliberate confound.',runtimePatches=[{'kind':'vite-module-exact','module':'/src/engine/src/raster/WatercolorPasses.ts','before':'const step = Math.max(1, Math.round(radiusPx * 0.25 / S))','after':'const step = Math.max(1, Math.round(radiusPx * 0.75 / S))','countPerResponse':1},{'kind':'shader-exact','selector':'float flux(vec2 from, vec2 to, vec2 direction)','before':'contact *= step(0.015, texture2D(u_water, (from + to) * 0.5).a);','after':'contact *= step(0.015, texture2D(u_water, (from + to) * 0.5).a);\n    contact *= step(0.015, texture2D(u_water, mix(from, to, 0.25)).a);\n    contact *= step(0.015, texture2D(u_water, mix(from, to, 0.75)).a);','countPerShader':1}])
before='''    group.push(d); distance += Math.hypot(d.dx, d.dy)
    if (distance >= Math.max(1, d.radius * 1.5)) flush()'''
after='''    const motionLength = Math.hypot(d.dx, d.dy)
    let groupDx = 0, groupDy = 0
    for (const previous of group) { groupDx += previous.dx; groupDy += previous.dy }
    const groupLength = Math.hypot(groupDx, groupDy)
    if (groupLength > 0.01 && (groupDx * d.dx + groupDy * d.dy) < -0.25 * groupLength * motionLength) flush()
    group.push(d); distance += motionLength
    if (distance >= Math.max(1, d.radius * 1.5)) flush()'''
rev=dict(base,id='production-brush-reversal-flush',mechanism='Flush contact before a motion opposes cumulative group direction, preventing averaging return strokes; diagnostic resampling-dependent threshold.',runtimePatches=[{'kind':'vite-module-exact','module':'/src/engine/src/watercolor/brushDrag.ts','before':before,'after':after,'countPerResponse':1}])
for x in [hop,rev]:
 for q in x['runtimePatches']:
  f=pathlib.Path('apps/web'+q['module'].replace('/src','/src',1)) if q['kind']=='vite-module-exact' else pathlib.Path('apps/web/src/engine/src/raster/shaders.ts')
  assert f.read_text().count(q['before'])==1,(f,q)
 (p/(x['id']+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
print('Both exact spec guards PASS')
