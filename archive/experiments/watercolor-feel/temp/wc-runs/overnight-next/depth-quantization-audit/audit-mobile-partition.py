import pathlib,json,numpy as np,hashlib
root=pathlib.Path('temp/wc-runs/overnight-next/paired-phase-physical22-seven-rich-v2');d=json.loads((root/'s7-n3-phase-fields.json').read_text());fs={(f['stage'],f['role']):f for f in d['frames']}
def read(stage,role):
 f=fs[stage,role];b=(root/f['file']).read_bytes();assert hashlib.sha256(b).hexdigest()==f['sha256'];return np.frombuffer(b,dtype=np.uint8).reshape(-1,4).astype(int)
sourceP=read('source-input','pigment');sourceC=read('source-color','color');mobileP=read('after-split','pigment');mobileC=read('after-split','color');fixedP=sourceP-mobileP;fixedC=sourceC-mobileC
assert (fixedP>=0).all() and (fixedC>=0).all()
def audit(P,C):return {'physicalRGBoverA':(P[:,:3]>P[:,3,None]).sum(0).tolist(),'depthRGBoverB':(C[:,:3]>P[:,2,None]).sum(0).tolist(),'CAminusBnonzero':int((C[:,3]!=P[:,2]).sum()),'sumRGBA_P':P.sum(0).tolist(),'sumRGBA_C':C.sum(0).tolist()}
result={'source':audit(sourceP,sourceC),'mobile':audit(mobileP,mobileC),'inferredFixed':audit(fixedP,fixedC),'recombinedTotal':audit(mobileP+fixedP,mobileC+fixedC),'fixedInference':'Exact byte source-minus-splitMobile under mode1 k=-1 and no FIT scaling/clipping; must validate actualFixed snapshot before broader claims. No projection.'}
pathlib.Path('temp/wc-runs/overnight-next/depth-quantization-audit/mobile-partition-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
