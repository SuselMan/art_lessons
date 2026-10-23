from pathlib import Path
import hashlib,json
p=Path('temp/spiral/marker-resweep');rows=json.load(open(p/'metrics.json'));result=[]
for shape in ['spiral','blob']:
 names=[shape+'-marker-off',shape+'-marker-on'];r=[next(x for x in rows if x['name']==n) for n in names]
 def sha(name,label):return hashlib.sha256((p/(name+'-'+label+'.raw')).read_bytes()).hexdigest()
 initial={label:sha(names[0],label)==sha(names[1],label) for label in ['pre-front','pre-carry','cost','coverage-a','coverage-water']}
 png=[hashlib.sha256((p/(n+'.png')).read_bytes()).hexdigest() for n in names]
 result.append(dict(shape=shape,initial_same=initial,png_same=png[0]==png[1],png_sha=png,stats=[dict(name=x['name'],initial=x['initial_mobile_mass_codes'],carry_outside=x['post-carry']['outside_source_fraction'],coarse_outside=x['post-diffuse-7']['outside_source_fraction'],carry_alpha_loss=1-x['post-carry']['mass_codes']/x['initial_mobile_mass_codes']) for x in r]))
json.dump(result,open(p/'pairs.json','w'),indent=2);print(json.dumps(result,indent=2))
