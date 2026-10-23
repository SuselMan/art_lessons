from pathlib import Path
import json,numpy as np
n=Path('temp/wc-runs/overnight-next');d=n/'independent-water-height-integer-smoothheight-volume';src=n/'wet-context-source23-stages-v3-three-four';domain=np.load(d/'model-domain.npy');shape=domain.shape;YY,XX=np.indices(shape);flat=np.arange(domain.size).reshape(shape);disk=(XX+1240-1521.2179)**2+(YY+114-309.6336)**2<=64
meta=next(f for f in json.load(open(src/'s4-n1-phase-fields.json'))['frames'] if f['stage']=='after-brush-stable' and f['role']=='pigment');iy=1535-np.arange(114,489);ix=np.arange(1240,1816)-1054
initial=np.concatenate([np.fromfile(src/f's4-n1-after-brush-stable-{role}.rgba',np.uint8).reshape(1536,1536,4)[iy[:,None],ix[None,:],:] for role in ['pigment','color']],2)
out={'scope':'Read-only independent snapshot capacity requests across all hop6..11/axis/parity topologies. No state updates. NOT historical 120-step request fraction; saved report lacks counters.','snapshots':{}}
for name,h,v in [('initial',np.load(d/'initial-height.npy'),initial),('final',np.load(d/'final-height.npy'),np.load(d/'final-eight-channels.npy'))]:
 totals={k:{'positiveRequests':0,'limitedRequests':0,'requestedWater':0.,'withheldWater':0.,'bindingChannelCounts':[0]*8,'minimumLimit':1.}for k in ['whole','centerEitherEndpoint']}
 for hop in range(6,12):
  for axis in [0,1]:
   for parity in [0,1]:
    pos=YY if axis==0 else XX;eligible=((pos//hop)%2==parity)&(pos+hop<shape[axis])&domain
    for k in range(1,hop+1):eligible &=np.roll(domain,-k,axis=axis)
    aa=flat[eligible];bb=aa+(hop*shape[1] if axis==0 else hop);hh=h.ravel();vv=v.reshape(-1,8).astype(float);high=hh[aa]>=hh[bb];donor=np.where(high,aa,bb);rec=np.where(high,bb,aa);q=vv[donor];room=255-vv[rec];request=.1*(hh[donor]-hh[rec]);fraction=np.divide(request,hh[donor],out=np.zeros_like(request),where=hh[donor]>0);ratios=np.divide(room,q*fraction[:,None],out=np.ones_like(q),where=q*fraction[:,None]>0);limit=np.minimum(1,ratios.min(1));positive=request>1e-12;limited=limit<1-1e-12
    for scope,mask in [('whole',positive),('centerEitherEndpoint',positive&(disk.ravel()[donor]|disk.ravel()[rec]))]:
     t=totals[scope];t['positiveRequests']+=int(mask.sum());t['limitedRequests']+=int((limited&mask).sum());t['requestedWater']+=float(request[mask].sum());t['withheldWater']+=float((request*(1-limit))[mask].sum());t['minimumLimit']=min(t['minimumLimit'],float(limit[mask].min()) if mask.any() else 1)
     for ch in range(8):t['bindingChannelCounts'][ch]+=int((mask&limited&(ratios[:,ch]<=limit+1e-12)).sum())
 for t in totals.values():t['limitedRequestFraction']=t['limitedRequests']/max(1,t['positiveRequests']);t['withheldWaterFraction']=t['withheldWater']/max(1e-99,t['requestedWater'])
 out['snapshots'][name]=totals
(d/'capacity-snapshot-audit.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
