import json,numpy as np,sys
from pathlib import Path
from PIL import Image,ImageDraw
p=Path(sys.argv[1]);report=json.load(open(p/'report.json'));results=[];panels=[]
for row in report:
 snaps={s['label']:s for s in row['snapshots']}
 def read(label):
  s=snaps[label];return np.fromfile(p/(row['name']+'-'+label+'.raw'),np.uint8).reshape(s['h'],s['w'])
 pre=read('pre-front');mask=pre>1;mass=pre.sum();result={'name':row['name'],'initial_mobile_mass_codes':int(mass),'source_pixels':int(mask.sum())}
 for label in ['pre-carry','post-carry','pre-diffuse','post-diffuse-1','post-diffuse-7','post-diffuse-12']:
  if label not in snaps:continue
  a=read(label);result[label]={'mass_codes':int(a.sum()),'outside_source_fraction':float(a[~mask].sum()/max(1,mass)),'source_mean':float(a[mask].mean())}
 if 'pre-diffuse' in snaps:
  a=read('pre-diffuse');cov=read('diffuse-coverage-a');den=2*a.astype(float)/np.maximum(cov,1);live=a>1
  result['density_quantiles']=list(np.quantile(den[live],[.1,.5,.9]));result['diffusion_viscosity_factor_quantiles']=list(np.quantile(1/(1+8*den[live]**2),[.1,.5,.9]))
  if 'pre-diffuse-pigment' in snaps:
   physical=2*read('pre-diffuse-pigment').astype(float)/np.maximum(cov,1);result['physical_density_quantiles']=list(np.quantile(physical[live],[.1,.5,.9]));result['physical_viscosity_factor_quantiles']=list(np.quantile(1/(1+8*physical[live]**2),[.1,.5,.9]))
 if 'cost' in snaps:
  cost=read('cost');eligible=np.zeros(cost.shape,bool);band=row['carryMeta'][0]['band']*255
  for stride in set(int(m['stride']) for m in row['carryMeta']):
   for dy,dx in [(0,stride),(0,-stride),(stride,0),(-stride,0)]:
    other=np.roll(cost,(-dy,-dx),(0,1));e=(other>cost)&(other<=band)
    if dy>0:e[-dy:]=False
    if dy<0:e[:-dy]=False
    if dx>0:e[:,-dx:]=False
    if dx<0:e[:,:-dx]=False
    eligible|=e
  result['source_cells_without_any_outward_neighbor_fraction']=float((~eligible[mask]).mean());result['carryMeta']=row['carryMeta']
 labels=[l for l in ['pre-front','cost','post-carry','post-diffuse-12'] if l in snaps];tile=Image.new('RGB',(1000,285),'white');draw=ImageDraw.Draw(tile);draw.text((3,3),row['name'],fill='black')
 for k,l in enumerate(labels):
  a=read(l);im=Image.fromarray(np.flipud(a));im=im.point(lambda v:255-v).convert('RGB');im.thumbnail((245,245));tile.paste(im,(k*250,30));draw.text((k*250,17),l,fill='black')
 panels.append(tile);results.append(result)
canvas=Image.new('RGB',(1000,285*len(panels)),'white')
for i,im in enumerate(panels):canvas.paste(im,(0,i*285))
canvas.save(p/'stages.jpg');json.dump(results,open(p/'metrics.json','w'),indent=2)
print(json.dumps(results,indent=2))
