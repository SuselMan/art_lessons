import pathlib,json,base64,numpy as np
from PIL import Image,ImageDraw
p=pathlib.Path('temp/wc-runs/overnight-next');d=p/'trajectory-audit';d.mkdir(exist_ok=True);x=json.load(open(p/'inputs.json'));rows=[]
for t in x['cases']:
 if t['id'] not in ['s9-n3','s9-n2','s6-n6']:continue
 arrays=[np.frombuffer(base64.b64decode(o['dabsPacked'].split(':',1)[1]),dtype='<f4').reshape(-1,10)for o in t['ops']];a=np.concatenate(arrays);left,top,right,bottom=t['box'];im=Image.new('RGB',(600,600),'white');draw=ImageDraw.Draw(im);scale=min(580/(right-left),580/(bottom-top));points=[(10+(v[0]-left)*scale,10+(v[1]-top)*scale)for v in a];N=len(points)
 for i in range(1,N):
  phase=i/max(N-1,1);color=(int(255*phase),50,int(255*(1-phase)));draw.line([points[i-1],points[i]],fill=color,width=2)
 for i in [0,N//4,N//2,3*N//4,N-1]:
  v=a[i];px,py=points[i];r=max(1,v[5]*.5*scale);draw.ellipse([px-r,py-r,px+r,py+r],outline='gray',width=1);draw.text((px+3,py),str(i),fill='black')
 steps=np.diff(a[:,:2],axis=0);lengths=np.linalg.norm(steps,axis=1);ang=np.arctan2(steps[:,1],steps[:,0]);good=lengths>.1;turn=np.diff(np.unwrap(ang[good]));rad=a[:,5]/2
 rows.append({'id':t['id'],'dabs':N,'pathLength':float(lengths.sum()),'medianMinorRadius':float(np.median(rad)),'turnsSigned':float(turn.sum()/(2*np.pi)),'turnAbsolute':float(np.abs(turn).sum()/(2*np.pi)),'medianStepRadius':float(np.median(lengths/np.maximum(rad[1:],.001))),'pressureRange':[float(a[:,2].min()),float(a[:,2].max())],'scope':'Packed genuine dabs positionpressuregeometry; line hue chronologicalblue-to-red; pressure/time/angle unchanged. Footprint minorcircle not ellipse, diagnosticonly.'})
 im.save(d/(t['id']+'.png'))
(d/'statistics.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(rows,indent=2))
