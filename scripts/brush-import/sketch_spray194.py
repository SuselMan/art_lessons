"""Whole native Sketch/Spray admission, never a public component capability."""
from contextvars import ContextVar
import math
from color_smudge193 import BLENDS,NATIVE_MODES as SMUDGE_MODES
COMPONENT194=ContextVar('native_sketch_spray194',default=False)
COMPOSITES=(*BLENDS,'copy','grainMerge','grainExtract','negation')
# Parallel is implemented only by the Smudge193 path, not Sketch/Spray194.
NATIVE_MODES={**{key:value for key,value in SMUDGE_MODES.items() if value!='parallel'},'copy':'copy'}
def scope194(d,*,clock195=False):
 obj=lambda v:isinstance(v,dict)
 if not obj(d)or type(d.get('version'))is not int or d['version']!=(195 if clock195 else 194) or d.get('model')!='stamp'or d.get('paperInteraction')!=0:return False
 if any(k in d for k in('mixer','wet','texture','scatter','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')):return False
 t,b=d.get('tip'),d.get('behavior')
 if not obj(t)or not obj(b)or t.get('kind')not in('round','procedural','bitmap')or'alphaThreshold'in t:return False
 if set(b)-({'timing'}if clock195 else set())-{'version','rendering','spacing','rotation','strokeInput','speedInput','sequentialRandom','clockRead','dynamics','modulations','erase','falloff','colorAdjustment'}or b.get('version')!=2:return False
 r=b.get('rendering')
 if not obj(r)or r.get('mode')!='buildUp'or r.get('blendMode')!='normal'or r.get('accumulation')not in('directOver','alphaDarken')or r.get('wetEdges',0)!=0 or r.get('burntEdges',0)!=0 or r.get('gammaCorrect')is True or r.get('luminance')is True:return False
 if d.get('flow')!=1 or d.get('flowPer')!='stamp':return False
 flat=d.get('flowByPressure')
 if not isinstance(flat,list)or len(flat)<2 or any(not isinstance(p,list)or len(p)!=2 or type(p[0])not in(int,float)or not math.isfinite(p[0])or not 0<=p[0]<=1 or type(p[1])not in(int,float)or p[1]!=1 for p in flat):return False
 if any(obj(b.get(k))and set(b[k])-{'size','angle','opacity'}for k in('dynamics','modulations')):return False
 if 'sourceGeometry'in t:
  g=t['sourceGeometry']
  if t.get('kind')!='bitmap'or'animation'in t or'imageSampling'in t or not obj(g)or set(g)!={'version','width','height'}or type(g.get('version'))is not int or g['version']!=1 or any(type(g.get(k))is not int or not 1<=g[k]<=2048 for k in('width','height')):return False
 if ('sketch'in d)==('spray'in d):return False
 family=d.get('sketch',d.get('spray'))
 if not obj(family)or family.get('composite')not in COMPOSITES:return False
 if b.get('erase')is True and family['composite']!='normal':return False
 if 'sketch'in d:
  allowed={'version','mode','maskSignal','maskSize','composite','width','offset','probability','connect','magnetify','randomRGB','randomOpacity','distanceDensity','distanceOpacity','distanceOpacityPolicy','antialias','dynamics'}
  if set(family)-allowed or family.get('version')!=1:return False
  for k,lo,hi in[('width',.01,1000),('offset',-10,10),('probability',0,1)]:
   v=family.get(k)
   if type(v)not in(int,float)or not math.isfinite(v)or not lo<=v<=hi:return False
  if any(type(family.get(k))is not bool for k in('connect','magnetify','randomRGB','randomOpacity','distanceDensity','distanceOpacity','antialias')):return False
  if 'dynamics'in family and(not obj(family['dynamics'])or set(family['dynamics'])-{'width','offset','probability'}or any(not isinstance(v,list)or len(v)>4 for v in family['dynamics'].values())):return False
  if family.get('mode')=='simple':return 'maskSignal'not in family and'maskSize'not in family and t.get('kind')=='round'and t.get('hardness')==1 and t.get('aspect')==1 and t.get('angle')==0 and t.get('rotation')=='fixed'and not set(t)-{'kind','hardness','aspect','angle','rotation'}
  if family.get('mode')!='mask'or family.get('maskSignal')!='native-dab-v1':return False
  if family['distanceOpacity']and family.get('distanceOpacityPolicy')!='generic-clamp-v1'or not family['distanceOpacity']and'distanceOpacityPolicy'in family:return False
  if 'maskSize'in family and(not isinstance(family['maskSize'],list)or len(family['maskSize'])!=2 or any(type(n)is not int or not 1<=n<=2048 for n in family['maskSize'])):return False
  if 'dynamics'in family and(not obj(family['dynamics'])or set(family['dynamics'])-{'width','offset','probability'}or any(not isinstance(v,list)for v in family['dynamics'].values())):return False
  if t.get('kind')!='bitmap':return 'maskSize'not in family and not any(k in t for k in('color','material','animation'))
  if 'animation'in t and(not obj(t['animation'])or not obj(t['animation'].get('geometry')))and'maskSize'not in family:return False
  if 'animation'not in t:
   if 'maskSize'not in family:return False
   if 'sourceGeometry'in t and family['maskSize']!=[t['sourceGeometry']['width'],t['sourceGeometry']['height']]:return False
  return True
 from spray_wash133 import _spray133_metadata
 metadata={k:v for k,v in family.items()if k!='composite'};color=metadata.get('color')
 if not obj(color):return False
 if color.get('sourcePolicy')not in(None,'canonical-begin-v1')or 'sourcePolicy'in color and color.get('sampleInput')is not True:return False
 metadata['color']={k:v for k,v in color.items()if k not in('sourcePolicy','sampleInput','mixBackground','fillBackground')}
 if any(k in color and color[k]is not True for k in('sampleInput','mixBackground','fillBackground')):return False
 # The old metadata primitive intentionally excludes Shape4. Validate the same
 # particle schema after checking its one IMAGE flag, without a descriptor proxy.
 p=metadata.get('particle')
 if not obj(p)or'image'in p and p['image']is not True:return False
 metadata['particle']={k:v for k,v in p.items()if k!='image'}
 return _spray133_metadata(metadata)
def validate194(d,parent=None):
 if parent is not None or not scope194(d):raise ValueError('Sketch/Spray194 requires complete native whole-role scope')
def validate194_portable(d,sizes,profile,dynamics,parent=None):
 validate194(d,parent)
 from independent_mask190 import validate_mask190_portable
 validate_mask190_portable(d,sizes,lambda node,**kw:profile(node,parent=parent,sketchSpray194=True),dynamics,parent,role_validator=lambda node,p:node is d and p is None)
 if 'sketch'in d:
  for values in d['sketch'].get('dynamics',{}).values():dynamics(values)
