"""Existing145 source capability plus native static160 distance/time author policy."""
import math

def deform_timer160_scope(d):
    if not isinstance(d,dict)or type(d.get('version'))is not int or d['version']<160:return False
    if not isinstance(d.get('deform'),dict)or d['deform'].get('sourcePolicy')!='canonical-begin-v1':return False
    b=d.get('behavior');t=d.get('tip');m=d.get('mixer')
    if not all(isinstance(v,dict)for v in(b,t,m)):return False
    c=b.get('timing');s=b.get('spacing');r=b.get('rendering')
    if not isinstance(c,dict)or set(c)!={'version','rate','ignoreDistanceSpacing'}or type(c.get('version'))is not int or c['version']!=1 or type(c.get('rate'))not in(int,float)or not math.isfinite(c['rate'])or not 0<c['rate']<=1000 or c.get('ignoreDistanceSpacing')is not False:return False
    if t.get('kind')!='round'or any(k in t for k in('profile','animation','color','material','imageSampling','autoNoise','autoShape'))or not isinstance(r,dict)or r.get('mode')!='buildUp':return False
    if not isinstance(s,dict)or set(s)!={'mode','coefficient','isotropic'}or s.get('mode')!='diameter'or s.get('isotropic')is not True or type(s.get('coefficient'))not in(int,float)or not math.isfinite(s['coefficient'])or not 0<s['coefficient']<=100:return False
    if any(type(m.get(k))not in(int,float)or m[k]!=v for k,v in [('load',0),('initialLoad',0),('pickup',1),('strength',1)])or type(m.get('smearAlpha'))is not bool or set(m)-{'load','initialLoad','pickup','strength','source','smearAlpha'}:return False
    proxy=dict(d);behavior=dict(b);behavior.pop('timing');proxy.update(version=145,behavior=behavior)
    from canonical_effect_scopes import validate_canonical_effect_scopes
    try:validate_canonical_effect_scopes(proxy,0)
    except ValueError:return False
    return True

def validate_deform_timer160(d,depth=0):
    if depth or not deform_timer160_scope(d):raise ValueError('Deform timer160 requires closed root static OLD source scope')
