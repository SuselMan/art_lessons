"""Closed new static Pixel gradient/Wash; old97/100 paths are not reinterpreted."""
import math,re

def pixel_gradient_wash138_scope(d):
 def obj(v):return isinstance(v,dict)
 def asset(v):return isinstance(v,str)and re.fullmatch(r'asset:[a-f0-9]{64}',v)is not None
 def zero(v):return type(v)in(int,float)and math.isfinite(v)and v==0
 def integral(v):return type(v)in(int,float)and math.isfinite(v)and v==math.trunc(v)
 if not obj(d)or not obj(d.get('tip'))or not obj(d.get('behavior')):return False
 t=d['tip'];b=d['behavior'];c=t.get('color');r=b.get('rendering')
 if not obj(c)or set(c)!={'gradient'}or not obj(c['gradient']):return False
 g=c['gradient']
 return (integral(d.get('version'))and d['version']>=138 and d.get('model')=='stamp'and type(d.get('paperInteraction'))in(int,float)and d['paperInteraction']==0
  and not any(k in d for k in('mypaint','clone','filter','deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','mixer','wet','texture','scatter','tangentNormal'))
  and t.get('kind')=='bitmap'and asset(t.get('mask'))and not set(t)-{'kind','mask','maskBounds','hardness','aspect','rotation','angle','color'}
  and not set(g)-{'gray','sampling'}and asset(g.get('gray'))and g.get('sampling')=='filteredGray-v1'
  and integral(b.get('version'))and b['version']==2 and not set(b)-{'version','speedInput','rendering','spacing','rotation','mirror','modulations','dynamics','strokeInput'}
  and ('modulations'not in b or obj(b['modulations'])and not set(b['modulations'])-{'size','opacity','angle'})
  and ('dynamics'not in b or obj(b['dynamics'])and not set(b['dynamics'])-{'size','opacity','angle'})
  and ('strokeInput'not in b or obj(b['strokeInput'])and 'fanCorners'not in b['strokeInput'])
  and obj(r)and r.get('mode')=='buildUp'and r.get('blendMode')=='normal'and r.get('accumulation')=='alphaDarken'and zero(r.get('wetEdges',0))and zero(r.get('burntEdges',0)) and not r.get('gammaCorrect')and not r.get('luminance'))
