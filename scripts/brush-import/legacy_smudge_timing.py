"""Closed129 legacy timing capability; schema and CAS validation remain existing owners."""
import math

def legacy_smudge_timing_scope(d, require_timing=True):
    if not isinstance(d,dict):return False
    t,m,b=d.get('tip'),d.get('mixer'),d.get('behavior')
    if d.get('paperInteraction')!=0 or d.get('model')!='mixer'or not all(isinstance(v,dict)for v in(t,m,b))or m.get('source')!='previousCanvas'or m.get('load')!=0 or m.get('initialLoad')!=0 or m.get('strength')!=1:return False
    if any(k in d for k in('wet','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'))or any(k in b for k in('dual','erase','wetMix','taper','sequentialRandom','strokeInput','colorAdjustment','edgeBleed','grain')):return False
    if set(m)-{'load','initialLoad','pickup','strength','smearAlpha','source','pickupDynamics'}or t.get('kind')!='bitmap'or any(k in t for k in('color','material','imageSampling','profile','autoNoise','autoShape')):return False
    render=b.get('rendering',{})
    if render.get('mode')!='buildUp'or render.get('wetEdges')!=0 or render.get('burntEdges')!=0 or render.get('blendMode')!='normal'or 'accumulation'in render:return False
    texture=d.get('texture')
    if 'texture'in d and(not isinstance(texture,dict)or 'material'in texture or 'eraseId'in texture or not isinstance(texture.get('application'),dict)or texture['application'].get('mode')!='multiply'or texture['application'].get('soft')is not False):return False
    a=t.get('animation')
    if a is not None and(not isinstance(a,dict)or a.get('mode')not in('random','incremental')or not isinstance(a.get('frames'),list)or not 2<=len(a['frames'])<=256 or set(a)-{'mode','frames'}):return False
    pickup=m.get('pickupDynamics')
    if 'pickupDynamics'in m and(not isinstance(pickup,list)or len(pickup)>4 or any(not isinstance(c,dict)or c.get('control')not in('pressure','off')or 'combine'in c or 'randomSource'in c for c in pickup)):return False
    if require_timing:
        timing=b.get('timing')
        if type(d.get('version'))is not int or d['version']<129 or not isinstance(timing,dict)or type(timing.get('version'))is not int or timing.get('version')!=1 or type(timing.get('rate'))not in(int,float)or not math.isfinite(timing['rate'])or not 0<=timing['rate']<=1000 or timing.get('ignoreDistanceSpacing')is not False or set(timing)-{'version','rate','ignoreDistanceSpacing'}:return False
    return True
