"""Staged canonical-BEGIN Grid Wash metadata, not runtime source admission."""
import math

def _integer(v):return type(v)in(int,float)and math.isfinite(v)and int(v)==v

def grid_wash137_scope(d):
    obj=lambda v:isinstance(v,dict)
    num=lambda v,a,z:type(v)in(int,float)and math.isfinite(v)and a<=v<=z
    def unit(v):return isinstance(v,list)and len(v)>=2 and all(isinstance(p,list)and len(p)==2 and num(p[0],0,1)and type(p[1])in(int,float)and p[1]==1 for p in v)
    if not obj(d)or not all(obj(d.get(k))for k in('grid','tip','behavior','mixer')):return False
    g,t,b,m=(d[k]for k in('grid','tip','behavior','mixer'));r=b.get('rendering')
    return(_integer(d.get('version')) and d['version']>=137 and d.get('model')=='mixer'and num(d.get('paperInteraction'),0,0)
      and not set(g)-{'version','sourcePolicy','width','height','scale','offset','division','pressureDivision','border','randomBorder','shape','sampleInput','colorPerCell','randomOpacity','fillBackground','mixBackground','hsv'}
      and _integer(g.get('version')) and g['version']==1 and g.get('sourcePolicy')=='canonical-begin-v1'and num(g.get('width'),1,1024)and num(g.get('height'),1,1024)and num(g.get('scale'),.01,10)
      and _integer(g.get('division')) and 0<=g['division']<=16 and _integer(g.get('shape')) and g['shape']==1
      and isinstance(g.get('offset'),list)and len(g['offset'])==2 and all(num(v,-1e9,1e9)for v in g['offset'])and isinstance(g.get('border'),list)and len(g['border'])==2 and all(num(v,0,1000)for v in g['border'])
      and g.get('sampleInput')is True and all(g.get(k)is False for k in('pressureDivision','randomBorder','colorPerCell','randomOpacity'))and not any(k in g for k in('hsv','fillBackground','mixBackground'))
      and not any(k in d for k in('spray','sketch','bristle','curveTrace','hatching','particle','deform','experiment','filter','clone','mypaint','tangentNormal','wet','texture','scatter'))
      and not set(t)-{'kind','hardness','aspect','rotation','angle'}and t.get('kind')=='round'and num(t.get('hardness'),1,1)and num(t.get('aspect'),1,1)and t.get('rotation')=='fixed'and num(t.get('angle'),0,0)
      and not set(m)-{'load','initialLoad','pickup','strength','source'}and num(m.get('load'),0,0)and num(m.get('initialLoad'),0,0)and num(m.get('pickup'),1,1)and num(m.get('strength'),1,1)and m.get('source')=='previousCanvas'
      and num(d.get('flow'),1,1)and num(d.get('opacity'),1,1)and all(unit(d.get(k))for k in('sizeByPressure','flowByPressure','opacityByPressure'))
      and _integer(b.get('version')) and b['version']==2 and not set(b)-{'version','rendering'}and obj(r)and not set(r)-{'mode','blendMode','accumulation','wetEdges','burntEdges','burntEdgesMode','opacityCeiling'}
      and r.get('mode')=='buildUp'and r.get('blendMode')=='normal'and r.get('accumulation')=='alphaDarken'and num(r.get('wetEdges',0),0,0)and num(r.get('burntEdges',0),0,0)and r.get('burntEdgesMode','multiply')=='multiply'and r.get('opacityCeiling','uniform')=='uniform')

def validate_grid_wash137(d,parent=None):
    if not isinstance(d,dict):return
    g=d.get('grid');b=d.get('behavior');r=b.get('rendering')if isinstance(b,dict)else None
    if 'grid'in d and(isinstance(g,dict)and'sourcePolicy'in g or _integer(d.get('version')) and d['version']>=137 and isinstance(r,dict)and r.get('accumulation')=='alphaDarken'):
        if parent is not None or not grid_wash137_scope(d):raise ValueError('Grid Wash137 requires closed root canonical-BEGIN source policy')
