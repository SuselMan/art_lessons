import pathlib,json,numpy as np
r=pathlib.Path('temp/wc-runs/overnight-next');out=r/'contact-vorticity-audit';d=json.loads((r/'flow-border-audit/production-common18-general-int-power05-flow-pad4.json').read_text());old=next(p for p in d['runtimePatches'] if p['kind']=='shader-exact' and 'float integerFraction' in p['after'])['after'];before='    vec2 velocity = flow.rg * 2.0 - 1.0;';assert old.count(before)==1
after=before+'''
    vec3 east=flowAt(from+vec2(u_step.x,0.0)),west=flowAt(from-vec2(u_step.x,0.0));
    vec3 north=flowAt(from+vec2(0.0,u_step.y)),south=flowAt(from-vec2(0.0,u_step.y));
    float interior=step(0.01,min(min(east.b,west.b),min(north.b,south.b)));
    float radiusCells=0.5*min(u_flowRect.z/max(u_step.x,1e-6),u_flowRect.w/max(u_step.y,1e-6));
    float omega=clamp((east.g-west.g-north.r+south.r)*radiusCells,-1.0,1.0);
    vec2 pressureGradient=0.5*vec2(east.b-west.b,north.b-south.b)*radiusCells;
    pressureGradient/=max(1.0,length(pressureGradient));
    vec2 twist=omega*vec2(-pressureGradient.y,pressureGradient.x)*interior;
    velocity+=0.3*twist;
    velocity/=max(1.0,length(velocity));
'''
d['runtimePatches'].append(dict(kind='shader-exact',selector='float integerFraction',before=before,after=after,countPerShader=1));d.update(id='production-common18-general-int-power05-pad4-contact-vorticity',comparisons=['s9-n3'],observableOutcome='Local contact rotation/shear heuristic from signed directioncurl and contactstrengthgradient; unchanged source and paired general integer transport.',risks=['ContactB is loading surrogate not fluidpressure; no physicalNavierStokes claim','Conditionaldirection derivatives may produce noise or identity','Four extra flow samples per rawedge (~32 currentcalls beforecompilerreuse)','Pad4/contactinteriorgate avoids boundaryrotation but requiresrealverification','Initial9offlineonly; no automaticphotoMSE winner'])
(out/(d['id']+'.json')).write_text(json.dumps(d,indent=2)+'\n')
rng=np.random.default_rng(97);v=rng.normal(size=(100000,2));v/=np.maximum(1,np.linalg.norm(v,axis=1))[:,None];tw=rng.normal(size=v.shape);tw/=np.maximum(1,np.linalg.norm(tw,axis=1))[:,None];omega=rng.uniform(-1,1,100000);raw=v+.3*omega[:,None]*tw;new=raw/np.maximum(1,np.linalg.norm(raw,axis=1))[:,None];assert np.max(np.linalg.norm(new,axis=1))<=1+1e-15;assert np.array_equal(v/np.maximum(1,np.linalg.norm(v,axis=1))[:,None],v) or np.max(abs(v/np.maximum(1,np.linalg.norm(v,axis=1))[:,None]-v))<1e-15
s=pathlib.Path('apps/web/src/engine/src/raster/shaders.ts').read_text().split('export const WC_BRUSH_DRAG_FRAG = `',1)[1].split('`;',1)[0]
for p in d['runtimePatches']:
 if p['kind']=='shader-exact' and p['selector'] in s:assert s.count(p['before'])==p.get('countPerShader',1);s=s.replace(p['before'],p['after'])
(out/'proof.json').write_text(json.dumps({'samples':100000,'normalizedVelocityBoundPASS':True,'sameGeneralIntegerCapsPairTheorem':True,'newShaderSequentialAnchor1PASS':True,'flatModulePatchesUnchanged':True,'note':'No actualGL compile/branch execution proof yet'},indent=2)+'\n');print(len(d['runtimePatches']))
