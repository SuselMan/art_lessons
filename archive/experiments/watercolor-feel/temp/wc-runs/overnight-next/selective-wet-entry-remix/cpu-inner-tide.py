from pathlib import Path
import json,hashlib,sys,numpy as np
from scipy.ndimage import binary_erosion,distance_transform_edt
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=Path('temp/wc-runs/overnight-next');out=root/'selective-wet-entry-remix/inner-tide-cpu';out.mkdir(exist_ok=True);WIDTH=int(sys.argv[1]);FRACTION=float(sys.argv[2]);rows=[]
for cid in ['s3-n1','s4-n1','s7-n3']:
 folder=root/('wet-context-source23-postonly-v4-seven'if cid=='s7-n3'else'wet-context-source23-stages-v3-three-four');frames=json.loads((folder/(cid+'-phase-fields.json')).read_text())['frames'];fs={f['role']:f for f in frames if f['stage']=='after-brush-stable'}
 def read(role):
  f=fs[role];raw=(folder/f['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==f['sha256'];return np.frombuffer(raw,np.uint8).reshape(f['height'],f['width'],4).astype(np.int32)
 P=read('pigment');C=read('color');V=read('coverage');land=fs['pigment']['landedWet'];ratio=np.divide(P[:,:,1],P[:,:,3],where=P[:,:,3]>0,out=np.zeros(P.shape[:2],float));gate=np.maximum(np.clip(ratio,0,1)-land,0);domain=(gate>.2)&(V[:,:,2]>12);band=domain&~binary_erosion(domain,iterations=WIDTH);donors=domain&~band&(P[:,:,3]>0);Q=np.concatenate([P,C],2);before=Q.copy();sums=Q.sum((0,1));requested=0;moved=0;blocked=0;clippedTargets=0
 if donors.any():
  dist,idx=distance_transform_edt(~band,return_indices=True);ys,xs=np.where(donors);order=np.argsort(-dist[ys,xs],kind='stable') # explicit deep-to-boundary ordering, diagnostic bias
  for n in order:
   y,x=ys[n],xs[n];ty,tx=idx[:,y,x];q=before[y,x];f=FRACTION*gate[y,x];want=np.floor(q*f).astype(np.int32);requested+=int(want[2]);room=255-Q[ty,tx];lam=min(1,float(np.min(np.divide(room,want,where=want>0,out=np.ones(8)*1e9))));flux=np.floor(want*lam).astype(np.int32);Q[y,x]-=flux;Q[ty,tx]+=flux;moved+=int(flux[2]);blocked+=int(want[2]-flux[2]);clippedTargets+=int(lam<1)
 assert Q.min()>=0 and Q.max()<=255 and np.array_equal(Q.sum((0,1)),sums)
 tag=f'{cid}-w{WIDTH}-f{FRACTION:.1f}';(out/(tag+'-P.rgba')).write_bytes(Q[:,:,:4].astype(np.uint8).tobytes());(out/(tag+'-C.rgba')).write_bytes(Q[:,:,4:].astype(np.uint8).tobytes())
 ys,xs=np.where(np.any(before>0,2));y0=max(0,ys.min()-15);y1=min(P.shape[0],ys.max()+16);x0=max(0,xs.min()-15);x1=min(P.shape[1],xs.max()+16);xx,yy=np.meshgrid(np.arange(x0,x1),np.arange(y0,y1));m=fs['pigment']['mapping'];wx=m['x0']+(xx+.5)*m['S'];wy=m['y0']+(P.shape[0]-yy-.5)*m['S'];centre=(wx-1521.2178955)**2+(wy-309.633606)**2<64;pb=before[y0:y1,x0:x1,2]*2/255;pa=Q[y0:y1,x0:x1,2]*2/255
 row={'case':cid,'width':WIDTH,'fraction':FRACTION,'landed':land,'gateMax':float(gate.max()),'donors':int(donors.sum()),'bandPixels':int(band.sum()),'requestedBcodes':requested,'movedBcodes':moved,'blockedBcodes':blocked,'capacityLimitedDonors':clippedTargets,'changedBytes':int(np.count_nonzero(Q-before)),'all8sumExact':True,'bounds0255':True,'beforeRGBA8sums':sums.tolist(),'afterRGBA8sums':Q.sum((0,1)).tolist(),'mapping':m,'orientation':'GLbottomup','sourceSHA':{role:fs[role]['sha256']for role in fs}}
 if cid=='s4-n1':row['centreMassBefore']=float(pb[centre].mean());row['centreMassAfter']=float(pa[centre].mean())
 rows.append(row)
 fig,axes=plt.subplots(1,4,figsize=(16,4));z=[pb,pa,(Q-before)[y0:y1,x0:x1,2]*2/255,band[y0:y1,x0:x1]]
 for ax,im,title in zip(axes,z,['Actual source23 mass2','CPU internal boundary transfer','delta mass2','target band old-wet gate']):ax.imshow(im,origin='lower',cmap='coolwarm'if title.startswith('delta')else'viridis',vmin=-.3 if title.startswith('delta')else 0,vmax=.3 if title.startswith('delta')else 1);ax.set_title(title);ax.axis('off')
 fig.suptitle('CPU heuristic nearest boundary/capacity; NOT fluid simulation or GPU render');fig.tight_layout();fig.savefig(out/(tag+'.png'),dpi=130);plt.close(fig)
(out/(f'results-w{WIDTH}-f{FRACTION:.1f}.json')).write_text(json.dumps({'scope':'Declared heuristic nearest Euclidean old-wet boundary; deep-first donor ordering; no path wetness proof/no fluidvolume. Single-pass .fraction source requested; ALL8 available targetcapacity shared coefficient, blocked retained donor.','rows':rows},indent=2));print(rows)
