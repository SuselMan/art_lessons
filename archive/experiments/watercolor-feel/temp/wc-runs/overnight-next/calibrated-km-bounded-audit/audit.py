from pathlib import Path
import json,numpy as np
r=Path('temp/wc-runs/overnight-next');p=r/'calibrated-km-bounded-audit';folder=r/'calibrated-pool-optics85-four'
def km(C,d):
 k=(1-C)**2/(2*np.maximum(C,1e-12));b=np.sqrt(k*(k+2));t=np.tanh(b*d);return np.where(k<1e-12,1,(b-k*t)/np.maximum(b+k*t,1e-30))
C=np.exp(-np.linspace(1e-6, np.log(50),1001))[:,None];d=np.linspace(0,30,1001)[None,:];R=km(C,d)
assert np.all(R>=C-1e-12) and np.all(R<=1+1e-12) and np.all(np.diff(R,axis=1)<=1e-12)
rows=[]
for cid in ['s9-n3','s8-n1','s7-n3']:
 fields=json.loads((folder/(cid+'-composite-fields.json')).read_text());masses=[];taus=[]
 for key,meta in fields.items():
  if not key.endswith('u_inkLoad'):continue
  P=np.fromfile(folder/(cid+'-'+key+'.rgba'),np.uint8).reshape(meta['height'],meta['width'],4)/255
  D=np.fromfile(folder/(cid+'-'+key.replace('u_inkLoad','u_inkColor')+'.rgba'),np.uint8).reshape(P.shape)/255
  mask=(P[:,:,2]>.005)&(D[:,:,3]>.005)
  masses.append(P[:,:,2][mask]*2);taus.append((D[:,:,:3][mask]*4/np.maximum(D[:,:,3][mask,None],1e-10)).clip(0,np.log(50)))
 mass=np.concatenate(masses);tau=np.concatenate(taus);paint=np.exp(-tau);dark=1-paint@np.array([.2126,.7152,.0722]);tint=1+1.2*dark**4;legacy=1-(1-np.exp(-mass*tint/.54))[:,None]*(1-paint);beer=np.exp(-tau*(mass*.85/.54)[:,None]);models={'legacyApprox':legacy,'Beer85Approx':beer,'KMscale1':km(paint,mass[:,None]),'KMscale2':km(paint,2*mass[:,None])};rows.append({'case':cid,'samples':len(mass),'massQuantiles':np.quantile(mass,[.1,.5,.9,.99]).tolist(),'models':{k:{'meanLuminance':float((v@np.array([.2126,.7152,.0722])).mean()),'belowSwatchChannels':int((v<paint-1e-8).sum()),'darkChannelsBelow05':int((v<.05).sum())} for k,v in models.items()}})
(p/'cpu-results.json').write_text(json.dumps({'properties':'1001x1001 C/d grid bounded, monotone PASS','scope':'Actual parent44 P/C texture bytes from optical-only45 spy proven unchanged. Approximate intrinsic tau=D.rgb*4/D.a excludes thinPrior/paper-grain/composite interpolation; no exact displayed pixel reconstruction.','rows':rows},indent=2));print(json.dumps(rows,indent=2))
