import json,numpy as np
from pathlib import Path
p=Path('/home/suselman/projects/pencil-agents/680-solvent-field/temp/solvent/first');rows=json.load(open(p/'report.json'));out=[]
for r in rows:
 if not r['variant'].startswith('V-'):continue
 fields=r['fields']
 for prefix in sorted({k.rsplit('-',1)[0] for k in fields if k.endswith('-solventLoad')}):
  def read(name):
   k=prefix+'-'+name;m=fields[k];return np.fromfile(p/(r['variant']+'-'+k+'.rgba'),np.uint8).reshape(m['h'],m['w'],4)/255
  v=read('solventLoad')[...,3]*4;base=read('solventBase')[...,3]*4;stroke=read('strokeSolvent')[...,3]*4;pigment=read('inkLoad');delta=v-base
  out.append(dict(variant=r['variant'],stage=prefix,volume=float(v.sum()),base=float(base.sum()),stroke=float(stroke.sum()),head_sum=float(delta.sum()),negative_head_count=int((delta<0).sum()),max_volume=float(v.max()),add_clamp_error=float(np.max(np.abs(v-np.minimum(base+stroke,4)))),p_sums=pigment.sum((0,1)).tolist(),p_strength_max=float(pigment[...,2].max()),head_pixels=int((delta>1e-8).sum())))
json.dump(out,open('temp/spiral/actual-solvent/inventory.json','w'),indent=2)
for r in out:print(r['variant'],r['stage'],'V',round(r['volume'],2),'head',round(r['head_sum'],2),'negative',r['negative_head_count'],'addError',r['add_clamp_error'])
