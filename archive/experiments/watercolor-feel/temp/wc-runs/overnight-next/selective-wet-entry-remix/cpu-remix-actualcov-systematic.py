from pathlib import Path
import json,numpy as np,hashlib,sys,os
r=Path('temp/wc-runs/overnight-next');folder=r/'wet-context-source23-stages-v3-three-four';out=[];HOP=int(sys.argv[1]) if len(sys.argv)>1 else 8;ITERS=int(sys.argv[2]) if len(sys.argv)>2 else 12;assert HOP*ITERS<=384;FIXED=os.environ.get("QA_FIXED_GATE")=="1";tag=f"systematic-actualcov-h{HOP}-i{ITERS}"+("-fixed" if FIXED else "")
for cid in ['s3-n1','s4-n1']:
 fs=json.loads((folder/(cid+'-phase-fields.json')).read_text())['frames'];get=lambda role:next(f for f in fs if f['stage']=='after-brush-stable' and f['role']==role)
 def read(f):
  raw=(folder/f['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==f['sha256'];return np.frombuffer(raw,np.uint8).reshape(f['height'],f['width'],4).astype(np.int32)
 pf=get('pigment');P=read(pf);C=read(get('color'));vf=get('coverage');assert vf['mapping']==pf['mapping'] and vf['width']==pf['width'] and vf['height']==pf['height'];V=read(vf);ys,xs=np.where(np.any(P>0,axis=2)|np.any(C>0,axis=2));y0=max(0,int(ys.min())-(HOP*ITERS+8));y1=min(P.shape[0],int(ys.max())+(HOP*ITERS+9));x0=max(0,int(xs.min())-(HOP*ITERS+8));x1=min(P.shape[1],int(xs.max())+(HOP*ITERS+9));P=P[y0:y1,x0:x1];C=C[y0:y1,x0:x1];V=V[y0:y1,x0:x1];Q=np.concatenate([P,C],axis=2);land=json.loads((folder/(cid+'-current-film.json')).read_text())['operationContexts'][0]['landedWetArg'];mask=P[:,:,2]>1;ratio=np.divide(P[:,:,1],P[:,:,3],where=P[:,:,3]>0,out=np.zeros(P.shape[:2],float));gate=np.maximum(np.clip(ratio,0,1)-land,0)
 # Actual canonical coverage.B record, not a claim of physical moisture.
 wet=V[:,:,2].astype(float)/255;original=Q.sum((0,1));moved=0
 for step in range(ITERS):
  if not FIXED:ratio=np.divide(Q[:,:,1],Q[:,:,3],where=Q[:,:,3]>0,out=np.zeros(Q.shape[:2],float));gate=np.maximum(np.clip(ratio,0,1)-land,0)
  if not gate.any():break
  delta=np.zeros_like(Q);cumulative=np.zeros(Q.shape[:2]);yy,xx=np.indices(Q.shape[:2]);worldX=np.floor((xx+x0+pf["mapping"]["x0"])*pf["mapping"]["S"]);worldY=np.floor((yy+y0-pf["mapping"]["y0"]-pf["height"])*pf["mapping"]["S"]);xi=((np.mod(worldX,251)*73+np.mod(worldY,251)*109+(step%251)*137)%251+.5)/251
  for dy,dx in [(0,HOP),(0,-HOP),(HOP,0),(-HOP,0)]:
   j=np.roll(Q,(-dy,-dx),(0,1));path=wet.copy()
   for distance in range(1,HOP+1):path=np.minimum(path,np.roll(wet,(-dy*distance//HOP,-dx*distance//HOP),(0,1)))
   if dx>0:path[:,-HOP:]=0
   if dx<0:path[:,:HOP]=0
   if dy>0:path[-HOP:]=0
   if dy<0:path[:HOP]=0
   A=Q[:,:,3];f=.14*gate*path*np.maximum(A-j[:,:,3],0)/np.maximum(A,1);cap=(255-j)//4;lam=np.minimum(1,np.min(np.divide(cap,Q*f[:,:,None],where=(Q*f[:,:,None])>0,out=np.ones(Q.shape)*1e9),axis=2));previous=cumulative.copy();cumulative+=f*lam;flux=(np.floor(Q*cumulative[:,:,None]+xi[:,:,None])-np.floor(Q*previous[:,:,None]+xi[:,:,None])).astype(np.int32);flux=np.minimum(flux,cap);delta-=flux;delta+=np.roll(flux,(dy,dx),(0,1));moved+=int(flux[:,:,2].sum())
  Q+=delta;assert Q.min()>=0 and Q.max()<=255 and np.array_equal(Q.sum((0,1)),original)
 np.save(r/'selective-wet-entry-remix'/(cid+'-'+tag+'-coverage.npy'),wet);np.save(r/'selective-wet-entry-remix'/(cid+'-'+tag+'-gate.npy'),gate);np.save(r/'selective-wet-entry-remix'/(cid+'-'+tag+'-before.npy'),P[:,:,2]);np.save(r/'selective-wet-entry-remix'/(cid+'-'+tag+'-after.npy'),Q[:,:,2]);
 out.append({'case':cid,'scope':'Actual postbrush Q+coverageB; continuous minimum of every intermediate pixel sample. CPU conservative diagnostic, not GPU prediction.','cropField':[x0,y0,x1,y1],'fieldMapping':pf['mapping'],'allocation':'systematicCDF251 shared donor xi across all8','iterations':ITERS,'hop':HOP,'landed':land,'movedPigmentByteCodes':moved,'totalCodesPerChannelExact':True,'bounds0255':True,'changedBytes':int((Q!=np.concatenate([P,C],axis=2)).sum()),'absoluteBChangeCodes':int(np.abs(Q[:,:,2]-P[:,:,2]).sum())})
(r/'selective-wet-entry-remix'/(tag+'-results.json')).write_text(json.dumps(out,indent=2));print(out)
