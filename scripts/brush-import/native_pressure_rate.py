"""One bounded pressure/off native Rate law, shared by Particle/Sketch/Deform.

No clocks/evaluation here: parsing and portable admission only. Generic Pixel's
wider existing timing policy is not changed.
"""
import math

def pressure_rate_timing_scope(c,allow_factors=False):
    if not isinstance(c,dict)or set(c)-{'version','rate','ignoreDistanceSpacing','rateDynamics'}or type(c.get('version'))is not int or c['version']!=1 or type(c.get('rate'))not in(int,float)or not math.isfinite(c['rate'])or not 0<c['rate']<=1000 or c.get('ignoreDistanceSpacing')is not False:return False
    if 'rateDynamics'not in c:return True
    controls=c['rateDynamics']
    if not allow_factors or not isinstance(controls,list)or not 1<=len(controls)<=4 or any(not isinstance(control,dict)or control.get('control')not in('pressure','off')or control.get('jitter')!=0 or 'combine'in control for control in controls):return False
    from convert import validate_portable_dynamics
    try:validate_portable_dynamics(controls)
    except ValueError:return False
    return True

def native_pressure_rate(params):
    from krita_import import enabled,numeric,size_like_controls
    if not enabled(params.get('PaintOpSettings/isAirbrushing'))or enabled(params.get('PaintOpSettings/ignoreSpacing')):raise ValueError('Native Rate requires canonical timer without ignoreSpacing')
    rate=numeric(params.get('PaintOpSettings/rate'),20);controls=[]
    if not math.isfinite(rate)or not 0<rate<=1000:raise ValueError('Native Rate base outside0..1000')
    if enabled(params.get('PressureRate')):
        notes=[];controls=size_like_controls(params,'Rate',notes,allow_time=False);strength=numeric(params.get('RateValue'),1)
        if not math.isfinite(strength)or not 0<=strength<=1:raise ValueError('Native Rate strength outside0..1')
        if any(note['status']=='unsupported'for note in notes)or enabled(params.get('RateUseCurve','true'))and not controls:raise ValueError('Unsupported native Rate sensor')
        if strength!=1:controls.append({'control':'off','minimum':0,'jitter':0,'curve':[[0,strength],[1,strength]]})
        if len(controls)>4 or any(c.get('control')not in('pressure','off')or c.get('jitter')!=0 or 'combine'in c for c in controls):raise ValueError('Native Rate requires pressure/off without fuzzy or combination')
    timing={'version':1,'rate':rate,'ignoreDistanceSpacing':False}
    if controls:timing['rateDynamics']=controls
    if not pressure_rate_timing_scope(timing,True):raise ValueError('Native Rate outside bounded pressure/off policy')
    return timing
