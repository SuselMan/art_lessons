"""Exact native-unused option groups, stripped only from private adapter XML.

Original captured bytes/resource identities never enter this transformation.
Flow94 API and its meaningful-note classification are preserved. No wildcard.
"""
IGNORED_FLOW_KEYS=frozenset({'FlowValue','PressureFlow','FlowUseCurve','FlowSensor','FlowcurveMode','CurveFlow','CustomFlow','FlowcommonCurve','FlowUseSameCurve','FlowFuzzyStroke'})
IGNORED_MIRROR_KEYS=frozenset({'PressureMirror','HorizontalMirrorEnabled','VerticalMirrorEnabled','MirrorValue','MirrorUseCurve','MirrorSensor','MirrorcurveMode','CurveMirror','CustomMirror','MirrorcommonCurve','MirrorUseSameCurve'})
IGNORED_ROTATION_KEYS=frozenset({'PressureRotation','RotationValue','RotationUseCurve','RotationSensor','RotationcurveMode','CurveRotation','CustomRotation','RotationcommonCurve','RotationUseSameCurve'})
_FALSE=frozenset({'false','0'})
_UNIT=frozenset({'1','1.0'})
_FLOW_BASELINES={'FlowValue':_UNIT,'PressureFlow':_FALSE,'FlowUseCurve':_FALSE,'CustomFlow':_FALSE,'FlowFuzzyStroke':_FALSE}
_MIRROR_BASELINES={'MirrorValue':_UNIT,'PressureMirror':_FALSE,'HorizontalMirrorEnabled':_FALSE,'VerticalMirrorEnabled':_FALSE,'MirrorUseCurve':_FALSE,'CustomMirror':_FALSE}
_ROTATION_BASELINES={'RotationValue':_UNIT,'PressureRotation':_FALSE,'RotationUseCurve':_FALSE,'CustomRotation':_FALSE}

def _strip_unused(root,keys,baselines):
    meaningful=False
    for node in list(root):
        key=node.get('name')
        if node.tag!='param'or key not in keys:continue
        text=(node.text or '').strip().lower()
        meaningful=meaningful or text not in baselines.get(key,())
        root.remove(node)
    return meaningful

def strip_unused_native_flow(root):
    return _strip_unused(root,IGNORED_FLOW_KEYS,_FLOW_BASELINES)

def strip_unused_native_mirror(root):
    return _strip_unused(root,IGNORED_MIRROR_KEYS,_MIRROR_BASELINES)

def strip_unused_native_rotation(root):
    return _strip_unused(root,IGNORED_ROTATION_KEYS,_ROTATION_BASELINES)
