from pathlib import Path
import json,numpy as np
root=Path(__file__).resolve().parent; src=root/'wet-context-source23-stages-v3-three-four'
frames=json.loads((src/'s4-n1-phase-fields.json').read_text())['frames'];meta=next(f for f in frames if f['stage']=='after-brush-stable' and f['role']=='pigment');H,W=meta['height'],meta['width'];m=meta['mapping']
x=np.arange(1240,1816);y=np.arange(114,489);ix=((x+.5-m['x0'])/m['S']).astype(int);iy=H-1-((y+.5-m['y0'])/m['S']).astype(int)
a=np.fromfile(src/'s4-n1-after-brush-stable-pigment.rgba',np.uint8).reshape(H,W,4)[iy[:,None],ix[None,:],2].astype(float)
X,Y=np.meshgrid(x,y);r2=(X-1521.2179)**2+(Y-309.6336)**2
out={'scope':'CPU raw pigment-code spatial moments at before-tide fixture stage; not final visible RGB or original fluid volume. Integer world-position convention. No optimality score against photo.','models':{}}
def metrics(z):
 t=z.sum();cx=(z*X).sum()/t;cy=(z*Y).sum()/t
 return {'sumBcodes':float(t),'centroid':[float(cx),float(cy)],'rmsRadiusAroundOwnCentroid':float(np.sqrt((z*((X-cx)**2+(Y-cy)**2)).sum()/t)),'rmsRadiusAroundCrossing':float(np.sqrt((z*r2).sum()/t)),'crossingMassByRadius':{str(r):float(z[r2<=r*r].sum()) for r in [8,16,32,64,128]}}
out['initial']=metrics(a)
for name in ['independent-water-height-integer-smoothheight','independent-water-height-integer-smoothheight-volume']:
 b=np.load(root/name/'final-eight-channels.npy')[:,:,2].astype(float);assert b.sum()==a.sum();out['models'][name]=metrics(b)
(root/'height-pigment-spatial-audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
