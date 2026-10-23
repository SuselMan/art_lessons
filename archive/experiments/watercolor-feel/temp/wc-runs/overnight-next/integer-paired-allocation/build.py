import pathlib,json,copy,subprocess
root=pathlib.Path('temp/wc-runs/overnight-next');out=root/'integer-paired-allocation';base=json.loads((root/'recipient-capacity-audit/production-physical22-recipient-normalized-60.json').read_text());last=base['runtimePatches'].pop();before=last['before'];raw=last['after'].split('  float recipientLambda',1)[0];helper=(out/'allocation-prototype.glsl').read_text();helper=helper[:helper.index('// Per donor,')].replace('u_integerColorMode','u_kind')
body=raw+helper+'''
  bool inside(vec2 uv) { return min(min(uv.x,uv.y),min(1.0-uv.x,1.0-uv.y))>=0.0; }
  vec4 integerBins(vec2 donor, int chosen) {
    if(!inside(donor))return vec4(0.0);
    vec4 P=floor(texture2D(u_pigment,donor)*255.0+0.5);
    vec4 Q=floor(texture2D(u_paint,donor)*255.0+0.5);
    vec4 moving=vec4(0.0);
    for(int k=0;k<4;k++) {
      vec2 dir=axis(k), recipient=donor+dir*u_step;
      float room=inside(recipient)?255.0-floor(texture2D(u_pigment,recipient).a*255.0+0.5):0.0;
      float v=min(floor(P.a*rawFraction(donor,recipient,dir)),floor(max(room,0.0)/4.0));
      if(k==0)moving.x=v;else if(k==1)moving.y=v;else if(k==2)moving.z=v;else moving.w=v;
    }
    float stay=P.a-dot(moving,vec4(1.0));
    // Stable tie order initially; spatial rotation not enabled until world anchoring available.
    int rotate=0;
    vec4 pigmentMoving=vec4(allocateBin(P.b,moving,stay,0,rotate),allocateBin(P.b,moving,stay,1,rotate),allocateBin(P.b,moving,stay,2,rotate),allocateBin(P.b,moving,stay,3,rotate));
    float pigmentStay=allocateBin(P.b,moving,stay,4,rotate);
    float pigment=binComponent(pigmentMoving,pigmentStay,chosen);
    if(u_kind<0.5)return vec4(allocateBin(P.r,moving,stay,chosen,rotate),allocateBin(P.g,moving,stay,chosen,rotate),pigment,binComponent(moving,stay,chosen))/255.0;
    return vec4(allocateBin(Q.r,pigmentMoving,pigmentStay,chosen,rotate),allocateBin(Q.g,pigmentMoving,pigmentStay,chosen,rotate),allocateBin(Q.b,pigmentMoving,pigmentStay,chosen,rotate),pigment)/255.0;
  }
  void main() {
    vec4 result=integerBins(v_uv,4);
    for(int k=0;k<4;k++) {
      vec2 direction=axis(k);
      result+=integerBins(v_uv-direction*u_step,k);
    }
    gl_FragColor=result;
  }
'''
base.update(id='production-physical22-brush-integer-fivebins-fixedties',observableOutcome='Integer paired bin allocation diagnostic, single-paint9 only; unchanged MAX source/geometry/physical22 fields.',risks=['Fixed outgoing-first tie directional bias; no spatial rotation implemented','Input byte cones mandatory; no mixed7 reconciliation','Flux locks below one carrier code','High shader cost and Adreno untested'])
base['runtimePatches'].append(dict(kind='shader-exact',selector=last['selector'],before=before,after=body,countPerShader=1))
mod=(root/'transport-distance-audit/compiled-WatercolorPasses.js').read_text()
patches=[('\t\tgl.uniform4fv(u.u_flowRect, flowRect);','\t\tgl.uniform1f(u.u_kind, source === pigment ? 0 : 1);\n\t\tgl.uniform4fv(u.u_flowRect, flowRect);'),('\t\t\t"u_flowRect"\n\t\t]);','\t\t\t"u_flowRect",\n\t\t\t"u_kind"\n\t\t]);')]
for b,a in patches:
 assert mod.count(b)==1;mod=mod.replace(b,a);base['runtimePatches'].append(dict(kind='vite-module-exact',module='/src/engine/src/raster/WatercolorPasses.ts',before=b,after=a,countPerResponse=1))
(out/'actual-module-patched.mjs').write_text(mod);subprocess.run(['node','--check',str(out/'actual-module-patched.mjs')],check=True)
(out/(base['id']+'.json')).write_text(json.dumps(base,indent=2)+'\n');(out/'full-prototype.glsl').write_text(body)
print(len(base['runtimePatches']))
