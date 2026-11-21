"""Native ordinary-mask Tangent Wash; no new source, shader or owner."""
import math

def tangent_wash136_scope(d):
    obj=lambda v:isinstance(v,dict)
    num=lambda v,a,z:type(v)in(int,float)and math.isfinite(v)and a<=v<=z
    def one(v):return isinstance(v,list)and len(v)>=2 and all(isinstance(p,list)and len(p)==2 and num(p[0],0,1)and type(p[1])in(int,float)and p[1]==1 for p in v)
    if not obj(d):return False
    t=d.get('tip');b=d.get('behavior');v=d.get('tangentNormal')
    if not all(obj(x)for x in(t,b,v)):return False
    g=t.get('profile');r=b.get('rendering')
    bitmap=d.get('version')==207
    mask_ok=(bitmap and not set(t)-{'kind','aspect','hardness','rotation','angle','mask','maskBounds','imageSampling'} and t.get('kind')=='bitmap' and isinstance(t.get('mask'),str) and isinstance(t.get('maskBounds'),dict) and isinstance(t.get('imageSampling'),dict) and t['imageSampling'].get('kind')=='integer-pyramid' and t['imageSampling'].get('signal')=='inverse-gray') or (not bitmap and not set(t)-{'kind','aspect','hardness','rotation','angle','profile'} and t.get('kind')=='procedural' and obj(g) and not set(g)-{'kind','shape','horizontalFade','verticalFade','antialias'} and g.get('kind')=='standard' and g.get('shape')=='ellipse' and num(g.get('horizontalFade'),0,1) and num(g.get('verticalFade'),0,1) and type(g.get('antialias'))is bool)
    return(type(d.get('version'))is int and d['version']>=136 and d.get('model')=='stamp'and num(d.get('paperInteraction'),0,0)and num(d.get('flow'),1,1)and one(d.get('flowByPressure'))
      and set(v)=={'version','direction','channels','elevationSensitivity','mix'}and type(v.get('version'))is int and v['version']==1 and v.get('direction')in('tilt','direction','mix')and isinstance(v.get('channels'),list)and len(v['channels'])==3 and all(type(c)is int and 0<=c<=5 for c in v['channels'])and num(v.get('elevationSensitivity'),0,1)and num(v.get('mix'),0,1)
      and not any(k in d for k in('mypaint','clone','filter','deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','mixer','wet','texture','scatter'))
      and mask_ok and num(t.get('aspect'),1,16 if d.get('version') in (206,207) else 1)and num(t.get('hardness'),0,1)and t.get('rotation')=='fixed'and type(t.get('angle'))in(int,float)and math.isfinite(t['angle'])
      and b.get('version')==2 and not set(b)-{'version','speedInput','rendering','spacing','rotation','modulations','dynamics','strokeInput'}
      and all(k not in b or obj(b[k])and not set(b[k])-{'size','opacity','angle'}for k in('modulations','dynamics'))and('strokeInput'not in b or obj(b['strokeInput'])and'fanCorners'not in b['strokeInput'])
      and obj(r)and r.get('mode')=='buildUp'and r.get('blendMode')=='normal'and r.get('accumulation')=='alphaDarken'and num(r.get('wetEdges',0),0,0)and num(r.get('burntEdges',0),0,0)and not r.get('gammaCorrect')and not r.get('luminance'))

def validate_tangent_wash136(d,parent=None):
    if isinstance(d,dict)and'tangentNormal'in d:
        b=d.get('behavior');r=b.get('rendering')if isinstance(b,dict)else None
        if isinstance(r,dict)and r.get('accumulation')=='alphaDarken'and(parent is not None or not tangent_wash136_scope(d)):raise ValueError('Tangent Wash136 requires closed root static standard mask')
