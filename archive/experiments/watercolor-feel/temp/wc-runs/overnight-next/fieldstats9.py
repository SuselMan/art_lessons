import pathlib,json,numpy as np,hashlib
p=pathlib.Path(__file__).parent.parent/'search-round29'; inp=json.loads((p.parent/'overnight-2026-10-04/inputs.json').read_text()); inp['cases']=[c for c in inp['cases'] if c['id']=='s9-n3']; out=[]
for folder in ['baseline-probe','zero-probe']:
 for case in inp['cases']:
  cid=case['id'];meta=json.loads((p/folder/f'{cid}-composite-fields.json').read_text()); arrays={}
  for sampler in ['u_inkLoad','u_inkColor','u_strokeCoverage']:
   image=np.zeros((2480,3508,4),np.uint8)
   for key,size in meta.items():
    if not key.endswith('-'+sampler):continue
    x,y=map(int,key.split('-')[0].split('_'));w,h=size['width'],size['height'];a=np.fromfile(p/folder/f'{cid}-{key}.rgba',np.uint8).reshape(h,w,4)[::-1];hh=min(h,2480-y);ww=min(w,3508-x);image[y:y+hh,x:x+ww]=a[:hh,:ww]
   x0,y0,x1,y1=case['box'];arrays[sampler]=image[y0:y1,x0:x1].astype(float)/255
  ink=arrays['u_inkLoad'];depth=arrays['u_inkColor'];cov=arrays['u_strokeCoverage'];mask=(cov[:,:,0]>.2)&(ink[:,:,3]>.02);A=ink[:,:,3];B=np.minimum(ink[:,:,2],A);tau=4*depth[:,:,:3]/np.maximum(depth[:,:,3,None],1e-4); rows=[]
  for name,m in [('body',mask),('ordinary-film',mask&(A<.4)),('core',mask&(A>=.4))]:
   vals={key:np.quantile(a[m],[.1,.5,.9,.99]).tolist() if m.any() else [] for key,a in [('depositA',A),('pigmentMass',B),('tauMax',tau.max(2)),('opticalExponent85',tau.max(2)*B*.85/.54),('coverageA',cov[:,:,0])]};rows.append({'region':name,'pixels':int(m.sum()),'fractionBody':float(m.sum()/max(1,mask.sum())),'quantiles10_50_90_99':vals})
  out.append({'folder':folder,'case':cid,'fieldSHA':{k:hashlib.sha256(v.tobytes()).hexdigest() for k,v in arrays.items()},'regions':rows})
(p.parent/'overnight-next/field-statistics9.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
