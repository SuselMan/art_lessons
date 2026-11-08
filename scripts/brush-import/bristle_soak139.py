"""Staged canonical-BEGIN hair palette scope, not a current-canvas fallback."""
import math

def _num(v,a,z):return type(v)in(int,float)and math.isfinite(v)and a<=v<=z
def _int(v,a,z):return _num(v,a,z)and int(v)==v

def bristle_soak139_scope(d):
    if not isinstance(d,dict)or not all(isinstance(d.get(k),dict)for k in('bristle','behavior','tip')):return False
    h,b,t=d['bristle'],d['behavior'],d['tip'];s=h.get('soak');r=b.get('rendering');ink=h.get('ink')
    if not isinstance(s,dict)or set(s)-{'sourcePolicy','initialSide','resizePolicy'}or('resizePolicy'in s and s['resizePolicy']!='mask-population-v1')or s.get('sourcePolicy')!='canonical-begin-v1'or not _int(s.get('initialSide'),1,256):return False
    n=s['initialSide'];hairs=h.get('hairs')
    if not isinstance(hairs,list)or not 1<=len(hairs)<=4096 or not all(isinstance(a,list)and len(a)==3 and _num(a[2],0,1)and all(_num(v,-.5,.5)and abs(v*n-round(v*n))<=1e-9 and -int(n//2)<=round(v*n)<=n-1-int(n//2)for v in a[:2])for a in hairs):return False
    if 'resizePolicy'in s:
        if not _int(d.get('version'),140,float('inf'))or n>64:return False
        seen=set()
        for x,y,a in hairs:
            if a<=0 or abs(a*255-round(a*255))>1e-9:return False
            key=(round(x*n),round(y*n))
            if key in seen:return False
            seen.add(key)
    if set(h)-{'version','hairs','scale','shear','random','mousePressure','threshold','connected','antialias','compositing','ink','saturationLookup','soak'}or not _int(h.get('version'),2,2)or not isinstance(ink,dict):return False
    if not all(type(h.get(k))is bool for k in('mousePressure','threshold','connected','antialias','compositing'))or not _num(h.get('scale'),0,10)or not _num(h.get('shear'),-10,10)or not _num(h.get('random'),0,100):return False
    if set(ink)!={'depletion','useOpacity','useSaturation','useWeights','pressureWeight','bristleLengthWeight','bristleInkAmountWeight','inkDepletionWeight'}or not isinstance(ink.get('depletion'),list)or not 1<=len(ink['depletion'])<=65536 or not all(_num(v,0,1)for v in ink['depletion'])or not all(type(ink.get(k))is bool for k in('useOpacity','useSaturation','useWeights'))or not all(_num(ink.get(k),0,1)for k in('pressureWeight','bristleLengthWeight','bristleInkAmountWeight'))or not _num(ink.get('inkDepletionWeight'),0,100):return False
    if ink['useSaturation']:
        v=h.get('saturationLookup')
        if not isinstance(v,dict)or set(v)!={'version','encoding','asset','profileSha256','byteLength'}or not _int(v.get('version'),1,1)or v.get('encoding')!='bristle-saturation-functional-v1-le'or not isinstance(v.get('asset'),str)or len(v['asset'])!=70 or not v['asset'].startswith('asset:')or any(c not in'0123456789abcdef'for c in v['asset'][6:])or not isinstance(v.get('profileSha256'),str)or len(v['profileSha256'])!=64 or any(c not in'0123456789abcdef'for c in v['profileSha256'])or not _int(v.get('byteLength'),64,524288):return False
    elif 'saturationLookup'in h:return False
    unit=lambda v:isinstance(v,list)and len(v)>=2 and all(isinstance(p,list)and len(p)==2 and _num(p[0],0,1)and _num(p[1],1,1)for p in v)
    return(_int(d.get('version'),139,float('inf'))and d.get('model')=='stamp'and _num(d.get('paperInteraction'),0,0)and _num(d.get('flow'),1,1)and unit(d.get('flowByPressure'))
      and not any(k in d for k in('mixer','spray','particle','sketch','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet','screentonePx','colorAdjustment'))
      and not set(t)-{'kind','hardness','aspect','rotation','angle'}and t.get('kind')=='round'and _num(t.get('hardness'),1,1)and _num(t.get('aspect'),1,1)and t.get('rotation')=='fixed'and _num(t.get('angle'),0,0)
      and _int(b.get('version'),2,2)and not set(b)-{'version','rendering','modulations','rotation','strokeInput','speedInput'}
      and('modulations'not in b or isinstance(b['modulations'],dict)and not set(b['modulations'])-{'size','rotation'})
      and('strokeInput'not in b or isinstance(b['strokeInput'],dict)and'fanCorners'not in b['strokeInput'])
      and('speedInput'not in b or isinstance(b['speedInput'],dict)and b['speedInput']=={'version':1,'space':'view','maximum':30,'estimator':'grafettoEMA30ms'}and _int(b['speedInput'].get('version'),1,1)and _num(b['speedInput'].get('maximum'),30,30))
      and isinstance(r,dict)and not set(r)-{'mode','blendMode','accumulation','wetEdges','burntEdges','burntEdgesMode','opacityCeiling'}and r.get('mode')=='buildUp'and r.get('blendMode')=='normal'and r.get('accumulation')=='directOver'and _num(r.get('wetEdges',0),0,0)and _num(r.get('burntEdges',0),0,0)and r.get('burntEdgesMode','multiply')=='multiply'and r.get('opacityCeiling','uniform')=='uniform')

def validate_bristle_soak139(d,parent=None):
    h=d.get('bristle')if isinstance(d,dict)else None
    if isinstance(h,dict)and'soak'in h:
        if parent is not None or not bristle_soak139_scope(d):raise ValueError('Bristle Soak139 requires closed root canonical-BEGIN ink palette scope')


def bristle_resize141_scope(d):
    if not isinstance(d,dict)or not all(isinstance(d.get(k),dict)for k in('bristle','behavior','tip')):return False
    h,b,t=d['bristle'],d['behavior'],d['tip'];v=h.get('initialization');r=b.get('rendering')
    if not isinstance(v,dict)or set(v)!={'sourceSide','resizePolicy'}or v.get('resizePolicy')!='mask-population-v1'or not _int(v.get('sourceSide'),1,256):return False
    side=v['sourceSide'];hairs=h.get('hairs');seen=set()
    if not isinstance(hairs,list)or not 1<=len(hairs)<=8192:return False
    for hair in hairs:
        if not isinstance(hair,list)or len(hair)!=3 or not _num(hair[2],0,1)or hair[2]<=0 or abs(hair[2]*255-round(hair[2]*255))>1e-9:return False
        if not all(_num(x,-.5,.5)and abs(x*side-round(x*side))<=1e-9 and -int(side//2)<=round(x*side)<=side-1-int(side//2)for x in hair[:2]):return False
        key=tuple(round(x*side)for x in hair[:2])
        if key in seen:return False
        seen.add(key)
    return(_int(d.get('version'),141,float('inf'))and d.get('model')=='stamp'and _num(d.get('paperInteraction'),0,0)
      and set(h)=={'version','hairs','scale','shear','random','mousePressure','threshold','connected','antialias','compositing','initialization'}and _int(h.get('version'),1,1)
      and _num(h.get('scale'),-10,10)and _num(h.get('shear'),-10,10)and _num(h.get('random'),0,100)and all(type(h.get(k))is bool for k in('mousePressure','threshold','connected','antialias','compositing'))
      and not any(k in d for k in('mixer','spray','particle','sketch','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet','screentonePx','colorAdjustment'))
      and not set(t)-{'kind','hardness','aspect','rotation','angle'}and t.get('kind')=='round'and _num(t.get('hardness'),1,1)and _num(t.get('aspect'),1,1)and t.get('rotation')=='fixed'and _num(t.get('angle'),0,0)
      and _int(b.get('version'),2,2)and not set(b)-{'version','rendering','modulations','rotation','strokeInput','speedInput'}
      and('modulations'not in b or isinstance(b['modulations'],dict)and not set(b['modulations'])-{'size','rotation'})
      and('strokeInput'not in b or isinstance(b['strokeInput'],dict)and'fanCorners'not in b['strokeInput'])
      and('speedInput'not in b or isinstance(b['speedInput'],dict)and b['speedInput']=={'version':1,'space':'view','maximum':30,'estimator':'grafettoEMA30ms'}and _int(b['speedInput'].get('version'),1,1)and _num(b['speedInput'].get('maximum'),30,30))
      and isinstance(r,dict)and not set(r)-{'mode','blendMode','accumulation','wetEdges','burntEdges','burntEdgesMode','opacityCeiling'}and r.get('mode')=='buildUp'and r.get('blendMode')=='normal'and r.get('accumulation')=='directOver'and _num(r.get('wetEdges',0),0,0)and _num(r.get('burntEdges',0),0,0)and r.get('burntEdgesMode','multiply')=='multiply'and r.get('opacityCeiling','uniform')=='uniform')

def validate_bristle_initialization141(d,parent=None):
    h=d.get('bristle')if isinstance(d,dict)else None
    if isinstance(h,dict)and'initialization'in h:
        if parent is not None or not bristle_resize141_scope(d):raise ValueError('Bristle initialization141 requires root ordinary no-ink full-mask directOver scope')
