"""Closed no-ink AA additive Bristle request Wash. No source/GL reads."""
import math

def bristle_wash135_scope(d):
    obj=lambda v:isinstance(v,dict)
    num=lambda v,a,z:type(v)in(int,float)and math.isfinite(v)and a<=v<=z
    def one(v):return isinstance(v,list)and len(v)>=2 and all(isinstance(p,list)and len(p)==2 and num(p[0],0,1)and type(p[1])in(int,float)and p[1]==1 for p in v)
    if not obj(d):return False
    b=d.get('behavior');t=d.get('tip');h=d.get('bristle')
    if not all(obj(v)for v in(b,t,h)):return False
    r=b.get('rendering');m=b.get('modulations');si=b.get('strokeInput')
    return(type(d.get('version'))is int and d['version']>=135 and d.get('model')=='stamp'and num(d.get('paperInteraction'),0,0)and num(d.get('flow'),1,1)and one(d.get('flowByPressure'))
      and type(h.get('version'))is int and h['version']==1 and h.get('antialias')is True and h.get('compositing') is (d.get('version')==203)
      and set(h)=={'version','hairs','scale','shear','random','mousePressure','threshold','connected','antialias','compositing'}
      and isinstance(h.get('hairs'),list)and 1<=len(h['hairs'])<=4096 and all(isinstance(v,list)and len(v)==3 and num(v[0],-.5,.5)and num(v[1],-.5,.5)and num(v[2],0,1)for v in h['hairs'])
      and num(h.get('scale'),0,10)and num(h.get('shear'),-10,10)and num(h.get('random'),0,100)and all(type(h.get(k))is bool for k in('mousePressure','threshold','connected'))
      and not any(k in d for k in('mixer','spray','particle','sketch','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet','screentonePx','colorAdjustment'))
      and set(t)=={'kind','aspect','hardness','rotation','angle'}and t.get('kind')=='round'and num(t.get('aspect'),1,1)and num(t.get('hardness'),1,1)and t.get('rotation')=='fixed'and num(t.get('angle'),0,0)
      and b.get('version')==2 and not set(b)-{'version','rendering','modulations','rotation','strokeInput','speedInput'}
      and('speedInput'not in b or obj(b['speedInput'])and b['speedInput']=={'version':1,'space':'view','maximum':30,'estimator':'grafettoEMA30ms'}and type(b['speedInput'].get('version'))is int and num(b['speedInput'].get('maximum'),30,30))
      and('modulations'not in b or obj(m)and not set(m)-{'size','rotation'})and('strokeInput'not in b or obj(si)and 'fanCorners'not in si)
      and obj(r)and r.get('mode')=='buildUp'and r.get('blendMode')=='normal'and r.get('accumulation')=='alphaDarken'and num(r.get('wetEdges',0),0,0)and num(r.get('burntEdges',0),0,0)and not r.get('gammaCorrect')and not r.get('luminance'))

def validate_bristle_wash135(d,parent=None):
    if isinstance(d,dict)and 'bristle'in d:
        b=d.get('behavior');r=b.get('rendering')if isinstance(b,dict)else None
        if isinstance(r,dict)and r.get('accumulation')=='alphaDarken'and(parent is not None or not bristle_wash135_scope(d)):raise ValueError('Bristle Wash135 requires closed root no-ink AA additive request')
