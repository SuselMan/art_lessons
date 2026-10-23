from pathlib import Path
import json,numpy as np
from PIL import Image
r=Path('temp/wc-runs/overnight-next');p=r/'foreign-puddle-source-audit';centres=json.loads((p/'wet-centres.json').read_text());cx,cy=np.median([[d['x'],d['y']] for d in centres],axis=0);rows=[]
for folder in ['physical22-wet-controls','physical22-enteredwater-source-three']:
 f=r/folder;meta=json.loads((f/'s4-n1-composite-fields.json').read_text());arr={}
 for key,m in meta.items():arr[key.split('-')[-1]]=np.flipud(np.fromfile(f/('s4-n1-'+key+'.rgba'),np.uint8).reshape(m['height'],m['width'],4)).astype(float)/255
 P=arr['u_inkLoad'];D=arr['u_inkColor'];cov=arr['u_strokeCoverage'];png=np.array(Image.open(f/'s4-n1.png').convert('RGB')).astype(float)/255
 yy,xx=np.indices(P.shape[:2]);worldX=xx+1024;worldY=yy;core=(worldX-cx)**2+(worldY-cy)**2<8**2;paint=P[:,:,2]>.005;core &=paint
 regions={'wet-core-8px':core,'wet-contact-band':paint & (np.abs(worldX-cx)<20)&(np.abs(worldY-cy)<40),'all-paint':paint}
 stats={}
 for name,mask in regions.items():
  coords=np.where(mask);vis=png[coords[0],coords[1]+1024];mass=P[:,:,2][mask]*2;carrier=P[:,:,3][mask]*2;depth=D[:,:,:3][mask]*8;alpha=D[:,:,3][mask]*2;tau=depth/np.maximum(alpha[:,None],1e-9)
  stats[name]={'pixels':int(mask.sum()),'massMean':float(mass.mean()),'massRange':[float(mass.min()),float(mass.max())],'carrierMean':float(carrier.mean()),'BoverAmean':float((mass/np.maximum(carrier,1e-9)).mean()),'tauMean':tau.mean(0).tolist(),'RGBMean':vis.mean(0).tolist(),'luminanceMean':float((vis@np.array([.2126,.7152,.0722])).mean()),'coverageAlphaMean':float(cov[:,:,3][mask].mean()),'encodedB255':int((P[:,:,2][mask]==1).sum())}
 # literal row through center, same world pixel
 y=int(round(cy));samples=[]
 for x in range(int(cx)-50,int(cx)+51,5):
  q=P[y,x-1024];z=D[y,x-1024];samples.append({'x':x,'y':y,'mass2':float(q[2]*2),'carrier2':float(q[3]*2),'depth8':(z[:3]*8).tolist(),'depthMass2':float(z[3]*2),'RGB':png[y,x].tolist(),'covA':float(cov[y,x-1024,3])})
 rows.append({'folder':folder,'stats':stats,'horizontalSamePixelSection':samples})
(p/'actual4-crosssection.json').write_text(json.dumps({'wetCentre':[cx,cy],'scope':'same original input world/tile GLbottomup flipped; Pdecode2/Ddecode8; PNG displayed readout includes real paper/composite','rows':rows},indent=2));print([(x['folder'],x['stats']['wet-core-8px'])for x in rows])
