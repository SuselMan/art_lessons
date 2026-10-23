"""Read-only paired P/depth audit; require cached PNG identity, never infer colour conservation from fine stages."""
import argparse, hashlib, json, pathlib
import numpy as np
ap=argparse.ArgumentParser();ap.add_argument('directory',type=pathlib.Path);ap.add_argument('inputs',type=pathlib.Path);ap.add_argument('--expected-png-directory',required=True,type=pathlib.Path);a=ap.parse_args()
fixtures={c['id']:c for c in json.loads(a.inputs.read_text())['cases']};out=[]
for path in sorted(a.directory.glob('*-phase-fields.json')):
 cid=path.name.removesuffix('-phase-fields.json'); meta=json.loads(path.read_text());frames=meta['frames'];first=frames[0];m=first['mapping'];w,h=first['width'],first['height'];S=m['S'];fs={(f['stage'],f['role']):f for f in frames}
 png=a.directory/(cid+'.png');expected=a.expected_png_directory/(cid+'.png');assert png.read_bytes()==expected.read_bytes(), 'PNG instrumentation mismatch '+cid
 def read(stage,role):
  f=fs[stage,role];assert f['mapping']==m and (f['width'],f['height'])==(w,h) and f['orientation']=='GLbottomup'
  data=(a.directory/f['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==f['sha256'] and len(data)==w*h*4
  return np.frombuffer(data,dtype=np.uint8).reshape(h,w,4)[::-1].copy()
 cover=read('after-fine-before-brush','coverage')[...,3]/255;mask=cover>.05;box=fixtures[cid]['box'];yy,xx=np.indices((h,w));mask &= (xx*S+m['x0']>=box[0])&(xx*S+m['x0']<box[2])&(yy*S+m['y0']>=box[1])&(yy*S+m['y0']<box[3]);assert mask.any()
 metrics=[];paired={}
 for stage in ['after-fine-before-brush','after-brush-stable']:
  pr=read(stage,'pigment');cr=read(stage,'color');P=pr.astype(float)*2/255;D=cr[...,:3].astype(float)*8/255;B=P[...,2];support=mask&(B>0);tau=np.divide(D,B[...,None],out=np.zeros_like(D),where=B[...,None]>0)
  metrics.append({'stage':stage,'globalIntegralP_RGBA':(P.sum((0,1))*S*S).tolist(),'globalIntegralDepthRGB':(D.sum((0,1))*S*S).tolist(),'commonMaskCount':int(mask.sum()),'commonBIntegral':float(B[mask].sum()*S*S),'commonDepthIntegral':(D[mask].sum(0)*S*S).tolist(),'massWeightedTauRGB':(D[support].sum(0)/B[support].sum()).tolist() if support.any() else None,'encodedInputConeViolationsPhysicalRGBoverA':(pr[...,:3].astype(int)>pr[...,3,None].astype(int)).sum((0,1)).tolist(),'encodedInputConeViolationsColorRGBAoverPhysicalA':(cr.astype(int)>pr[...,3,None].astype(int)).sum((0,1)).tolist(),'encodedInputColorAlphaVsPigmentBMaxCodes':int(np.abs(cr[...,3].astype(int)-pr[...,2].astype(int)).max()),'saturatedBytesP_RGBA':(pr==255).sum((0,1)).tolist(),'saturatedBytesDepthRGB':(cr[...,:3]==255).sum((0,1)).tolist(),'positivePigmentZeroDepthPixelsRGB':((pr[...,2,None]>0)&(cr[...,:3]==0)&mask[...,None]).sum((0,1)).tolist()});paired[stage]=(pr,cr)
 p0,c0=paired['after-fine-before-brush'];p1,c1=paired['after-brush-stable'];possible=((p1[...,2]>0)&(p0[...,2]>0)&mask)[...,None]&(c0[...,:3]>0)&(c1[...,:3]==0)
 out.append({'case':cid,'mapping':m,'pngSHA256':hashlib.sha256(png.read_bytes()).hexdigest(),'metrics':metrics,'possibleSubcodeDepthDisappearanceRGB':possible.sum((0,1)).tolist(),'warning':'Zero byte is observable; subcode flux cannot be reconstructed from snapshots. D/P drift is not proof of colour conservation or loss across fine diffusion. Brush global integrals are paired quantization diagnostics.'})
(a.directory/'paired-audit.json').write_text(json.dumps({'cases':out,'decodePhysical':2,'decodeDepth':8,'mask':'Fixed beforebrush coverageA>.05 intersect same fixture world ROI'},indent=2)+'\n');print(json.dumps({'cases':len(out)}))
