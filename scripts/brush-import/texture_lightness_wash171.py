"""Static opaque foreground Texture LIGHTNESS->Wash, no new source channel."""
import math,re
from texture_strength_wash183 import texture_strength183_control

def texture_lightness_wash171_scope(v):
 def obj(x):return isinstance(x,dict)
 def asset(x):return isinstance(x,str)and re.fullmatch(r'asset:[a-f0-9]{64}',x)is not None
 def integral(x):return type(x)in(int,float)and math.isfinite(x)and x==math.trunc(x)
 if not obj(v)or not integral(v.get('version'))or v['version']<171 or v.get('model')!='stamp'or type(v.get('paperInteraction'))not in(int,float)or v['paperInteraction']!=0 or not obj(v.get('tip'))or not obj(v.get('texture'))or not obj(v.get('behavior')):return False
 t=v['tip'];x=v['texture'];b=v['behavior'];r=b.get('rendering');m=x.get('material')
 grid=x.get('patternSize')
 if any(type(x.get(k))not in(int,float)or not math.isfinite(x[k])or not low<=x[k]<=high for k,low,high in(('strength',0,1),('periodPx',1,8192)))or not obj(grid)or any(not integral(grid.get(k))or not 1<=grid[k]<=2048 for k in('width','height')):return False
 if t.get('kind')!='bitmap'or not asset(t.get('mask'))or set(t)-{'kind','mask','maskBounds','hardness','aspect','rotation','angle'}or not obj(m)or set(m)-{'kind','alpha'}or m.get('kind')!='lightness'or not asset(m.get('alpha'))or not asset(x.get('id'))or 'application'in x or 'eraseId'in x:return False
 if any(k in v for k in('mixer','spray','bristle','sketch','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal','wet','scatter')):return False
 if not integral(b.get('version'))or b['version']!=2 or set(b)-{'version','rendering','spacing','speedInput','dynamics','modulations'}or not obj(r)or r.get('mode')!='buildUp'or r.get('blendMode')!='normal'or r.get('accumulation')!='alphaDarken'or r.get('wetEdges',0)!=0 or r.get('burntEdges',0)!=0 or r.get('gammaCorrect')or r.get('luminance'):return False
 def leaf(c):return obj(c)and isinstance(c.get('control'),str)and c['control']in('pressure','off')and c.get('jitter')==0 and 'combine'not in c
 for key in('dynamics','modulations'):
  cs=b.get(key,{})
  if not obj(cs):return False
  for target,c in cs.items():
   values=c if key=='modulations'else[c]
   if target not in('size','opacity','flow','grainDepth')or not isinstance(values,list)or not all(texture_strength183_control(a)if target=='grainDepth'and v['version']>=183 else leaf(a)for a in values):return False
 if v['version']>=183:
  ds=b.get('dynamics',{});ms=b.get('modulations',{});controls=([ds['grainDepth']]if 'grainDepth'in ds else[])+ms.get('grainDepth',[]);combined=[c for c in controls if isinstance(c,dict)and 'combine'in c]
  if combined and(len(controls)!=1 or combined[0]['combine'].get('constant',1)!=x['strength']):return False
 return True

def validate_texture_lightness_wash171(v,parent=None):
 if not isinstance(v,dict):return
 t=v.get('texture');b=v.get('behavior');m=t.get('material')if isinstance(t,dict)else None;r=b.get('rendering')if isinstance(b,dict)else None
 if isinstance(m,dict)and m.get('kind')=='lightness'and isinstance(r,dict)and r.get('accumulation')=='alphaDarken'and(parent is not None or not texture_lightness_wash171_scope(v)):raise ValueError('Texture Lightness Wash171 requires closed root static MASK Pixel')
