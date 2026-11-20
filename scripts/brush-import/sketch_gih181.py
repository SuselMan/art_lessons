"""Closed pressure-selected ordinary alpha GIH; common selector, no RNG/clock."""
import math
from sketch_gih174 import sketch_gih174_scope

def sketch_pressure_gih181_scope(d):
    if not isinstance(d,dict)or type(d.get('version'))not in(int,float)or not math.isfinite(d['version'])or d['version']!=int(d['version'])or d['version']<181:return False
    t=d.get('tip');a=t.get('animation')if isinstance(t,dict)else None
    if not isinstance(a,dict)or set(a)!={'mode','rank','frames'}or a.get('mode')!='pressure'or type(a.get('rank'))not in(int,float)or not math.isfinite(a['rank'])or a['rank']!=int(a['rank'])or not isinstance(a.get('frames'),list)or a['rank']!=len(a['frames'])or not 2<=a['rank']<=256:return False
    return sketch_gih174_scope({**d,'tip':{**t,'animation':{'mode':'incremental','frames':a['frames']}}})

def validate_sketch_pressure_gih181(d,parent=None):
    if isinstance(d,dict)and isinstance(d.get('sketch'),dict)and d['sketch'].get('maskSignal')=='gih-alpha-v1'and isinstance(d.get('tip'),dict)and isinstance(d['tip'].get('animation'),dict)and d['tip']['animation'].get('mode')=='pressure':
        if parent is not None or not sketch_pressure_gih181_scope(d):raise ValueError('Sketch181 requires closed root pressure equal alpha GIH')
