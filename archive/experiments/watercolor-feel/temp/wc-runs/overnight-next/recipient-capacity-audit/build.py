import json,pathlib,copy,re
root=pathlib.Path('temp/wc-runs/overnight-next');out=root/'recipient-capacity-audit';base=json.loads((root/'transport-distance-audit/production-max-paired-headroom2-microcoupled-curvature10.json').read_text());src=pathlib.Path('apps/web/src/engine/src/raster/shaders.ts').read_text();shader=src.split('export const WC_BRUSH_DRAG_FRAG = `',1)[1].split('`;',1)[0]
for p in base['runtimePatches']:
 if p['kind']=='shader-exact' and p['selector'] in shader:
  assert shader.count(p['before'])==p.get('countPerShader',1);shader=shader.replace(p['before'],p['after'])
before=shader[shader.index('  float flux('):]
for adv,mix,normalized in [(.6,.02,True),(.68,.005,True),(.68,.005,False)]:
 ident=f'production-physical22-recipient-{("normalized" if normalized else "quarter")}-{int(adv*100):02d}'
 body=before.replace('float flux(', 'float rawFraction(').replace('0.6 * max(dot',f'{adv} * max(dot').replace('0.02 * max(donor',f'{mix} * max(donor')
 body=re.sub(r'    float room = max\(0.0, 1.0 - texture2D\(u_pigment, to\).a\);\n    return min\(amount, room / max\(4.0 \* donor, 5e-5\)\);', '    return amount;',body)
 assert 'return amount;' in body
 body=body[:body.index('  void main()')]
 if normalized:
  body+='''  float recipientLambda(vec2 to) {
    float total = 0.0;
    for (int k=0; k<4; k++) {
      vec2 direction = axis(k), from = to - direction * u_step;
      total += texture2D(u_pigment, from).a * rawFraction(from, to, direction);
    }
    return min(1.0, max(0.0, 1.0 - texture2D(u_pigment, to).a) / max(total, 5e-5));
  }
  void main() {
    vec4 own = texture2D(u_paint, v_uv), result = own;
    float lambdaOwn = recipientLambda(v_uv);
    for (int k=0; k<4; k++) {
      vec2 dir = axis(k), neighbour = v_uv + dir * u_step;
      result -= own * rawFraction(v_uv, neighbour, dir) * recipientLambda(neighbour);
      result += texture2D(u_paint, neighbour) * rawFraction(neighbour, v_uv, -dir) * lambdaOwn;
    }
    gl_FragColor = max(result, vec4(0.0));
  }
'''
 else:
  body+='''  float flux(vec2 from, vec2 to, vec2 direction) {
    float donor = texture2D(u_pigment, from).a;
    return min(rawFraction(from,to,direction), max(0.0,1.0-texture2D(u_pigment,to).a)/max(4.0*donor,5e-5));
  }
'''+before[before.index('  void main()'):]
 spec=copy.deepcopy(base);spec.update(id=ident,observableOutcome='Recipient capacity allocation diagnostic with retained paired MAX source, original geometry, physical headroom2 and curvature yield.',risks=['RGBA8 mass and cone errors remain; no integer conservation claim','Additional static donor evaluations; Adreno untested','Curvature supplies pigment; not closed brush mass conservation']);spec['runtimePatches'].append({'kind':'shader-exact','selector':'uniform sampler2D u_paint, u_flow, u_water, u_pigment;','before':before,'after':body,'countPerShader':1});(out/(ident+'.json')).write_text(json.dumps(spec,indent=2)+'\n')
 assert shader.count(before)==1
 print(ident,len(spec['runtimePatches']))
