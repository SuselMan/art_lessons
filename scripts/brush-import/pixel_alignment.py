"""Static bitmap Sharpness alignment with equal-sized random GIH frames."""
import math
def pixel_alignment211_scope(v):
    obj=lambda x:isinstance(x,dict)
    def n(x,a,b):return type(x)in(int,float)and math.isfinite(x)and a<=x<=b
    if not obj(v)or v.get('version')!=211 or v.get('model')!='stamp'or not n(v.get('paperInteraction'),0,0) or not obj(v.get('tip'))or not obj(v.get('behavior')):return False
    t,b=v['tip'],v['behavior'];q=t.get('alphaThreshold');r=b.get('rendering');anim=t.get('animation')
    if t.get('kind')!='bitmap'or t.get('aspect')!=1 or t.get('rotation')!='fixed'or not obj(q)or not obj(q.get('alignment'))or not obj(r):return False
    a=q['alignment'];dyn=b.get('dynamics')
    return (set(q)=={'value','softness','alignment'}and n(q['value'],0,1)and n(q['softness'],0,1)and set(a)=={'width','height'}and n(a['width'],1/2048,1)and n(a['height'],1/2048,1)and max(a['width'],a['height'])==1
      and obj(anim)and anim.get('mode')=='random'and isinstance(anim.get('frames'),list)and len(anim['frames'])>=2 and 'geometry'not in anim
      and not any(k in t for k in ('color','material','imageSampling','profile','autoNoise','autoShape'))
      and not any(k in v for k in ('mixer','wet','texture','scatter','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','dyna','deform','filter','clone','mypaint','tangentNormal'))
      and b.get('version')==2 and not set(b)-{'version','speedInput','rendering','spacing','dynamics'}and (dyn is None or obj(dyn)and not set(dyn)-{'angle'})
      and r.get('mode')=='buildUp'and r.get('blendMode')=='normal'and r.get('accumulation')=='alphaDarken'and r.get('wetEdges',0)==0 and r.get('burntEdges',0)==0)
