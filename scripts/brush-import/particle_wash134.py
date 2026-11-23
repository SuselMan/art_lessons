"""Closed request-level Particle Wash. No wire/source/resource reads."""
import math
def particle_wash134_scope(d):
    if not isinstance(d,dict):return False
    b=d.get('behavior');t=d.get('tip');p=d.get('particle')
    if not all(isinstance(v,dict)for v in(b,t,p)):return False
    r=b.get('rendering')
    if 'timing'in b:
        from particle_timer157 import particle_timer157_scope
        return type(d.get('version'))is int and d['version']>=166 and isinstance(r,dict)and r.get('accumulation')=='alphaDarken'and particle_timer157_scope(d)
    def one(v):return isinstance(v,list)and len(v)>=2 and all(isinstance(x,list)and len(x)==2 and type(x[0])in(int,float)and math.isfinite(x[0])and 0<=x[0]<=1 and type(x[1])in(int,float)and x[1]==1 for x in v)
    def num(v,a,z):return type(v)in(int,float)and math.isfinite(v)and a<=v<=z
    return(type(d.get('version'))is int and d['version']>=134 and d.get('model')=='stamp'and num(d.get('paperInteraction'),0,0)and num(d.get('flow'),1,1) and one(d.get('flowByPressure'))and one(d.get('opacityByPressure'))
      and not any(k in d for k in('mixer','spray','bristle','sketch','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet','screentonePx'))
      and t.get('kind')=='round'and num(t.get('aspect'),1,1)and num(t.get('hardness'),1,1) and t.get('rotation')=='fixed'and num(t.get('angle'),0,0) and not set(t)-{'kind','hardness','aspect','rotation','angle'}
      and b.get('version')==2 and not set(b)-{'version','rendering'}and isinstance(r,dict)and r.get('mode')=='buildUp'and r.get('blendMode')=='normal'and r.get('accumulation')=='alphaDarken'and num(r.get('wetEdges',0),0,0)and num(r.get('burntEdges',0),0,0) and not r.get('gammaCorrect')and not r.get('luminance')
      and type(p.get('version'))is int and p.get('version')==1 and type(p.get('count'))is int and 1<=p['count']<=500 and type(p.get('iterations'))is int and 1<=p['iterations']<=300 and p['count']*p['iterations']<=16384 and num(p.get('gravity'),0,1)and num(p.get('weight'),0,1)and num(p.get('scaleX'),0,2)and num(p.get('scaleY'),0,2)and not set(p)-{'version','count','iterations','gravity','weight','scaleX','scaleY'})
def validate_particle_wash134(d,parent=None):
    if isinstance(d,dict)and 'particle'in d:
        b=d.get('behavior');r=b.get('rendering')if isinstance(b,dict)else None
        if isinstance(r,dict)and r.get('accumulation')=='alphaDarken'and(parent is not None or not particle_wash134_scope(d)):raise ValueError('Particle Wash134 requires closed root request scope')
