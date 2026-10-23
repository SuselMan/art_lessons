import pathlib,json,copy,subprocess
root=pathlib.Path('temp/wc-runs/overnight-next');out=root/'systematic-integer-flux-audit'
for power in [False,True]:
 name='production-physical22-common18-general-integer-'+('contact-power05-substeps-bound9' if power else 'substeps-bound9');d=json.loads((root/'general-integer-flux-audit'/(name+'.json')).read_text());shaderPatch=next(p for p in d['runtimePatches'] if p['kind']=='shader-exact' and 'float integerFraction' in p['after']);old=shaderPatch['after'];before=old[old.index('  void main()'):]
 after='''  uniform vec4 u_phase;
  float donorXi(vec2 donor) {
    vec2 world=floor((donor/u_texel-0.5+u_phase.xy)*u_phase.z);
    float state=mod(mod(world.x,251.0)*73.0+mod(world.y,251.0)*109.0+mod(u_phase.w,251.0)*137.0,251.0);
    return (state+0.5)/251.0;
  }
  vec4 systematicBin(vec2 donor,int chosen) {
    donor=snapUV(donor);
    if(min(min(donor.x,donor.y),min(1.0-donor.x,1.0-donor.y))<0.0)return vec4(0.0);
    vec4 q=floor(texture2D(u_paint,donor)*255.0+0.5), moving=vec4(0.0), selected=vec4(0.0);
    float cumulative=0.0,xi=donorXi(donor);
    for(int k=0;k<4;k++) {
      vec2 dir=axis(k), recipient=snapUV(donor+dir*u_step);
      float previous=cumulative;cumulative+=integerFraction(donor,recipient,dir);
      vec4 flux=floor(q*cumulative+xi)-floor(q*previous+xi);
      vec4 cap=floor((255.0-floor(texture2D(u_paint,recipient)*255.0+0.5))/4.0);
      if(min(min(recipient.x,recipient.y),min(1.0-recipient.x,1.0-recipient.y))<0.0)cap=vec4(0.0);
      flux=min(flux,cap); // floating cap boundary guard; theoretical exact clamp inactive
      moving+=flux;if(k==chosen)selected=flux;
    }
    return chosen==4?q-moving:selected;
  }
  void main() {
    vec2 center=snapUV(v_uv);vec4 result=systematicBin(center,4);
    for(int k=0;k<4;k++){vec2 dir=axis(k);result+=systematicBin(snapUV(center-dir*u_step),k);}
    gl_FragColor=result/255.0;
  }
'''
 d['runtimePatches'].append(dict(kind='shader-exact',selector='float integerFraction',before=before,after=after,countPerShader=1))
 # Snapshot same phase for both P/C queued draws.
 p=next(p for p in reversed(d['runtimePatches']) if p['kind']=='vite-module-exact' and 'brushDiagnosticOperations' in p['after']);b=p['after'];a=b.replace('let brushDiagnosticOperations = 0;','let brushDiagnosticOperations = 0; let constructionTick = 0;');a=a.replace('for (let sub = 0; sub < hop; sub++) ops.push(() => {','for (let sub = 0; sub < hop; sub++) ops.push(() => {\n                const phase = [x0 / S, -(y0 / S + field.h), S, constructionTick++];');assert a.count('rect, scissor, col.out);')==2;a=a.replace('rect, scissor, col.out);','rect, scissor, col.out, phase);');d['runtimePatches'].append(dict(kind='vite-module-exact',module=p['module'],before=b,after=a,countPerResponse=1))
 api=[('brushPass(field, flowTexture, radiusPx, S, source, out, pigment, flowRect, scissor, colorReference) {','brushPass(field, flowTexture, radiusPx, S, source, out, pigment, flowRect, scissor, colorReference, phase) {'),('\t\tgl.uniform2f(u.u_texel, 1 / pigment.width, 1 / pigment.height);','\t\tgl.uniform4fv(u.u_phase, phase);\n\t\tgl.uniform2f(u.u_texel, 1 / pigment.width, 1 / pigment.height);'),('\t\t\t"u_texel"\n\t\t]);','\t\t\t"u_texel",\n\t\t\t"u_phase"\n\t\t]);')]
 for b,a in api:d['runtimePatches'].append(dict(kind='vite-module-exact',module='/src/engine/src/raster/WatercolorPasses.ts',before=b,after=a,countPerResponse=1))
 d['id']='production-physical22-common18-systematic251-'+('power05' if power else 'regular')+'-substeps-review';d['comparisons']=['s9-n3'];d['observableOutcome']='Offline-only systematic byte allocation with world donor/tick phase, unchanged source; pad4 pending owner patch.';d['risks']=['Offline perprepare constructiontick, live/replay partition parity UNPROVEN','Finite251 phase ensemble bias≤1/251, not continuous unbiased individualimage','Float protective cap clamp must instrument actualactivation later','World-coordinate finitehash no nonce/time/network randomness','Mandatory matched pad4 parent still pending']
 for module,cache,name in [('/src/engine/src/raster/WatercolorSettlePlan.ts',root/'settle-leveling-audit/actual-5288-settle.js','settle'),('/src/engine/src/raster/WatercolorPasses.ts',root/'transport-distance-audit/compiled-WatercolorPasses.js','passes')]:
  text=cache.read_text()
  for p in d['runtimePatches']:
   if p['kind']=='vite-module-exact' and p['module']==module:assert text.count(p['before'])==p.get('countPerResponse',1),(module,p['before'][:60],text.count(p['before']));text=text.replace(p['before'],p['after'])
  f=out/(d['id']+'-'+name+'.mjs');f.write_text(text);subprocess.run(['node','--check',str(f)],check=True)
 (out/(d['id']+'.json')).write_text(json.dumps(d,indent=2)+'\n');print(d['id'],len(d['runtimePatches']))
