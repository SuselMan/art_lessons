"""Deterministic same-world-ROI phase audit. No photo fitting, no GPU."""
import argparse,json,pathlib,numpy as np
ap=argparse.ArgumentParser();ap.add_argument('directory',type=pathlib.Path);ap.add_argument('inputs',type=pathlib.Path);ap.add_argument('--decode-scale',type=float,default=2);a=ap.parse_args();fixtures={c['id']:c for c in json.loads(a.inputs.read_text())['cases']};results=[]
for meta in a.directory.glob('*-phase-fields.json'):
 cid=meta.name.removesuffix('-phase-fields.json');d=json.loads(meta.read_text());frames=d['frames'];fs={(f['stage'],f['role']):f for f in frames};first=frames[0];w,h=first['width'],first['height'];S=first['mapping']['S'];m=first['mapping'];box=fixtures[cid]['box']
 def read(stage,role='pigment'):
  f=fs[stage,role];assert f['width']==w and f['height']==h and f['mapping']==m
  raw=np.fromfile(a.directory/f['file'],dtype=np.uint8).reshape(h,w,4);return raw[::-1].astype(np.float64)/255
 coverage=read('after-fine-before-brush','coverage')[...,3];mask=coverage>.05
 radius=int(np.ceil(4/S));eroded=mask.copy()
 for dy in range(-radius,radius+1):
  for dx in range(-radius,radius+1):
   if (dx*S)**2+(dy*S)**2>16:continue
   shifted=np.zeros_like(mask);ys=slice(max(0,dy),min(h,h+dy));xs=slice(max(0,dx),min(w,w+dx));shifted[ys,xs]=mask[slice(max(0,-dy),min(h,h-dy)),slice(max(0,-dx),min(w,w-dx))];eroded&=shifted
 x0=max(0,int(np.floor((box[0]-m['x0'])/S)));x1=min(w,int(np.ceil((box[2]-m['x0'])/S)));y0=max(0,int(np.floor((box[1]-m['y0'])/S)));y1=min(h,int(np.ceil((box[3]-m['y0'])/S)));common=eroded[y0:y1,x0:x1];assert common.sum()>=16,'Insufficient common eroded ROI'
 Y,X=np.indices(common.shape);design=np.column_stack([np.ones(common.sum()),X[common]*S,Y[common]*S]);window=np.outer(np.hanning(common.shape[0]),np.hanning(common.shape[1]))*common;freq=np.hypot(np.fft.fftfreq(common.shape[0],S)[:,None],np.fft.fftfreq(common.shape[1],S)[None,:]);stages={k:read(k) for k in ['source-input','after-carry','after-fine-before-brush','after-brush-stable']};stages['after-carry']=stages['after-carry']+read('after-carry','fixed');metrics=[]
 for stage,rgba in stages.items():
  physical=rgba*a.decode_scale;B=physical[...,2];roi=B[y0:y1,x0:x1];v=roi[common];coeff=np.linalg.lstsq(design,v,rcond=None)[0];plane=coeff[0]+coeff[1]*X*S+coeff[2]*Y*S;res=(roi-plane)*window;power=abs(np.fft.fft2(res))**2/(res.size**2);bands={}
  for label,lo,hi in [('4-12',1/12,1/4),('12-32',1/32,1/12),('32-96',1/96,1/32),('>96',0,1/96)]:bands[label]=float(power[(freq>lo)&(freq<=hi)].sum())
  metrics.append({'stage':stage,'meanB':float(v.mean()),'varianceB':float(v.var()),'detrendPlane':coeff.tolist(),'windowedResidualVariance':float((res**2).mean()),'radialPowerWorldWavelengthPx':bands,'fullFieldIntegralRGBA':(physical.sum(axis=(0,1))*S*S).tolist()})
 results.append({'case':cid,'decodeScale':a.decode_scale,'field':[w,h,S],'worldBox':box,'roiPixels':[x0,y0,x1,y1],'commonMaskCount':int(common.sum()),'mask':'One beforebrush coverageA>.05, eroded4worldpx, SAME allphases','spectrum':'Plane removed independently eachphase; identicalROI/mask/Hannwindow. AbsoluteFFTpower, no fit tophotos or rescalingofsource','afterCarry':'Mobile plus fixed, no clipping/rescaling duringCPU sum','metrics':metrics})
out={'cases':results,'scope':'Quantized physical fields; fullglobalintegrals distinguishROI shift fromloss; no exact floatmass conservation claim'};(a.directory/'frequency-audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'cases':len(results),'file':str(a.directory/'frequency-audit.json')}))
