"""Closed root ordinary Particle timer. Replay is never retimed."""
import math
from particle_wash134 import particle_wash134_scope

def particle_timer157_scope(d):
    if not isinstance(d,dict)or type(d.get('version'))is not int or d['version']<157 or d.get('flowPer')!='stamp':return False
    b=d.get('behavior');r=b.get('rendering')if isinstance(b,dict)else None;c=b.get('timing')if isinstance(b,dict)else None
    if not isinstance(r,dict)or r.get('accumulation')!='directOver'or not isinstance(c,dict)or set(c)-{'version','rate','ignoreDistanceSpacing','rateDynamics'}:return False
    if type(c.get('version'))is not int or c['version']!=1 or type(c.get('rate'))not in(int,float)or not math.isfinite(c['rate'])or not 0<c['rate']<=1000 or c.get('ignoreDistanceSpacing')is not False:return False
    if 'rateDynamics'in c:
        controls=c['rateDynamics']
        if d['version']<163 or not isinstance(controls,list)or not 1<=len(controls)<=4 or any(not isinstance(control,dict)or control.get('control')not in('pressure','off')or control.get('jitter')!=0 or 'combine'in control for control in controls):return False
        from convert import validate_portable_dynamics
        try:validate_portable_dynamics(controls)
        except ValueError:return False
    # Reuse the same strict static Particle geometry/rendering family predicate;
    # only timing and accumulation differ. Copies do not mutate caller records.
    legacy=dict(d);behavior=dict(b);rendering=dict(r);behavior.pop('timing');rendering['accumulation']='alphaDarken';behavior['rendering']=rendering;legacy['behavior']=behavior
    return particle_wash134_scope(legacy)

def validate_particle_timer157(d,parent=None):
    if isinstance(d,dict)and 'particle'in d and isinstance(d.get('behavior'),dict)and 'timing'in d['behavior']:
        if parent is not None or not particle_timer157_scope(d):raise ValueError('Particle timer157 requires closed root directOver scope')
