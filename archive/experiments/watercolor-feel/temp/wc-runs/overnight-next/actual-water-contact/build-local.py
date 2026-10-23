import json,copy
from pathlib import Path
r=Path(__file__).parent;p=json.load(open(r.parent/'transport-distance-audit/production-max-paired-headroom2-microcoupled-curvature10.json'));s=copy.deepcopy(p)
s.update(id='production-physical22-local-fluid-contact',parent='baseline',status='UNRENDERED root review required',mechanism='Endpoint+midpoint mobility unions standing coverage.b/coverage.a, captured paperwet P.g/P.a and sourcewater P.r/P.a; coverage.a remains support gate. Nominal brush flow unchanged.',limitations=['P.r is source-water proxy, not conserved freewater','P.g historical paperwet has no evaporation','Coverage.b mode11 extension may dominate and hide change','No source/globalselfmerge/contract change'])
helper="""  float localFluidAt(vec2 uv) {
    vec4 p = texture2D(u_pigment, uv), c = texture2D(u_water, uv);
    float carried = p.a > 0.0 ? clamp(max(p.r, p.g) / max(p.a, 0.00196078431372549), 0.0, 1.0) : 0.0;
    float standing = c.a > 0.0 ? clamp(c.b / max(c.a, 0.00392156862745098), 0.0, 1.0) : 0.0;
    return max(carried, standing);
  }
"""
s['runtimePatches'] += [dict(kind='shader-exact',selector='float flux(vec2 from, vec2 to, vec2 direction)',countPerShader=1,before='  float flux(vec2 from, vec2 to, vec2 direction) {',after=helper+'  float flux(vec2 from, vec2 to, vec2 direction) {'),dict(kind='shader-exact',selector='float localFluidAt(vec2 uv)',countPerShader=1,before='    contact *= step(0.015, texture2D(u_water, (from + to) * 0.5).a);',after='    contact *= step(0.015, texture2D(u_water, (from + to) * 0.5).a);\n    contact *= min(min(localFluidAt(from), localFluidAt(to)), localFluidAt((from + to) * 0.5));')]
(r/(s['id']+'.json')).write_text(json.dumps(s,indent=2))
