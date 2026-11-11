"""Equal-size incremental ordinary ALPHA Sketch pipe, no per-line frame change."""
import math,re
from sketch_image_alpha162 import sketch_image_alpha162_scope

def sketch_gih174_scope(d):
    if not isinstance(d,dict)or type(d.get('version'))not in(int,float)or not math.isfinite(d['version'])or d['version']!=int(d['version'])or d['version']<174:return False
    t,s=d.get('tip'),d.get('sketch')
    if not isinstance(t,dict)or not isinstance(s,dict)or s.get('maskSignal')!='gih-alpha-v1':return False
    a=t.get('animation')
    if not isinstance(a,dict)or set(a)!={'mode','frames'}or a.get('mode')!='incremental'or not isinstance(a.get('frames'),list)or not 2<=len(a['frames'])<=256 or any(not isinstance(v,str)or not re.fullmatch(r'asset:[a-f0-9]{64}',v)for v in a['frames'])or t.get('mask')!=a['frames'][0]:return False
    def unit(c):
        values=[p[1]for p in c if isinstance(p,list)and len(p)==2]if isinstance(c,list)else c.get('samples')if isinstance(c,dict)else None
        return isinstance(values,list)and len(values)>=2 and all(type(v)in(int,float)and math.isfinite(v)and 0<=v<=1 for v in values)
    if not unit(d.get('sizeByPressure'))or not isinstance(d.get('behavior'),dict):return False
    for table in(d['behavior'].get('dynamics'),d['behavior'].get('modulations')):
        if table is not None:
            if not isinstance(table,dict):return False
            size=table.get('size')
            if size is not None and not all(isinstance(c,dict)and isinstance(c.get('control'),str)and c['control']in('pressure','off')and c.get('jitter')==0 and all(k in('control','minimum','jitter','curve')for k in c)and('curve'not in c or unit(c['curve']))for c in(size if isinstance(size,list)else[size])):return False
    tip={k:v for k,v in t.items()if k!='animation'}
    return sketch_image_alpha162_scope({**d,'version':162,'tip':tip,'sketch':{**s,'maskSignal':'image-alpha-v1'}})

def validate_sketch_gih174(d,parent=None):
    if isinstance(d,dict)and isinstance(d.get('sketch'),dict)and d['sketch'].get('maskSignal')=='gih-alpha-v1':
        if parent is not None or not sketch_gih174_scope(d):raise ValueError('Sketch174 requires closed root equal incremental alpha GIH')
