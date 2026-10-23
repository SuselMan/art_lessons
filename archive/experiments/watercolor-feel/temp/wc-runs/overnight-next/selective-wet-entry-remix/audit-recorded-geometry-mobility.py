from pathlib import Path
import json,hashlib,sys,base64,numpy as np
from scipy.ndimage import binary_erosion,distance_transform_edt
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=Path('temp/wc-runs/overnight-next');out=root/'selective-wet-entry-remix/recorded-geometry-mobility-audit';out.mkdir(exist_ok=True);WIDTH=int(sys.argv[1]);FRACTION=float(sys.argv[2]);rows=[]
for cid in ['s3-n1','s4-n1','s7-n3']:
 folder=root/('wet-context-source23-postonly-v4-seven'if cid=='s7-n3'else'wet-context-source23-stages-v3-three-four');frames=json.loads((folder/(cid+'-phase-fields.json')).read_text())['frames'];fs={f['role']:f for f in frames if f['stage']=='after-brush-stable'}
 def read(role):
  f=fs[role];raw=(folder/f['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==f['sha256'];return np.frombuffer(raw,np.uint8).reshape(f['height'],f['width'],4).astype(np.int32)
 P=read('pigment');C=read('color');V=read('coverage');land=fs['pigment']['landedWet'];ratio=np.divide(P[:,:,1],P[:,:,3],where=P[:,:,3]>0,out=np.zeros(P.shape[:2],float));gate=np.maximum(np.clip(ratio,0,1)-land,0);domain=np.zeros(P.shape[:2],bool)
 if cid=='s4-n1':
  case=next(c for c in json.loads((root/'selective-wet-entry-remix/stage-inputs.json').read_text())['cases']if c['id']==cid);old=case['ops'][0];version,data=old['dabsPacked'].split(':',1);assert version=='1';dabs=np.frombuffer(base64.b64decode(data),dtype='<f4').reshape(-1,10);m=fs['pigment']['mapping'];S=m['S'];h=P.shape[0]
  for d in dabs:
   x,y,_,_,_,size,aspect,angle,_,_=map(float,d);radius=size*.5;rx=max(.5,radius*max(1,aspect));ry=max(.5,radius);c=np.cos(angle);sn=np.sin(angle);reachx=np.hypot(rx*c,ry*sn);reachy=np.hypot(rx*sn,ry*c);xlo=max(0,int(np.floor((x-reachx-m['x0'])/S)));xhi=min(P.shape[1],int(np.ceil((x+reachx-m['x0'])/S)));ylo=max(0,int(np.floor(h-(y+reachy-m['y0'])/S)));yhi=min(h,int(np.ceil(h-(y-reachy-m['y0'])/S)));yy,xx=np.mgrid[ylo:yhi,xlo:xhi];dx=m['x0']+(xx+.5)*S-x;dy=m['y0']+(h-yy-.5)*S-y;domain[ylo:yhi,xlo:xhi]|=((dx*c+dy*sn)/rx)**2+((-dx*sn+dy*c)/ry)**2<=1
 band=domain&~binary_erosion(domain,iterations=WIDTH);donors=domain&~band&(P[:,:,3]>0);Q=np.concatenate([P,C],2);before=Q.copy();sums=Q.sum((0,1));requested=0;moved=0;blocked=0;clippedTargets=0
 if donors.any():
  dist,idx=distance_transform_edt(~band,return_indices=True);ys,xs=np.where(donors);order=np.argsort(-dist[ys,xs],kind='stable') # explicit deep-to-boundary ordering, diagnostic bias
  for n in order:
   y,x=ys[n],xs[n];ty,tx=idx[:,y,x];q=before[y,x];f=FRACTION*gate[y,x];want=np.floor(q*f).astype(np.int32);requested+=int(want[2]);room=255-Q[ty,tx];lam=min(1,float(np.min(np.divide(room,want,where=want>0,out=np.ones(8)*1e9))));flux=np.floor(want*lam).astype(np.int32);Q[y,x]-=flux;Q[ty,tx]+=flux;moved+=int(flux[2]);blocked+=int(want[2]-flux[2]);clippedTargets+=int(lam<1)
 assert Q.min()>=0 and Q.max()<=255 and np.array_equal(Q.sum((0,1)),sums)
 tag=f'{cid}-w{WIDTH}-f{FRACTION:.1f}';(out/(tag+'-P.rgba')).write_bytes(Q[:,:,:4].astype(np.uint8).tobytes());(out/(tag+'-C.rgba')).write_bytes(Q[:,:,4:].astype(np.uint8).tobytes())
 ys,xs=np.where(np.any(before>0,2));y0=max(0,ys.min()-15);y1=min(P.shape[0],ys.max()+16);x0=max(0,xs.min()-15);x1=min(P.shape[1],xs.max()+16);xx,yy=np.meshgrid(np.arange(x0,x1),np.arange(y0,y1));m=fs['pigment']['mapping'];wx=m['x0']+(xx+.5)*m['S'];wy=m['y0']+(P.shape[0]-yy-.5)*m['S'];centre=(wx-1521.2178955)**2+(wy-309.633606)**2<64;pb=before[y0:y1,x0:x1,2]*2/255;pa=Q[y0:y1,x0:x1,2]*2/255
 row={'case':cid,'width':WIDTH,'fraction':FRACTION,'landed':land,'gateMax':float(gate.max()),'recordedGeometryPixels':int(domain.sum()),'outsidePigmentGeometryPixels':int((domain&(P[:,:,2]<=1)).sum()),'outsidePigmentCoverageBpositivePixels':int((domain&(P[:,:,2]<=1)&(V[:,:,2]>12)).sum()),'outsidePigmentCoverageApositivePixels':int((domain&(P[:,:,2]<=1)&(V[:,:,3]>.51)).sum()),'geometryCoverageApositivePixels':int((domain&(V[:,:,3]>.51)).sum()),'geometryCoverageBpositivePixels':int((domain&(V[:,:,2]>.51)).sum()),'outsidePigmentCoverageAmean':float(V[:,:,3][domain&(P[:,:,2]<=1)].mean()/255)if np.any(domain&(P[:,:,2]<=1))else 0,'outsidePigmentCapacityCodesAll8':np.where((domain&(P[:,:,2]<=1))[:,:,None],255-before,0).sum((0,1)).tolist(),'donors':int(donors.sum()),'bandPixels':int(band.sum()),'requestedBcodes':requested,'movedBcodes':moved,'blockedBcodes':blocked,'capacityLimitedDonors':clippedTargets,'changedBytes':int(np.count_nonzero(Q-before)),'all8sumExact':True,'bounds0255':True,'beforeRGBA8sums':sums.tolist(),'afterRGBA8sums':Q.sum((0,1)).tolist(),'mapping':m,'orientation':'GLbottomup','sourceSHA':{role:fs[role]['sha256']for role in fs}}
 if cid=='s4-n1':row['centreMassBefore']=float(pb[centre].mean());row['centreMassAfter']=float(pa[centre].mean())
 np.save(out/(cid+'-recordedGeometry.npy'),domain);rows.append(row)
 fig,axes=plt.subplots(1,4,figsize=(16,4));z=[pb,pa,(Q-before)[y0:y1,x0:x1,2]*2/255,band[y0:y1,x0:x1]]
 for ax,im,title in zip(axes,z,['Actual source23 mass2','CPU internal boundary transfer','delta mass2','target recordedGeometry boundary']):ax.imshow(im,origin='lower',cmap='coolwarm'if title.startswith('delta')else'viridis',vmin=-.3 if title.startswith('delta')else 0,vmax=.3 if title.startswith('delta')else 1);ax.set_title(title);ax.axis('off')
 fig.suptitle('CPU recorded ellipse union boundary/capacity; NOT fluid simulation or GPU render');fig.tight_layout();fig.savefig(out/(tag+'.png'),dpi=130);plt.close(fig)
(out/(f'results-w{WIDTH}-f{FRACTION:.1f}.json')).write_text(json.dumps({'scope':'Declared immutable old-water rawellipse union geometry, not actualdepth/moisture; nearest Euclidean boundary; deep-first donor ordering; no path wetness proof/no fluidvolume. Single-pass .fraction source requested; ALL8 available targetcapacity shared coefficient, blocked retained donor.','rows':rows},indent=2));print(rows)
