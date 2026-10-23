from pathlib import Path
import json,numpy as np,hashlib
r=Path('temp/wc-runs/overnight-next');folder=r/'wet-context-source23-stages-v2-three-four';out=[]
for cid in ['s3-n1','s4-n1']:
 fs=json.loads((folder/(cid+'-phase-fields.json')).read_text())['frames'];get=lambda role:next(f for f in fs if f['stage']=='after-brush-stable' and f['role']==role)
 def read(f):return np.fromfile(folder/f['file'],np.uint8).reshape(f['height'],f['width'],4).astype(np.int32)
 pf=get('pigment');P=read(pf);C=read(get('color'));ys,xs=np.where(np.any(P>0,axis=2)|np.any(C>0,axis=2));y0=max(0,int(ys.min())-104);y1=min(P.shape[0],int(ys.max())+105);x0=max(0,int(xs.min())-104);x1=min(P.shape[1],int(xs.max())+105);P=P[y0:y1,x0:x1];C=C[y0:y1,x0:x1];Q=np.concatenate([P,C],axis=2);land=json.loads((folder/(cid+'-current-film.json')).read_text())['operationContexts'][0]['landedWetArg'];mask=P[:,:,2]>1;ratio=np.divide(P[:,:,1],P[:,:,3],where=P[:,:,3]>0,out=np.zeros(P.shape[:2],float));gate=np.maximum(np.clip(ratio,0,1)-land,0)
 # P.G support is ONLY exploratory proxy; not missing actual prebrush coverage.B.
 wet=P[:,:,1]>1;original=Q.sum((0,1));moved=0
 for step in range(12):
  delta=np.zeros_like(Q)
  for dy,dx in [(0,8),(0,-8),(8,0),(-8,0)]:
   j=np.roll(Q,(-dy,-dx),(0,1));path=wet.copy()
   for distance in [2,4,6,8]:path &= np.roll(wet,(-dy*distance//8,-dx*distance//8),(0,1))
   if dx>0:path[:,-8:]=False
   if dx<0:path[:,:8]=False
   if dy>0:path[-8:]=False
   if dy<0:path[:8]=False
   A=Q[:,:,3];f=.14*gate*path*np.maximum(A-j[:,:,3],0)/np.maximum(A,1);cap=(255-j)//4;lam=np.minimum(1,np.min(np.divide(cap,Q*f[:,:,None],where=(Q*f[:,:,None])>0,out=np.ones(Q.shape)*1e9),axis=2));flux=np.floor(Q*(f*lam)[:,:,None]+1e-12).astype(np.int32);delta-=flux;delta+=np.roll(flux,(dy,dx),(0,1));moved+=int(flux[:,:,2].sum())
  Q+=delta;assert Q.min()>=0 and Q.max()<=255 and np.array_equal(Q.sum((0,1)),original)
 np.save(r/'selective-wet-entry-remix'/(cid+'-proxy-before.npy'),P[:,:,2]);np.save(r/'selective-wet-entry-remix'/(cid+'-proxy-after.npy'),Q[:,:,2]);
 out.append({'case':cid,'scope':'Actual postbrush Q; exploratory wetpath=P.G>1byte proxy NOT actual coverage.B. No renderer prediction.','iterations':12,'hop':8,'landed':land,'movedPigmentByteCodes':moved,'totalCodesPerChannelExact':True,'bounds0255':True,'changedBytes':int((Q!=np.concatenate([P,C],axis=2)).sum()),'absoluteBChangeCodes':int(np.abs(Q[:,:,2]-P[:,:,2]).sum())})
(r/'selective-wet-entry-remix/cpu-remix-results.json').write_text(json.dumps(out,indent=2));print(out)
