"""Closed existing functional Auto-mask noise on static rectangular Spray tips."""
import math,re

def spray_rectangle_noise155_scope(d):
    obj=lambda x:isinstance(x,dict)
    unit=lambda x:type(x)in(int,float)and math.isfinite(x)and 0<=x<=1
    if not obj(d)or type(d.get('version'))is not int or d['version']!=155 or d.get('model')!='stamp'or d.get('paperInteraction')!=0:return False
    if any(k in d for k in('mixer','scatter','wet','texture','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')):return False
    t=d.get('tip');b=d.get('behavior');s=d.get('spray')
    if not all(obj(x)for x in(t,b,s)):return False
    p=t.get('profile');n=t.get('autoNoise');r=b.get('rendering')
    if t.get('kind')!='procedural'or any(k in t for k in('mask','maskBounds','animation','color','material','imageSampling','autoShape'))or not obj(p)or not obj(n)or type(n.get('version'))is not int or n.get('version')!=1 or set(n)!={'version','density','randomness'}or not all(unit(n.get(k))for k in('density','randomness'))or(n['density']==1 and n['randomness']==0):return False
    if b.get('version')!=2 or b.get('erase')is True or any(k in b for k in('dual','timing','softness','taper','wetMix','edgeBleed','grain','colorAdjustment','sequentialRandom','strokeInput','clockRead'))or any(obj(b.get(k))and'softness'in b[k]for k in('dynamics','modulations')):return False
    if not obj(r)or r.get('mode')!='buildUp'or r.get('blendMode')!='normal'or r.get('accumulation')!='directOver'or r.get('wetEdges',0)!=0 or r.get('burntEdges',0)!=0 or r.get('gammaCorrect')is True or r.get('luminance')is True:return False
    from spray_wash133 import _spray133_metadata
    if not _spray133_metadata(s):return False
    particle=s['particle'];color=s['color']
    if particle.get('shape')!='tip'or'image'in particle or particle.get('proportional')is not False or any(k in color for k in('sourcePolicy','sampleInput','mixBackground','fillBackground')):return False
    if type(p.get('antialias'))is not bool:return False
    if p.get('kind')=='gaussian2D':return set(p)=={'kind','shape','horizontalFade','verticalFade','antialias'}and p.get('shape')in('ellipse','rectangle')and all(unit(p.get(k))for k in('horizontalFade','verticalFade'))
    return p.get('kind')=='curveRectangle'and set(p)=={'kind','lookup','resolution','encoding','antialias'}and isinstance(p.get('lookup'),str)and bool(re.fullmatch(r'asset:[a-f0-9]{64}',p['lookup']))and type(p.get('resolution'))is int and 1<=p['resolution']<=40000 and p.get('encoding')=='unorm32be'

def validate_spray_rectangle_noise155(d,depth=0):
    if not isinstance(d,dict):return
    tip=d.get('tip');profile=tip.get('profile')if isinstance(tip,dict)else None
    marked='spray'in d and(d.get('version')==155 or isinstance(profile,dict)and profile.get('kind')in('gaussian2D','curveRectangle','curveRectangleSoftness')and'autoNoise'in tip)
    if marked and(depth or not spray_rectangle_noise155_scope(d)):raise ValueError('Invalid Spray rectangle noise155 closed scope')
