"""Whole native texture191 roles; primitive validators stay authoritative."""
from contextvars import ContextVar
import math,re
from independent_mask190 import component190,MODES,validate_mask190_portable
COMPONENT191=ContextVar('native_texture_component191',default=False)
APPLICATIONS=('multiply','subtract','darken','overlay','linearDodge','linearBurn','colorDodge','colorBurn','hardMixPhotoshop','hardMixSofterPhotoshop','height','linearHeight','heightPhotoshop','linearHeightPhotoshop')
def obj(v):return isinstance(v,dict)
def unit(v):return type(v)in(int,float)and math.isfinite(v)and 0<=v<=1
def asset(v):return isinstance(v,str)and re.fullmatch('asset:[a-f0-9]{64}',v)is not None
def smudge191_core(d):
 if not obj(d)or d.get('version')!=191 or d.get('model')!='mixer'or not obj(d.get('mixer'))or not obj(d.get('tip'))or not obj(d.get('behavior'))or d.get('paperInteraction')!=0 or 'wet'in d:return False
 m=d['mixer'];t=d['tip'];b=d['behavior']
 if m.get('load')!=0 or m.get('initialLoad')!=0 or b.get('wetMix')is not None:return False
 if'colorRateComposite'in m and b.get('rendering',{}).get('blendMode')!='normal':return False
 if m.get('colorRateComposite')=='erase'and(b.get('erase')is not True or m.get('load')!=0 or m.get('initialLoad')!=0 or m.get('strength')!=1 or'paintThickness'in m):return False
 if b.get('erase')is True and m.get('colorRateComposite')!='erase':return False
 if 'dual'in b or m.get('source')not in('previousCanvas','projectionCanvas')or set(m)-{'load','pickup','strength','initialLoad','smearAlpha','source','pickupDynamics','sampling','foreground','colorRateComposite','algorithm','paintThickness'}or any(not unit(m.get(k))for k in('load','pickup','strength'))or'initialLoad'in m and not unit(m['initialLoad'])or'smearAlpha'in m and type(m['smearAlpha'])is not bool:return False
 if 'algorithm'not in m:
  if'animation'in t or'timing'in b:
   from legacy_smudge_timing import legacy_smudge_timing_core
   return legacy_smudge_timing_core(d,'timing'in b,True)
  if t.get('kind')not in('round','procedural','bitmap')or any(k in t for k in('color','material','imageSampling','animation','autoNoise','autoShape'))or'paintThickness'in m:return False
  mode=m.get('colorRateComposite')
  if mode is not None and mode not in('multiply','screen','overlay','darken','lighten','add','subtract','dodge','burn','erase'):return False
  if mode is not None and mode not in('multiply','screen','erase')and(m['load']!=0 or m.get('initialLoad')!=0):return False
  if m['source']=='projectionCanvas'and'sampling'in m:return False
 else:
  def clock(x):
   if isinstance(x,dict):return x.get('control')=='time'or isinstance(x.get('randomSource'),dict)and x['randomSource'].get('kind')=='grafettoSourceTime-v1'or any(clock(v)for v in x.values())
   return isinstance(x,list)and any(clock(v)for v in x)
  if'timing'in b or clock(b)or clock(m):return False
  a=t.get('animation')
  if a is not None and(not isinstance(a,dict)or set(a)!={'mode','frames'}or a.get('mode')not in('random','incremental')or not isinstance(a.get('frames'),list)or not 2<=len(a['frames'])<=256):return False
  if m['algorithm']not in('krita-mask','krita-stamp')or t.get('kind')!='bitmap'or obj(t.get('animation'))and'geometry'in t['animation']:return False
  if 'colorRateComposite'in m and m['colorRateComposite']not in('hardMixPhotoshop','grainMerge','grainExtract','negation','erase'):return False
 return True

def texture191_scope(d):
 if not obj(d)or type(d.get('version'))is not int or d['version']!=191 or not obj(d.get('texture'))or not obj(d.get('behavior')):return False
 if any(k in d for k in('spray','bristle','sketch','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')):return False
 x=d['texture'];m=x.get('material')
 if not asset(x.get('id'))or not unit(x.get('strength'))or type(x.get('periodPx'))not in(int,float)or not math.isfinite(x['periodPx'])or not 1<=x['periodPx']<=8192:return False
 grid=x.get('patternSize')
 if not obj(grid)or any(type(grid.get(k))is not int or not 1<=grid[k]<=2048 for k in('width','height')):return False
 if m is not None:
  if not obj(m)or set(m)-{'kind','alpha','eraseAlpha'}or m.get('kind')not in('lightness','gradient')or not asset(m.get('alpha'))or'application'in x or ('eraseId'in x)!=('eraseAlpha'in m)or'eraseId'in x and(not asset(x['eraseId'])or not asset(m['eraseAlpha'])):return False
 else:
  a=x.get('application')
  if not obj(a)or set(a)!={'mode','soft'}or a['mode']not in APPLICATIONS or type(a['soft'])is not bool or'eraseId'in x and not asset(x['eraseId']):return False
 if d.get('model')=='mixer':return m is None and smudge191_core(d)
 if d.get('paperInteraction')!=0 or'wet'in d or not component190(d,True,191):return False
 dual=d['behavior'].get('dual')
 if dual is None:return True
 if not obj(dual)or set(dual)-{'brush','blendMode','sampling','sizePolicy'}or dual.get('sampling')!='independent'or dual.get('blendMode')not in MODES.values()or not component190(dual.get('brush'),False,191):return False
 size=dual.get('sizePolicy')
 return size is None or obj(size)and set(size)=={'kind','diameter'}and size.get('kind')=='resource'and type(size.get('diameter'))in(int,float)and math.isfinite(size['diameter'])and .01<=size['diameter']<=10000

def texture191_role(d,parent=None):
 root=parent if parent is not None else d
 return texture191_scope(root)and(d is root or root.get('behavior',{}).get('dual',{}).get('brush')is d)

def validate_texture191_primitives(t,sizes):
 def fail():raise ValueError('Invalid191 texture primitive')
 ref=lambda x:asset(x)and x in sizes
 if not obj(t)or set(t)-{'id','eraseId','periodPx','strength','application','patternSize','offset','material'}or not ref(t.get('id'))or not unit(t.get('strength'))or type(t.get('periodPx'))not in(int,float)or not math.isfinite(t['periodPx'])or not 1<=t['periodPx']<=8192:fail()
 g=t.get('patternSize');n=sizes[t['id']]
 if not obj(g)or set(g)!={'width','height'}or any(type(g[k])is not int or not 1<=g[k]<=n for k in g):fail()
 o=t.get('offset')
 if o is not None and(not obj(o)or set(o)!={'x','y','randomX','randomY'}or any(type(o[k])not in(int,float)or not math.isfinite(o[k])or not -8192<=o[k]<=8192 for k in('x','y'))or any(type(o[k])is not bool for k in('randomX','randomY'))):fail()
 m=t.get('material')
 if m is not None:
  if not obj(m)or set(m)-{'kind','alpha','eraseAlpha'}or m.get('kind')not in('lightness','gradient')or not ref(m.get('alpha'))or sizes[m['alpha']]!=n or'application'in t or('eraseId'in t)!=('eraseAlpha'in m):fail()
  if'eraseId'in t and(not ref(t['eraseId'])or not ref(m['eraseAlpha'])or sizes[t['eraseId']]!=n or sizes[m['eraseAlpha']]!=n):fail()
 else:
  a=t.get('application')
  if not obj(a)or set(a)!={'mode','soft'}or a['mode']not in APPLICATIONS or type(a['soft'])is not bool or'eraseId'in t and(not ref(t['eraseId'])or sizes[t['eraseId']]!=n):fail()

def validate_texture191_portable(d,sizes,profile,dynamics,parent=None):
 if not texture191_role(d,parent):raise ValueError('Invalid191 whole texture component role')
 validate_mask190_portable(d,sizes,profile,dynamics,parent,role_validator=texture191_role)
 if d.get('model')=='mixer':
  from convert import validate_portable_mixer
  validate_portable_mixer(d,texture191=True)
