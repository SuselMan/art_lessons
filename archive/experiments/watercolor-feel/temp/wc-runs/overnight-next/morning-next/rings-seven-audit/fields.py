import pathlib,numpy as np,json
from PIL import Image,ImageDraw,ImageFilter
r=pathlib.Path('temp/wc-runs/overnight-next');o=r/'morning-next/rings-seven-audit';src=r/'calibrated-pool-combo-five';W,H=368,200;X,Y=np.meshgrid(np.arange(946,1314),np.arange(574,774));arrays={}
for name in ['u_inkLoad','u_inkColor','u_strokeCoverage']:
 a=np.zeros((H,W,4),float)
 for origin in [0,1024]:
  raw=np.fromfile(src/f's7-n3-{origin}_0-{name}.rgba',np.uint8).reshape(1024,1024,4);sel=(X>=origin)&(X<origin+1024);a[sel]=raw[(1023-Y[sel]),X[sel]-origin]
 arrays[name]=a
P,C,K=[arrays[n] for n in ['u_inkLoad','u_inkColor','u_strokeCoverage']];mask=K[:,:,3]>240;views=[('P.B',P[:,:,2]/255),('P.A',P[:,:,3]/255),('P.R/P.A',np.divide(P[:,:,0],P[:,:,3],out=np.zeros_like(mask,float),where=P[:,:,3]>0)),('C.G/P.B',np.divide(C[:,:,1],P[:,:,2],out=np.zeros_like(mask,float),where=P[:,:,2]>0)),('coverage.R/A',np.divide(K[:,:,0],K[:,:,3],out=np.zeros_like(mask,float),where=K[:,:,3]>0)),('coverage.B',K[:,:,2]/255)]
panel=Image.new('RGB',(W*3,H*2+50),'white');d=ImageDraw.Draw(panel);stats=[]
for i,(label,v) in enumerate(views):
 v=np.minimum(1,np.maximum(0,v));im=Image.fromarray(np.uint8(np.rint(v*255)));panel.paste(im.convert('RGB'),((i%3)*W,(i//3)*(H+25)+25));d.text(((i%3)*W+4,(i//3)*(H+25)+4),label+' scale0..1',fill='black');stats.append(dict(field=label,interiorMin=float(v[mask].min()),interiorMax=float(v[mask].max()),interiorStd=float(v[mask].std())))
panel.save(o/'source45-composite-fields.png');(o/'field-stats.json').write_text(json.dumps(stats,indent=2))
