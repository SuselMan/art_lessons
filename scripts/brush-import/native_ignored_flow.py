"""Four Opacity-only paintops never evaluate native Flow options.

Exact keys consumed by the common paintbrush adapter are stripped from its
private transformed XML only. Original captured bytes and source identity stay.
No wildcard prefix and no renderer or historical descriptor law is changed.
"""
IGNORED_FLOW_KEYS=frozenset({'FlowValue','PressureFlow','FlowUseCurve','FlowSensor','FlowcurveMode','CurveFlow','CustomFlow','FlowcommonCurve','FlowUseSameCurve','FlowFuzzyStroke'})
def strip_unused_native_flow(root):
    meaningful=False
    for node in list(root):
        key=node.get('name')
        if node.tag!='param'or key not in IGNORED_FLOW_KEYS:continue
        text=(node.text or '').strip().lower()
        baseline=(key=='FlowValue'and text in('1','1.0'))or(key in('PressureFlow','FlowUseCurve','CustomFlow','FlowFuzzyStroke')and text in('false','0'))
        meaningful=meaningful or not baseline
        root.remove(node)
    return meaningful
