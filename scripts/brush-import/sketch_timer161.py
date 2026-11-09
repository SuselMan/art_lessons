"""Closed root simple Sketch timer. Recorded requests are not retimed."""
import math

def sketch_timer161_scope(d):
    if not isinstance(d,dict)or type(d.get('version'))is not int or d['version']<161 or d.get('model')!='stamp' or d.get('paperInteraction')!=0 or d.get('flow')!=1 or d.get('flowPer')!='stamp':return False
    if any(k in d for k in('mixer','spray','bristle','particle','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet','screentonePx')):return False
    t=d.get('tip');b=d.get('behavior');s=d.get('sketch')
    if not isinstance(t,dict)or set(t)!={'kind','aspect','hardness','rotation','angle'}or t!={'kind':'round','aspect':1,'hardness':1,'rotation':'fixed','angle':0}:return False
    if not isinstance(s,dict)or s.get('version')!=1 or s.get('mode')!='simple'or any(k not in('version','mode','width','offset','probability','connect','magnetify','randomRGB','randomOpacity','distanceDensity','distanceOpacity','antialias','dynamics')for k in s):return False
    for key,lo,hi in [('width',.01,1000),('offset',-10,10),('probability',0,1)]:
        v=s.get(key)
        if type(v)not in(int,float)or not math.isfinite(v)or not lo<=v<=hi:return False
    if any(type(s.get(k))is not bool for k in('connect','magnetify','randomRGB','randomOpacity','distanceDensity','distanceOpacity','antialias')):return False
    if 'dynamics'in s:
        if not isinstance(s['dynamics'],dict)or any(k not in('width','offset','probability')for k in s['dynamics']):return False
        from convert import validate_portable_dynamics
        try:
            for controls in s['dynamics'].values():validate_portable_dynamics(controls)
        except ValueError:return False
    if not isinstance(b,dict)or b.get('version')!=2 or any(k not in('version','rendering','timing','speedInput')for k in b):return False
    if 'speedInput'in b and b['speedInput']!={'version':1,'space':'view','maximum':30,'estimator':'grafettoEMA30ms'}:return False
    r=b.get('rendering');c=b.get('timing')
    if not isinstance(r,dict)or r.get('mode')!='buildUp'or r.get('blendMode')!='normal'or r.get('accumulation')!='directOver'or r.get('wetEdges',0)!=0 or r.get('burntEdges',0)!=0 or r.get('gammaCorrect')or r.get('luminance'):return False
    from native_pressure_rate import pressure_rate_timing_scope
    if not pressure_rate_timing_scope(c,d['version']>=164):return False
    curve=d.get('flowByPressure')
    return isinstance(curve,list)and len(curve)>=2 and all(isinstance(p,list)and len(p)==2 and type(p[0])in(int,float)and math.isfinite(p[0])and 0<=p[0]<=1 and p[1]==1 for p in curve)

def validate_sketch_timer161(d,parent=None):
    if isinstance(d,dict)and 'sketch'in d and isinstance(d.get('behavior'),dict)and 'timing'in d['behavior']:
        if parent is not None or not sketch_timer161_scope(d):raise ValueError('Sketch timer161 requires closed root simple directOver scope')
