import pathlib,json,copy,numpy as np
r=pathlib.Path('temp/wc-runs/overnight-next');o=r/'contact-vorticity-audit';base=json.loads((r/'general-integer-flux-audit/production-physical22-common18-general-integer-substeps-bound9.json').read_text());pad=json.loads((r/'flow-border-audit/production-common18-general-int-power05-flow-pad4.json').read_text())['runtimePatches'][-1];base['runtimePatches'].append(pad);b='    vec2 velocity = flow.rg * 2.0 - 1.0;'
for gain,label in [(0.,'control'),(.7853981633974483,'turn')]:
 d=copy.deepcopy(base);a=b+f'''
    velocity/=max(1.0,length(velocity));
    vec3 east=flowAt(from+vec2(u_step.x,0.0)),west=flowAt(from-vec2(u_step.x,0.0));
    vec3 north=flowAt(from+vec2(0.0,u_step.y)),south=flowAt(from-vec2(0.0,u_step.y));
    float interior=step(0.01,min(min(east.b,west.b),min(north.b,south.b)));
    float radiusCells=0.5*min(u_flowRect.z/max(u_step.x,1e-6),u_flowRect.w/max(u_step.y,1e-6));
    float omega=clamp((east.g-west.g-north.r+south.r)*radiusCells,-1.0,1.0);
    vec2 pressureGradient=0.5*vec2(east.b-west.b,north.b-south.b)*radiusCells;
    float theta={str(gain)}*omega*min(1.0,length(pressureGradient))*interior;
    float ca=cos(theta),sa=sin(theta);
    velocity=vec2(ca*velocity.x-sa*velocity.y,sa*velocity.x+ca*velocity.y);
'''
 d['runtimePatches'].append(dict(kind='shader-exact',selector='float integerFraction',before=b,after=a,countPerShader=1));d.update(id='production-common18-general-int-regular-pad4-curltwist-'+label,comparisons=['s9-n3'],observableOutcome='Matched renormalized conditional flow plus bounded signed contactcurl rotation; source unchanged, regular general integer pad4 parent.',risks=['Phenomenologicalcontactcurl, no physicalvorticity proof','NormalizedRGconfidence preserved below1; tiny byteoverunit renormalized inBOTHcontrol/turn','All4flowneighbourBcut preventsdrypadding derivatives, doesnotprove physicalstandingwater','RadiusCells proxy fromcontactbbox/hop; resolution derivative controlled onlyonepixel scope','Four extra flowfetches/rawedge, actualAdreno untested'])
 s=pathlib.Path('apps/web/src/engine/src/raster/shaders.ts').read_text().split('export const WC_BRUSH_DRAG_FRAG = `',1)[1].split('`;',1)[0]
 for p in d['runtimePatches']:
  if p['kind']=='shader-exact' and p['selector'] in s:assert s.count(p['before'])==p.get('countPerShader',1);s=s.replace(p['before'],p['after'])
 (o/(d['id']+'.json')).write_text(json.dumps(d,indent=2)+'\n')
print('2matched34patches shaderguardsPASS')
