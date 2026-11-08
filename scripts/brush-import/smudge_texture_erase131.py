"""Closed131 captured foreground erase; preprocessing and CAS remain canonical owners."""
def smudge_texture_erase131_scope(d, require_version=True):
    if not isinstance(d,dict):return False
    if require_version and(type(d.get('version'))is not int or d['version']<131):return False
    t,m,b,x=(d.get(k)for k in('tip','mixer','behavior','texture'))
    if d.get('model')!='mixer'or d.get('paperInteraction')!=0 or not all(isinstance(v,dict)for v in(t,m,b,x)):return False
    if t.get('kind')!='bitmap'or any(k in t for k in('animation','color','material','imageSampling','profile','autoNoise','autoShape')):return False
    if any(k in d for k in('wet','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'))or any(k in b for k in('dual','timing','sequentialRandom','strokeInput','wetMix','taper','colorAdjustment','edgeBleed','grain')):return False
    if b.get('erase')is not True or m.get('algorithm')!='krita-mask'or m.get('source')!='previousCanvas'or m.get('colorRateComposite')!='erase'or m.get('load')!=0 or m.get('initialLoad')!=0 or m.get('strength')!=1 or 'paintThickness'in m:return False
    if set(m)-{'load','initialLoad','pickup','strength','smearAlpha','source','algorithm','colorRateComposite','foreground','sampling','pickupDynamics'}:return False
    if 'foreground'in m and(not isinstance(m['foreground'],dict)or'gradient'in m['foreground']):return False
    if 'sampling'in m and(not isinstance(m['sampling'],dict)or m['sampling'].get('mode')!='maskMean'):return False
    render=b.get('rendering',{});a=x.get('application')
    if not isinstance(render,dict):return False
    if render.get('mode')!='buildUp'or render.get('blendMode')!='normal'or render.get('wetEdges')!=0 or render.get('burntEdges')!=0 or'accumulation'in render:return False
    if 'material'in x or not isinstance(x.get('eraseId'),str)or not isinstance(x.get('id'),str)or not isinstance(a,dict)or a.get('mode')not in('multiply','subtract')or type(a.get('soft'))is not bool or set(a)-{'mode','soft'}:return False
    return True
