import pathlib,json,copy,hashlib,subprocess
root=pathlib.Path('temp/wc-runs/overnight-next');out=root/'integer-paired-allocation';old=out/'production-physical22-brush-integer-fivebins-fixedties.json';spec=json.loads(old.read_text());spec['id']='production-physical22-brush-integer-fivebins-fixedties-snap';spec['originalSpecSHA256']=hashlib.sha256(old.read_bytes()).hexdigest();spec['observableOutcome']='Same integer allocation with donor/recipient UV snapped to density texel centers; tests edge evaluation numerical mismatch, no new allocation law.'
shader=next(p for p in spec['runtimePatches'] if p['kind']=='shader-exact' and 'integerBins' in p['after'])['after']
snapped=shader.replace('  float rawFraction(vec2 from, vec2 to, vec2 direction) {','''  uniform vec2 u_texel;
  vec2 snapUV(vec2 uv) { return (floor(uv / u_texel) + 0.5) * u_texel; }
  float rawFraction(vec2 from, vec2 to, vec2 direction) {
    from=snapUV(from);to=snapUV(to);''').replace('  vec4 integerBins(vec2 donor, int chosen) {','  vec4 integerBins(vec2 donor, int chosen) {\n    donor=snapUV(donor);')
assert snapped!=shader
spec['runtimePatches'].append(dict(kind='shader-exact',selector='uniform sampler2D u_paint, u_flow, u_water, u_pigment;',before=shader,after=snapped,countPerShader=1))
mod=(out/'actual-module-patched.mjs').read_text();patches=[('\t\tgl.uniform1f(u.u_kind, source === pigment ? 0 : 1);','\t\tgl.uniform2f(u.u_texel, 1 / pigment.width, 1 / pigment.height);\n\t\tgl.uniform1f(u.u_kind, source === pigment ? 0 : 1);'),('\t\t\t"u_kind"\n\t\t]);','\t\t\t"u_kind",\n\t\t\t"u_texel"\n\t\t]);')]
for before,after in patches:
 assert mod.count(before)==1;mod=mod.replace(before,after);spec['runtimePatches'].append(dict(kind='vite-module-exact',module='/src/engine/src/raster/WatercolorPasses.ts',before=before,after=after,countPerResponse=1))
(out/'snap-actual-module-patched.mjs').write_text(mod);subprocess.run(['node','--check',str(out/'snap-actual-module-patched.mjs')],check=True);(out/(spec['id']+'.json')).write_text(json.dumps(spec,indent=2)+'\n')
print(len(spec['runtimePatches']))
