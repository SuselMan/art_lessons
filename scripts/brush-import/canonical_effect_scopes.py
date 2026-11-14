"""Portable-only closed source opt-ins; historical descriptors are untouched."""
import math

def _record(v):return isinstance(v,dict)
def _number(v,lo,hi):return type(v)in(int,float)and math.isfinite(v)and lo<=v<=hi

def validate_canonical_effect_scopes(d,depth=0):
    deform=d.get('deform');f=d.get('filter')
    if d.get('version')==192:
        from filter_mask192 import validate_filter192
        validate_filter192(d,depth)
        return
    if d.get('version')==186:
        if depth or not filter_host_initial186_static(d):raise ValueError('Filter186 requires root static pressure-off host-initial scope')
        version=169 if d['tip']['kind']=='bitmap'and f['kind']=='invert'else 179 if d['tip']['kind']=='bitmap'else 159 if f['kind']=='unsharp'else 153 if f['kind']=='gaussian'else 147
        validate_canonical_effect_scopes({**d,'version':version},depth)
        return
    if _record(deform)and _record(d.get('behavior'))and 'timing'in d['behavior']and type(d.get('version'))is int and d['version']>=160:
        from deform_timer160 import validate_deform_timer160
        validate_deform_timer160(d,depth)
        return
    if _record(deform)and 'sourcePolicy'in deform:
        b=d.get('behavior');m=d.get('mixer');r=b.get('rendering')if _record(b)else None
        if(depth or type(d.get('version'))is not int or d['version']!=145 or deform.get('sourcePolicy')!='canonical-begin-v1'
           or set(deform)-{'version','sourcePolicy','mode','amount','counter','bilinear','density','jitter','baseScale'}or type(deform.get('version'))is not int or deform['version']!=1
           or type(deform.get('mode'))is not int or not 1<=deform['mode']<=8 or any(not _number(deform.get(k),lo,hi)for k,lo,hi in(('amount',0,1),('density',0,1),('jitter',0,10),('baseScale',.01,10)))or any(type(deform.get(k))is not bool for k in('counter','bilinear'))
           or d.get('model')!='mixer'or not _record(m)or m.get('source')!='previousCanvas'or any(k in m for k in('algorithm','sampling','foreground','paintThickness'))
           or any(k in d for k in('experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet','clone','mypaint','tangentNormal','filter'))or not _number(d.get('paperInteraction'),0,0)
           or not _record(b)or b.get('version')!=2 or any(k in b for k in('erase','dual','timing','wetMix','taper'))or not _record(r)or r.get('accumulation')!='directOver'or r.get('blendMode')!='normal'or not _number(r.get('wetEdges'),0,0)or not _number(r.get('burntEdges'),0,0)):
            raise ValueError('Deform145 requires closed root canonical BEGIN scope')
    if _record(f)and 'maskPolicy'in f and d.get('version')==179:
        if f.get('kind')not in('desaturate','posterize','gaussian','unsharp')or f.get('maskPolicy')!='bitmap-alpha-v1':raise ValueError('Filter179 requires one of four existing bitmap filters')
        validate_canonical_effect_scopes({**d,'version':169,'filter':{'version':2,'kind':'invert','smudgeMode':True,'sourcePolicy':'canonical-begin-v1','maskPolicy':'bitmap-alpha-v1'}},depth)
        t=d['tip'];proxy={**d,'filter':{k:v for k,v in f.items()if k!='maskPolicy'},'tip':{'kind':'round',**{k:t[k]for k in('hardness','aspect','rotation','angle')}}}
        if f['kind']=='unsharp':proxy['version']=159
        validate_canonical_effect_scopes(proxy,depth)
        return
    if _record(f)and f.get('spatialPolicy')=='unsharp-lab-halo-v1':
        keys={'version','kind','radiusX','radiusY','amount','threshold','lightnessOnly','smudgeMode','sourcePolicy','spatialPolicy'}
        if(depth or type(d.get('version'))is not int or d['version']!=159 or set(f)!=keys or type(f.get('version'))is not int or f['version']!=1 or f.get('kind')!='unsharp'or f.get('smudgeMode')is not True or f.get('sourcePolicy')!='canonical-begin-v1'or not _number(f.get('radiusX'),0,16)or f.get('radiusY')!=f['radiusX']or not _number(f.get('amount'),0,5)or type(f.get('threshold'))is not int or not 0<=f['threshold']<=255 or type(f.get('lightnessOnly'))is not bool):raise ValueError('Unsharp159 requires closed Lab/alpha spatial policy')
        b=d.get('behavior',{})
        if 'softness'in b or any(isinstance(b.get(k),dict)and 'softness'in b[k]for k in('dynamics','modulations')):raise ValueError('Unsharp159 dynamicsoftness unsupported')
        validate_canonical_effect_scopes({**d,'filter':{'version':2,'kind':'invert','smudgeMode':True,'sourcePolicy':'canonical-begin-v1'}},depth)
        return
    if _record(f)and 'spatialPolicy'in f:
        keys={'version','kind','radiusX','radiusY','amount','threshold','lightnessOnly','smudgeMode','sourcePolicy','spatialPolicy'}
        if(depth or not _number(d.get('version'),153,1e9)or d['version']!=int(d['version'])or set(f)!=keys or not _number(f.get('version'),1,1)or f.get('kind')!='gaussian'or f.get('smudgeMode')is not True or f.get('sourcePolicy')!='canonical-begin-v1'or f.get('spatialPolicy')!='gaussian-halo-v1'or any(not _number(f.get(k),0,16)for k in('radiusX','radiusY'))or not _number(f.get('amount'),.5,.5)or not _number(f.get('threshold'),0,0)or f.get('lightnessOnly')is not True):
            raise ValueError('Gaussian153 requires closed bounded spatial policy')
        proxy={**d,'version':int(d['version']),'filter':{'version':2,'kind':'invert','smudgeMode':True,'sourcePolicy':'canonical-begin-v1'}}
        validate_canonical_effect_scopes(proxy,depth)
        return
    if _record(f)and 'maskPolicy'in f:
        b=d.get('behavior');t=d.get('tip')
        if(depth or type(d.get('version'))is not int or d['version']!=169 or set(f)!={'version','kind','smudgeMode','sourcePolicy','maskPolicy'}or type(f.get('version'))is not int or f['version']!=2 or f.get('kind')!='invert'or f.get('smudgeMode')is not True or f.get('sourcePolicy')!='canonical-begin-v1'or f.get('maskPolicy')!='bitmap-alpha-v1'or not _record(t)or t.get('kind')!='bitmap'or not isinstance(t.get('mask'),str)or not __import__('re').fullmatch(r'asset:[a-f0-9]{64}',t['mask'])or set(t)-{'kind','mask','maskBounds','hardness','aspect','rotation','angle'}or not _record(b)or any(k in b for k in('dual','timing','erase','wetMix','taper','scatter','colorAdjustment'))):raise ValueError('Filter169 requires root ordinary bitmap invert mask')
        if not _number(t.get('hardness'),0,1)or not _number(t.get('aspect'),1,16)or not _number(t.get('angle'),-math.pi*2,math.pi*2)or t.get('rotation')not in('fixed','path','travel'):raise ValueError('Invalid Filter169 bitmap geometry')
        q=t.get('maskBounds')
        if q is not None and(not _record(q)or set(q)!={'x','y','width','height'}or any(not _number(q.get(k),0,1)for k in('x','y','width','height'))or q['width']<1/2048 or q['height']<1/2048 or q['x']+q['width']>1 or q['y']+q['height']>1):raise ValueError('Invalid Filter169 bitmap bounds')
        validate_canonical_effect_scopes({**d,'filter':{'version':2,'kind':'invert','smudgeMode':True,'sourcePolicy':'canonical-begin-v1'},'tip':{'kind':'round','hardness':t.get('hardness'),'aspect':t.get('aspect'),'rotation':t.get('rotation'),'angle':t.get('angle')}},depth)
        return
    if _record(f)and('smudgeMode'in f or 'sourcePolicy'in f):
        b=d.get('behavior');m=d.get('mixer');t=d.get('tip');r=b.get('rendering')if _record(b)else None
        kind=f.get('kind');keys={'version','kind','smudgeMode','sourcePolicy'}|({'type'}if kind=='desaturate'else{'steps'}if kind=='posterize'else set())
        if(depth or type(d.get('version'))is not int or d['version']<147 or f.get('smudgeMode')is not True or f.get('sourcePolicy')!='canonical-begin-v1'or set(f)!=keys or type(f.get('version'))is not int or f['version']!=2 or kind not in('invert','desaturate','posterize')
           or kind=='desaturate'and(type(f.get('type'))is not int or not 0<=f['type']<=5)or kind=='posterize'and(type(f.get('steps'))is not int or not 2<=f['steps']<=128)
           or d.get('model')!='mixer'or not _record(m)or m.get('source')!='previousCanvas'or any(k in m for k in('algorithm','foreground','sampling','paintThickness'))
           or any(k in d for k in('deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet','clone','mypaint','tangentNormal'))or not _number(d.get('paperInteraction'),0,0)
           or not _record(t)or not(t.get('kind')=='round'and 'profile'not in t or t.get('kind')=='procedural'and _record(t.get('profile'))and t['profile'].get('kind')=='standard'and t['profile'].get('shape')=='ellipse')or any(k in t for k in('animation','color','material','imageSampling','autoShape','autoNoise'))
           or not _record(b)or b.get('version')!=2 or b.get('erase')is True or any(k in b for k in('dual','timing','wetMix','taper','scatter','colorAdjustment'))or not _record(r)or r.get('accumulation')!='directOver'or r.get('blendMode')!='normal'or not _number(r.get('wetEdges'),0,0)or not _number(r.get('burntEdges'),0,0)):
            raise ValueError('Filter smudge147 requires closed root pointwise canonical BEGIN scope')


def filter_host_initial186_static(d):
    """Static precondition only; the unchanged147/153/159/169/179 law validates next."""
    if not _record(d)or type(d.get('version'))is not int or d['version']!=186:return False
    f=d.get('filter');t=d.get('tip');b=d.get('behavior');m=d.get('mixer')
    if not all(_record(v)for v in(f,t,b,m))or f.get('smudgeMode')is not True or f.get('sourcePolicy')!='canonical-begin-v1'or f.get('kind')not in('invert','desaturate','posterize','gaussian','unsharp'):return False
    def flat(v):return isinstance(v,list)and len(v)>=2 and all(isinstance(p,list)and len(p)==2 and type(p[0])in(int,float)and math.isfinite(p[0])and type(p[1])in(int,float)and p[1]==1 for p in v)
    if not all(flat(d.get(k))for k in('sizeByPressure','opacityByPressure','flowByPressure'))or not _number(d.get('pressureSmoothingPx'),0,0)or not _number(d.get('flow'),1,1)or d.get('flowPer')!='stamp'or not _number(d.get('opacity'),0,1):return False
    if t.get('rotation')!='fixed'or set(b)-{'version','rendering','spacing','speedInput'}:return False
    if 'spacing'in b and(not _record(b['spacing'])or set(b['spacing'])-{'mode','coefficient','isotropic','axisScale','angleOffset'}):return False
    speed=b.get('speedInput')
    if 'speedInput'in b and(not _record(speed)or set(speed)!={'version','space','maximum','estimator'}or type(speed.get('version'))is not int or speed['version']!=1 or speed.get('space')!='view'or not _number(speed.get('maximum'),30,30)or speed.get('estimator')!='grafettoEMA30ms'):return False
    r=b.get('rendering')
    if not _record(r)or r.get('mode')!='buildUp'or r.get('blendMode')!='normal'or r.get('accumulation')!='directOver'or not _number(r.get('wetEdges'),0,0)or not _number(r.get('burntEdges'),0,0)or set(r)-{'mode','blendMode','accumulation','wetEdges','burntEdges','burntEdgesMode'}:return False
    if set(m)-{'load','pickup','strength','initialLoad','source'}or any(not _number(m.get(k),v,v)for k,v in [('load',0),('pickup',1),('strength',1),('initialLoad',0)])or m.get('source')!='previousCanvas':return False
    if t.get('kind')!='bitmap'and set(t)-{'kind','hardness','aspect','angle','rotation','profile'}:return False
    return True
