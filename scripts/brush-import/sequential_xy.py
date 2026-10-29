"""Offline mirror of shared isBrushSequentialXYCompatible; no activation default.

This checks a validated descriptor's single-source random-consumer family, not
native pixel/input parity. Root's shared/runtime contract remains authoritative.
"""
import math


def truthy(value):
    # JS objects/arrays are truthy even when empty, unlike Python containers.
    if value is None or value is False: return False
    if isinstance(value,(int,float)) and (value==0 or isinstance(value,float) and math.isnan(value)): return False
    return value!=''


def exact_number(value, expected):
    return type(value) in (int,float) and value==expected


def compatible(brush):
    if not isinstance(brush,dict): return False
    v,s,tip=brush.get('behavior'),brush.get('scatter'),brush.get('tip')
    if not isinstance(v,dict) or not isinstance(s,dict) or not isinstance(tip,dict): return False
    if (not exact_number(brush.get('paperInteraction'),0) or truthy(v.get('erase')) or 'falloff' in v
            or brush.get('model')!='stamp' or any(truthy(brush.get(k)) for k in ('mixer','wet','texture'))
            or any(truthy(v.get(k)) for k in ('dual','wetMix','grain','colorAdjustment','edgeBleed','taper'))): return False
    p=tip.get('profile',{})
    if (tip.get('kind')!='round' or not isinstance(p,dict) or p.get('kind')!='gaussian' or truthy(p.get('antialias'))
            or not exact_number(tip.get('aspect'),1) or tip.get('rotation')!='fixed'
            or any(truthy(tip.get(k)) for k in ('mask','animation','material','alphaThreshold'))): return False
    if any(not exact_number(s.get(k),value) for k,value in [('count',1),('scale',1),('sizeJitter',0),('angleJitter',0),('flowJitter',0)]): return False
    scatter=v.get('scatter',{})
    if (not isinstance(scatter,dict) or scatter.get('placement')!='xyUniform' or not truthy(scatter.get('bothAxes'))
            or not exact_number(scatter.get('countJitter'),0) or not exact_number(scatter.get('roundnessJitter') if scatter.get('roundnessJitter') is not None else 0,0)): return False
    rotation=v.get('rotation')
    if truthy(rotation):
        if (not isinstance(rotation,dict) or rotation.get('random')!='none'
                or any(truthy(rotation.get(k)) for k in ('composition','flipX','flipY','azimuth','projection'))): return False
    rendering=v.get('rendering')
    if truthy(rendering) and (not isinstance(rendering,dict) or any(not exact_number(rendering.get(k),0) for k in ('wetEdges','burntEdges'))): return False
    controls=[]
    for field in ('dynamics','modulations'):
        values=v.get(field) or {}
        if not isinstance(values,dict) or any(k not in ('scatter','opacity','flow') for k in values): return False
        for value in values.values():
            if field=='modulations':
                if not isinstance(value,list): return False
                controls.extend(value)
            else: controls.append(value)
    spacing=v.get('spacing') or {}
    if not isinstance(spacing,dict): return False
    spacing_controls=spacing.get('dynamics') or []
    if not isinstance(spacing_controls,list) or any(not isinstance(d,dict) or d.get('control') not in ('pressure','off') for d in spacing_controls): return False
    controls.extend(spacing_controls)
    return all(isinstance(d,dict) and d.get('control') not in ('random','strokeRandom') and exact_number(d.get('jitter'),0) for d in controls)


def validate_policy(brush, depth=0):
    behavior=brush.get('behavior',{})
    if not isinstance(behavior,dict) or 'sequentialRandom' not in behavior: return
    policy=behavior['sequentialRandom']
    if (type(behavior.get('version')) is not int or behavior['version']!=2
            or not isinstance(policy,dict) or set(policy)!={'version','kind','policy'}
            or type(policy.get('version')) is not int or policy['version']!=1
            or policy.get('kind')!='qt5Taus88' or policy.get('policy')!='scatterXY'
            or depth!=0 or not compatible(brush)):
        raise ValueError('Invalid or incompatible portable sequential XY policy')
