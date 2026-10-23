import pathlib,json,copy,subprocess
root=pathlib.Path('temp/wc-runs/overnight-next');out=root/'general-integer-flux-audit';base=json.loads((root/'depth-quantization-audit/production-physical22-remob18-common-physical-coefficient-v2.json').read_text());old=json.loads((root/'recipient-capacity-audit/production-physical22-recipient-normalized-60.json').read_text())['runtimePatches'][-1];before=old['before'];raw=old['after'].split('  float recipientLambda',1)[0]
raw=raw.replace('  float rawFraction(vec2 from, vec2 to, vec2 direction) {','''  uniform sampler2D u_color;
  uniform vec2 u_texel;
  vec2 snapUV(vec2 uv){return (floor(uv/u_texel)+0.5)*u_texel;}
  float rawFraction(vec2 from, vec2 to, vec2 direction) {
    from=snapUV(from);to=snapUV(to);''')
after=raw+'''
  float channelLimit(float q, float cap, float raw) {
    if(q<0.5 || raw<=0.0)return 1.0;
    return min(1.0,cap/(q*raw));
  }
  float integerFraction(vec2 from,vec2 to,vec2 direction) {
    from=snapUV(from);to=snapUV(to);
    float raw=rawFraction(from,to,direction);if(raw<=0.0)return 0.0;
    vec4 P=floor(texture2D(u_pigment,from)*255.0+0.5), C=floor(texture2D(u_color,from)*255.0+0.5);
    vec4 roomP=floor((255.0-floor(texture2D(u_pigment,to)*255.0+0.5))/4.0);
    vec4 roomC=floor((255.0-floor(texture2D(u_color,to)*255.0+0.5))/4.0);
    float limit=1.0;
    limit=min(limit,channelLimit(P.r,roomP.r,raw));limit=min(limit,channelLimit(P.g,roomP.g,raw));
    limit=min(limit,channelLimit(P.b,roomP.b,raw));limit=min(limit,channelLimit(P.a,roomP.a,raw));
    limit=min(limit,channelLimit(C.r,roomC.r,raw));limit=min(limit,channelLimit(C.g,roomC.g,raw));
    limit=min(limit,channelLimit(C.b,roomC.b,raw));limit=min(limit,channelLimit(C.a,roomC.a,raw));
    return raw*limit;
  }
  void main() {
    vec2 center=snapUV(v_uv);
    vec4 own=floor(texture2D(u_paint,center)*255.0+0.5), result=own;
    for(int k=0;k<4;k++) {
      vec2 dir=axis(k), neighbour=snapUV(center+dir*u_step);
      result-=floor(own*integerFraction(center,neighbour,dir));
      result+=floor(floor(texture2D(u_paint,neighbour)*255.0+0.5)*integerFraction(neighbour,center,-dir));
    }
    gl_FragColor=result/255.0;
  }
'''
base['runtimePatches'].append(dict(kind='shader-exact',selector=old['selector'],before=before,after=after,countPerShader=1))
mod=(root/'transport-distance-audit/compiled-WatercolorPasses.js').read_text()
patches=[('brushPass(field, flowTexture, radiusPx, S, source, out, pigment, flowRect, scissor) {','brushPass(field, flowTexture, radiusPx, S, source, out, pigment, flowRect, scissor, colorReference) {'),('\t\tgl.uniform4fv(u.u_flowRect, flowRect);','\t\tgl.uniform2f(u.u_texel, 1 / pigment.width, 1 / pigment.height);\n\t\tgl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, colorReference.texture); gl.uniform1i(u.u_color, 4);\n\t\tgl.activeTexture(gl.TEXTURE0);\n\t\tgl.uniform4fv(u.u_flowRect, flowRect);')]
b=mod[mod.index('\t\tthis._brushDragUni ='):mod.index('\t\tthis._brushDragPosLoc =')];patches.append((b,b.replace('"u_flowRect"','"u_flowRect",\n\t\t\t"u_color",\n\t\t\t"u_texel"')))
for b,a in patches:base['runtimePatches'].append(dict(kind='vite-module-exact',module='/src/engine/src/raster/WatercolorPasses.ts',before=b,after=a,countPerResponse=1))
sub=json.loads((root/'transport-resolution-audit/production-physical22-brush-resolution-substeps-bound9-budget4096.json').read_text())['runtimePatches'][-1]
for split in [False,True]:
 d=copy.deepcopy(base);p=copy.deepcopy(sub);p['after']=p['after'] if split else p['before'].replace('contact.radius, S,','4 * S, S,');assert p['after'].count('rect, scissor);')==2;p['after']=p['after'].replace('rect, scissor);','rect, scissor, col.out);');d['runtimePatches'].append(p)
 d.update(id='production-physical22-common18-general-integer-'+('substeps-bound9' if split else 'onepixel-control'),comparisons=['s7-n3','s9-n3'],observableOutcome='All8-channel common edge capacity with conservative integer floor flux; unchanged paired MAX source and common18 numerical correction.',risks=['Subcode flux locks; no cone projection or alpha overwrite','Exact GPU mass requires matched endpoint evaluation and floor stability','Mixed7 inputalpha equality must be measured aftercommon18','Common local lambda may stop saturated channels but is not a global freeze','Adreno untested'])
 for module,cache,name in [('/src/engine/src/raster/WatercolorSettlePlan.ts',root/'settle-leveling-audit/actual-5288-settle.js','settle'),('/src/engine/src/raster/WatercolorPasses.ts',root/'transport-distance-audit/compiled-WatercolorPasses.js','passes')]:
  text=cache.read_text()
  for x in d['runtimePatches']:
   if x['kind']=='vite-module-exact' and x['module']==module:assert text.count(x['before'])==x.get('countPerResponse',1);text=text.replace(x['before'],x['after'])
  f=out/(d['id']+'-'+name+'.mjs');f.write_text(text);subprocess.run(['node','--check',str(f)],check=True)
 (out/(d['id']+'.json')).write_text(json.dumps(d,indent=2)+'\n');print(d['id'],len(d['runtimePatches']))
