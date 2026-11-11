"""Closed single angular ALPHA pipe for non-simple Sketch; no new transport."""
import math,struct,hashlib
from sketch_gih174 import sketch_gih174_scope

def sketch_angular_gih182_scope(d):
    if not isinstance(d,dict)or type(d.get('version'))not in(int,float)or not math.isfinite(d['version'])or d['version']!=int(d['version'])or d['version']<182:return False
    t,b=d.get('tip'),d.get('behavior')
    if not isinstance(t,dict)or not isinstance(b,dict):return False
    a=t.get('animation');input=b.get('strokeInput')
    if not isinstance(a,dict)or set(a)!={'mode','rank','cursorPolicy','frames'}or a.get('mode')!='angular'or a.get('cursorPolicy')!='first-request-v1'or type(a.get('rank'))not in(int,float)or not math.isfinite(a['rank'])or a['rank']!=int(a['rank'])or not isinstance(a.get('frames'),list)or a['rank']!=len(a['frames'])or not 2<=a['rank']<=256:return False
    if input!={'version':1,'initialDirection':'cursorHistory'}or type(input.get('version'))not in(int,float):return False
    return sketch_gih174_scope({**d,'tip':{**t,'animation':{'mode':'incremental','frames':a['frames']}}})

def validate_sketch_angular_gih182(d,parent=None):
    if isinstance(d,dict)and isinstance(d.get('sketch'),dict)and d['sketch'].get('maskSignal')=='gih-alpha-v1'and isinstance(d.get('tip'),dict)and isinstance(d['tip'].get('animation'),dict)and d['tip']['animation'].get('mode')=='angular':
        if parent is not None or not sketch_angular_gih182_scope(d):raise ValueError('Sketch182 requires closed root equal angular alpha GIH')

def private_incremental_alpha182(frames):
    """Only the private common Pixel parser sees incremental; all native frame
    alpha bytes/order survive. Genuine source XML/resource identity is retained
    by the outer Sketch adapter; no global Pixel angular guard is relaxed."""
    encoded=[]
    for image in frames:
        label=b'Captured Sketch182 alpha\0'
        encoded.append(struct.pack('>7I',28+len(label),2,image.width,image.height,1,0x47494d50,25)+label+image.tobytes())
    raw=('Captured Sketch182\n'+str(len(frames))+' dim:1 rank0:'+str(len(frames))+' sel0:incremental\n').encode()+b''.join(encoded)
    return '__grafetto_sketch_angular182_'+hashlib.sha256(raw).hexdigest()+'.gih',raw
