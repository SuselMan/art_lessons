"""NativeKPP host timing only; never reinterpret libmypaint dabs_per_second."""
import math

def mypaint_timer177_header(d):
    if not isinstance(d,dict)or type(d.get('version'))is not int or d['version']!=177 or d.get('model')!='stamp'or d.get('paperInteraction')!=0:return False
    m=d.get('mypaint');b=d.get('behavior');tip=d.get('tip')
    if not isinstance(m,dict)or m.get('surfacePolicy')!='krita-legacy-v1'or not isinstance(b,dict)or b.get('version')!=2 or set(b)-{'version','rendering','timing','spacing'}or not isinstance(tip,dict):return False
    t=b.get('timing');s=b.get('spacing');render=b.get('rendering')
    if not isinstance(t,dict)or set(t)!={'version','rate','ignoreDistanceSpacing'}or type(t.get('version'))is not int or t.get('version')!=1 or type(t['rate'])not in(int,float)or not math.isfinite(t['rate'])or not 0<=t['rate']<=1000 or type(t['ignoreDistanceSpacing'])is not bool:return False
    if not isinstance(s,dict)or s!={'mode':'kritaAuto','coefficient':1,'isotropic':False}or type(s.get('coefficient'))not in(int,float)or type(s.get('isotropic'))is not bool:return False
    if not isinstance(render,dict)or render.get('mode')!='buildUp'or render.get('blendMode')!='normal'or render.get('accumulation')!='directOver'or render.get('wetEdges',0)!=0 or render.get('burntEdges',0)!=0 or render.get('gammaCorrect')or render.get('luminance'):return False
    if tip.get('kind')!='round'or type(tip.get('aspect'))not in(int,float)or tip.get('aspect')!=1 or any(k in tip for k in('mask','color','profile','material','imageSampling','animation','autoNoise','autoShape')):return False
    def identity(x):return isinstance(x,list)and len(x)==2 and all(isinstance(v,list)and len(v)==2 and all(type(n)in(int,float)for n in v)and v[0]==i and v[1]==1 for i,v in enumerate(x))
    return all(identity(d.get(k))for k in('sizeByPressure','flowByPressure','opacityByPressure'))

def apply_kpp_mypaint_timer177(record,params,*,depth=0):
    if depth:raise ValueError('MyPaint177 requires root genuine KPP')
    try:rate=float(params.get('PaintOpSettings/rate','20'))
    except(TypeError,ValueError):raise ValueError('Invalid MyPaint177 rate')
    if not math.isfinite(rate)or not 0<=rate<=1000:raise ValueError('Invalid MyPaint177 rate')
    d=record['descriptor'];d['version']=177;d['mypaint']['surfacePolicy']='krita-legacy-v1'
    d['behavior']['timing']={'version':1,'rate':rate,'ignoreDistanceSpacing':str(params.get('PaintOpSettings/ignoreSpacing','false')).lower()in('true','1')}
    d['behavior']['spacing']={'mode':'kritaAuto','coefficient':1,'isotropic':False}
    if not mypaint_timer177_header(d):raise ValueError('Invalid MyPaint177 native scope')
    from brush_contract import compatibility
    record['compatibility'].append(compatibility('mypaintKritaAirbrush177','Canonical KPP Airbrush schedules the existing legacy WASM via recorded host time and constructor-diameter autoSpacing. Static rate0 means LONG_TIME; internal dabs_per_second/pressure maps remain native and are not a second host clock. No native event-jitter or pixel identity claim.','supported'))
    if str(params.get('PressureRate','false')).lower()in('true','1'):record['compatibility'].append(compatibility('nativeIgnored.mypaintPressureRate','Pinned Krita MyPaint effectiveTiming passes no RateOption: this outer option does not modulate host rate. Original KPP settings identity retained.','supported'))
    return record
