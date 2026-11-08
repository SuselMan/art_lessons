"""Closed captured-primary-clock READ, not child timer permission."""
import math

def has_time_control132(value,depth=0):
    if depth>12:return False
    if isinstance(value,list):return any(has_time_control132(v,depth+1)for v in value[:64])
    return isinstance(value,dict)and(value.get('control')=='time'or any(has_time_control132(v,depth+1)for k,v in value.items()if k!='brush'))

def independent_child_clock132_pair(value):
    if not isinstance(value,dict)or not isinstance(value.get('behavior'),dict)or not isinstance(value['behavior'].get('dual'),dict):return False
    b=value['behavior'];dual=b['dual'];child=dual.get('brush')
    if not isinstance(child,dict)or not isinstance(child.get('behavior'),dict)or not isinstance(child.get('tip'),dict)or not isinstance(value.get('tip'),dict):return False
    c=child['behavior'];tip=child['tip'];rt=value['tip']
    if c.get('clockRead')!={'version':1,'source':'primary'}or type(c['clockRead'].get('version'))is not int or 'clockRead'in b or dual.get('sampling')!='independent'or dual.get('blendMode')not in('multiply','subtract','darken'):return False
    special=('mixer','wet','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')
    for d in(value,child):
        if d.get('model')!='stamp'or type(d.get('version'))is not int or not 132<=d['version']<=10000 or type(d.get('paperInteraction'))not in(int,float)or d.get('paperInteraction')!=0 or any(k in d for k in special):return False
    if tip.get('kind')!='bitmap'or rt.get('kind')not in('bitmap','round','procedural')or any(k in rt or k in tip for k in('animation','material','color','autoShape','alphaThreshold'))or any(k in tip for k in('profile','autoNoise')):return False
    if 'profile'in rt and(not isinstance(rt['profile'],dict)or rt['profile'].get('kind')!='standard'):return False
    if 'texture'in child or any(k in c for k in('timing','dual','strokeInput','sequentialRandom','colorAdjustment','wetMix','edgeBleed','taper')):return False
    for v in(b,c):
        render=v.get('rendering')
        if type(v.get('version'))is not int or v.get('version')!=2 or v.get('erase')is True or 'wetMix'in v or not isinstance(render,dict)or render.get('mode')!='buildUp'or render.get('blendMode')!='normal'or render.get('accumulation')not in('directOver','alphaDarken')or render.get('wetEdges',0)!=0 or render.get('burntEdges',0)!=0:return False
    timing=b.get('timing')
    if not isinstance(timing,dict)or type(timing.get('version'))is not int or timing.get('version')!=1 or type(timing.get('rate'))not in(int,float)or not math.isfinite(timing['rate'])or not 0<=timing['rate']<=1000 or type(timing.get('ignoreDistanceSpacing'))is not bool:return False
    if any(k in b for k in('strokeInput','sequentialRandom','edgeBleed','taper')):return False
    mods=c.get('modulations',{});dyn=c.get('dynamics',{})
    if not isinstance(mods,dict)or not isinstance(dyn,dict)or not(has_time_control132(mods.get('size'))or has_time_control132(dyn.get('size'))):return False
    for k,v in c.items():
        if k in('modulations','dynamics'):
            if not isinstance(v,dict)or any(has_time_control132(x)for target,x in v.items()if target!='size'):return False
        elif has_time_control132(v):return False
    return True

def validate_child_clock132_profile(d,parent=None):
    b=d.get('behavior',{})if isinstance(d,dict)else{}
    if not isinstance(b,dict):return
    if 'clockRead'in b and(not independent_child_clock132_pair(parent)or parent['behavior']['dual']['brush']is not d):raise ValueError('Child clock132 requires a matching primary timer pair')
    child=b.get('dual',{}).get('brush')if isinstance(b.get('dual'),dict)else None
    if isinstance(child,dict)and isinstance(child.get('behavior'),dict)and('clockRead'in child['behavior']or type(child.get('version'))is int and child['version']>=132 and has_time_control132(child['behavior']))and not independent_child_clock132_pair(d):raise ValueError('Child clock132 requires a matching primary timer pair')
