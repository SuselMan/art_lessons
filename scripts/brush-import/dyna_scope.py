"""Portable root admission for the bounded DynaDraw circle mode."""
import math
def dyna210_scope(v):
    obj=lambda x:isinstance(x,dict)
    def n(x,a,b):return type(x)in(int,float) and math.isfinite(x) and a<=x<=b
    def one(x):return isinstance(x,list)and len(x)>=2 and all(isinstance(p,list)and len(p)==2 and n(p[0],0,1)and type(p[1])in(int,float)and p[1]==1 for p in x)
    if not obj(v)or v.get('version')!=210 or not all(obj(v.get(k))for k in ('dyna','tip','behavior')):return False
    d,t,b=v['dyna'],v['tip'],v['behavior'];r=b.get('rendering')
    return (set(d)=={'version','mass','drag','diameter'} and d['version']==1 and n(d['mass'],0,1)and n(d['drag'],0,1)and type(d['diameter'])is int and 3<=d['diameter']<=32
      and v.get('model')=='stamp'and v.get('paperInteraction')==0 and v.get('flow')==1 and v.get('opacity')==1 and all(one(v.get(k))for k in ('sizeByPressure','flowByPressure','opacityByPressure'))
      and not any(k in v for k in ('mixer','wet','texture','scatter','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'))
      and t=={'kind':'round','hardness':1,'aspect':1,'rotation':'fixed','angle':0} and b.get('version')==2 and not set(b)-{'version','rendering'} and obj(r)and r=={'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'})
