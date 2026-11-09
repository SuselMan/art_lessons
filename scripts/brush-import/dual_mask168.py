"""Native41bef hard-mix-softer MASK ALPHA only. No RGB/layer mode widening."""
import math,re
def pixel_alpha_dual168_scope(v):
 if not isinstance(v,dict)or type(v.get('version'))is not int or v['version']<168 or not isinstance(v.get('behavior'),dict):return False
 dual=v['behavior'].get('dual')
 if not isinstance(dual,dict)or set(dual)-{'brush','blendMode','sampling'}or dual.get('blendMode')!='hardMixSofterPhotoshop'or dual.get('sampling')!='independent'or not isinstance(dual.get('brush'),dict):return False
 families=('mixer','spray','bristle','sketch','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal','texture','wet','scatter')
 def leaf(c):return isinstance(c,dict)and c.get('control')in('pressure','off')and c.get('jitter')==0 and 'combine'not in c
 def ordinary(d,secondary=False):
  if d.get('model')!='stamp'or d.get('paperInteraction')!=0 or any(k in d for k in families)or not isinstance(d.get('tip'),dict)or not isinstance(d.get('behavior'),dict):return False
  t=d['tip'];b=d['behavior'];r=b.get('rendering')
  if set(b)-({'version','rendering','spacing','speedInput','dynamics','modulations'}|({'dual'}if not secondary else set()))or b.get('version')!=2 or not isinstance(r,dict)or r.get('mode')!='buildUp'or r.get('blendMode')!='normal'or r.get('accumulation')not in(('directOver','alphaDarken')if secondary else('directOver',))or r.get('wetEdges',0)!=0 or r.get('burntEdges',0)!=0 or r.get('gammaCorrect')or r.get('luminance'):return False
  from convert import validate_portable_dynamics
  for key in('dynamics','modulations'):
   controls=b.get(key,{})
   if not isinstance(controls,dict):return False
   for target,c in controls.items():
    cs=c if key=='modulations'else[c]
    if target not in('size','opacity','flow','roundness')or not isinstance(cs,list)or not all(leaf(x)for x in cs):return False
    try:validate_portable_dynamics(cs)
    except ValueError:return False
  if set(t)-{'kind','mask','maskBounds','hardness','aspect','rotation','angle','imageSampling','profile'}:return False
  if t.get('kind')=='bitmap':return isinstance(t.get('mask'),str)and re.fullmatch(r'asset:[a-f0-9]{64}',t['mask'])is not None and 'profile'not in t
  if t.get('kind')=='round':return 'profile'not in t and 'mask'not in t
  profile=t.get('profile');return t.get('kind')=='procedural'and isinstance(profile,dict)and profile.get('kind')=='standard'and profile.get('shape')=='ellipse'and 'mask'not in t
 return ordinary(v)and ordinary(dual['brush'],True)
def validate_pixel_alpha_dual168(v,parent=None):
 b=v.get('behavior')if isinstance(v,dict)else None;d=b.get('dual')if isinstance(b,dict)else None
 if isinstance(d,dict)and d.get('blendMode')=='hardMixSofterPhotoshop'and(parent is not None or not pixel_alpha_dual168_scope(v)):raise ValueError('Pixel alpha dual168 requires closed root ordinary mask components')
