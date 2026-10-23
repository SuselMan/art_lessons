import pathlib,json,subprocess
root=pathlib.Path('temp/wc-runs/overnight-next');out=root/'depth-quantization-audit';spec=json.loads((root/'transport-distance-audit/production-max-paired-headroom2-microcoupled-curvature10.json').read_text());src=pathlib.Path('apps/web/src/engine/src/raster/shaders.ts').read_text();before='''      float dome = texture2D(u_d, v_uv).a;
      float share = max(a.a / max(a.a + b.a, 5e-5), u_origin.x * dome);
      vec4 add = u_k * share * dome * b;
      float room = max(1.0 - max(max(a.r, a.g), max(a.b, a.a)), 0.0);
      float peak = max(max(add.r, add.g), max(add.b, add.a));
      gl_FragColor = a + add * min(1.0, room / max(peak, 5e-5));'''
after='''      float dome = texture2D(u_d, v_uv).a;
      if (u_origin.y > 0.5) {
        vec4 physicalMobile=texture2D(u_c,v_uv), physicalFixed=texture2D(u_e,v_uv);
        float physicalShare=max(physicalMobile.a/max(physicalMobile.a+physicalFixed.a,5e-5),u_origin.x*dome);
        vec4 physicalAdd=u_k*physicalShare*dome*physicalFixed;
        float physicalRoom=max(1.0-max(max(physicalMobile.r,physicalMobile.g),max(physicalMobile.b,physicalMobile.a)),0.0);
        float physicalPeak=max(max(physicalAdd.r,physicalAdd.g),max(physicalAdd.b,physicalAdd.a));
        gl_FragColor=a+(u_k*physicalShare*dome*b)*min(1.0,physicalRoom/max(physicalPeak,5e-5));
        return;
      }
'''+before
spec['runtimePatches'] += [dict(kind='shader-exact',selector='float dome = texture2D(u_d, v_uv).a;',before='  uniform sampler2D u_d;',after='  uniform sampler2D u_d;\n  uniform sampler2D u_e;',countPerShader=1),dict(kind='shader-exact',selector='float dome = texture2D(u_d, v_uv).a;',before=before,after=after,countPerShader=1)]
settle=(root/'settle-leveling-audit/actual-5288-settle.js').read_text();start=settle.index('\t\t\tif (first && merge > 0) ops.push(() => {\n\t\t\t\tthis.ctx.passes().fieldOp(a, c, b, 18');end=settle.index('\n\t\t\t// (§17.40)',start);b=settle[start:end]
physical=b[b.index('\t\t\t\tthis.ctx.passes().fieldOp(a, c, b, 18'):b.index('\t\t\t\tif (colour)')];color=b[b.index('\t\t\t\tif (colour)'):b.rindex('\n\t\t\t});')];color=color.replace('origin: [remobFloor, 0]','c: c,\n\t\t\t\t\t\te: b,\n\t\t\t\t\t\torigin: [remobFloor, 1]');a='\t\t\tif (first && merge > 0) ops.push(() => {\n'+color+'\n'+physical+'\t\t\t});'
spec['runtimePatches'].append(dict(kind='vite-module-exact',module='/src/engine/src/raster/WatercolorSettlePlan.ts',before=b,after=a,countPerResponse=1))
mod=(root/'transport-distance-audit/compiled-WatercolorPasses.js').read_text();b1='\t\tgl.uniform1i(u.u_d, 3);';a1=b1+'\n\t\tif (mode === 18 && opts.e) { gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, opts.e.texture); gl.uniform1i(u.u_e, 4); }';b2=mod[mod.index('\t\tthis._fieldOpHighUni ='):mod.index('\t\tthis._fieldOpCarryUni =')];a2=b2.replace('"u_d",','"u_d",\n\t\t\t"u_e",')
for b,a in [(b1,a1),(b2,a2)]:assert mod.count(b)==1;mod=mod.replace(b,a);spec['runtimePatches'].append(dict(kind='vite-module-exact',module='/src/engine/src/raster/WatercolorPasses.ts',before=b,after=a,countPerResponse=1))
for p in spec['runtimePatches']:
 if p['kind']=='vite-module-exact' and p['module']=='/src/engine/src/raster/WatercolorSettlePlan.ts':assert settle.count(p['before'])==p.get('countPerResponse',1);settle=settle.replace(p['before'],p['after'])
for name,text in [('common18-actual-settle.mjs',settle),('common18-actual-passes.mjs',mod)]:
 (out/name).write_text(text);subprocess.run(['node','--check',str(out/name)],check=True)
spec.update(id='production-physical22-remob18-common-physical-coefficient',comparisons=['s7-n3','s9-n3'],observableOutcome='Color18 uses exact physical pre-remob transfer coefficient; color copied first, P mode18 original expressions unchanged.',risks=['Modes13/8 unchanged; no guarantee all later pairing failures fixed','New high shader sampler/branch requires real salted compiler validation; Adreno untested','Physical exact output identity must be measured','No alpha authority overwrite or byte cone reconciliation'])
(out/(spec['id']+'.json')).write_text(json.dumps(spec,indent=2)+'\n');print(len(spec['runtimePatches']))
