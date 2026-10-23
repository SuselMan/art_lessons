from pathlib import Path
import json,numpy as np
r=Path('temp/wc-runs/overnight-next');out=r/'saturating-beer-optics';folder=r/'calibrated-pool-optics85-four';rows=[]
gain=.85/.54
rho=np.linspace(0,20,10001)
for ceiling in [1.25,1.6,2.0]:
 t=gain*rho/np.sqrt(1+(gain*rho/ceiling)**2)
 assert t[0]==0 and np.all(np.diff(t)>=0) and np.all(t<ceiling) and np.all(t<=gain*rho+1e-12)
for cid in ['s6-n6','s9-n3','s8-n1','s7-n3']:
 fields=json.loads((folder/(cid+'-composite-fields.json')).read_text());masses=[];taus=[]
 for key,meta in fields.items():
  if not key.endswith('u_inkLoad'):continue
  shape=(meta['height'],meta['width'],4)
  P=np.fromfile(folder/(cid+'-'+key+'.rgba'),np.uint8).reshape(shape)/255
  D=np.fromfile(folder/(cid+'-'+key.replace('u_inkLoad','u_inkColor')+'.rgba'),np.uint8).reshape(shape)/255
  mask=(P[:,:,2]>.005)&(D[:,:,3]>.005)
  masses.append(P[:,:,2][mask]*2);taus.append((D[:,:,:3][mask]*4/np.maximum(D[:,:,3][mask,None],1e-10)).clip(0,np.log(50)))
 mass=np.concatenate(masses);tau=np.concatenate(taus);paint=np.exp(-tau);dark=1-paint@np.array([.2126,.7152,.0722]);tint=1+1.2*dark**4
 models={'legacyApprox':1-(1-np.exp(-mass*tint/.54))[:,None]*(1-paint),'Beer85Approx':np.exp(-tau*(mass*gain)[:,None])}
 for L in [1.25,1.6,2.0]:
  thickness=mass*gain/np.sqrt(1+(mass*gain/L)**2);models['saturatingBeer'+str(L)]=np.exp(-tau*thickness[:,None])
 rows.append({'case':cid,'samples':len(mass),'massQuantiles':np.quantile(mass,[.1,.5,.9,.99]).tolist(),'models':{k:{'meanLuminance':float((v@np.array([.2126,.7152,.0722])).mean()),'darkChannelsBelow05':int((v<.05).sum())} for k,v in models.items()}})
(out/'cpu-results.json').write_text(json.dumps({'law':'t=G*rho/sqrt(1+(G*rho/L)^2), G=.85/.54; monotone analytic derivative G/(1+(G*rho/L)^2)^1.5','gridProof':'all3ceilings zero at0, monotone, bounded t<L and<=linearBeer, preserves derivative G at0','physicalClaim':'phenomenological saturation diagnostic; NOT calibratedKM/scatteringmodel','scope':'Actual44 raw P/C approximate tau withoutpaper/thinprior/interpolation, NOT displayedpixelprediction','rows':rows},indent=2))
parent=json.loads((r/'calibrated-pool-optics85/production-common18-general-int-pad4-calibrated-clock-pool-meso-optics85-only.json').read_text())
for L in [1.25,2.0]:
 spec=json.loads(json.dumps(parent));spec['id']='production-calibrated-pool-saturating-beer'+str(L).replace('.','p');spec['runtimePatches'][-1]['after']=f'''float linearThickness = pigmentMass * 0.85 / WC_DENSITY_K;
      float effectiveThickness = linearThickness / sqrt(1.0 + (linearThickness / {L}) * (linearThickness / {L}));
      vec3 transmittance = exp(-tauHere * effectiveThickness);
      float density = 1.0 - min(transmittance.r, min(transmittance.g, transmittance.b));
      paint = density > 0.0001 ? clamp((transmittance - vec3(1.0 - density)) / density, 0.0, 1.0) : vec3(1.0);'''
 spec['opticalSaturationScope']={'ceiling':L,'law':'monotone saturating optical thickness, same zero and linear derivative as Beer85','classification':'DISPLAYONLY phenomenological diagnostic, no physicalscattercalibration','parent':'44calibratedmesopool; replaceLASTopticalpatch only','invariantsExpected':'allP/C/cov bytes identical44, purewater density0'}
 (out/('spec-'+str(L).replace('.','p')+'.json')).write_text(json.dumps(spec,indent=2))
print(json.dumps(rows,indent=2))
