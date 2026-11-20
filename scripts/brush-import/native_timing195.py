"""Native host clock delegation; source bytes and older record contracts stay inert.

Native provenance and the family callback matrix live in the195 audit receipt.
This module compiles metadata only, never synthesizes paint or refresh events.
"""
from contextvars import ContextVar
import math,base64

TIMING195 = ContextVar('native_timing195', default=False)
CLOCK_FLAGS = frozenset(('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing','PressureRate'))
NATIVE_ENGINES = frozenset(('paintbrush','roundmarker','colorsmudge','spraybrush','sketchbrush','hairybrush','curvebrush','hatchingbrush','gridbrush','particlebrush','experimentbrush','deformbrush','filter','duplicate','mypaintbrush','tangentnormal'))
RATE_ENGINES = frozenset(('paintbrush','colorsmudge','spraybrush','sketchbrush','particlebrush','deformbrush','tangentnormal'))


def clock_enabled(params, key, default=None):
    """Explicit clock owner bypass, used only by older rendering adapters.

    The settings mapping itself is never edited. Nonclock option evaluation is
    identical to the old enabled(get()) call, including mixed guard key lists.
    """
    from krita_import import enabled
    return False if TIMING195.get() and key in CLOCK_FLAGS else enabled(params.get(key,default))


def native_params(node):
    values={p.get('name'):p.text or''for p in node.findall('param')}
    if len(values)!=len(node.findall('param')):raise ValueError('Duplicate Krita parameter')
    for p in node.findall('param'):
        if p.get('type')=='bytearray':
            values[p.get('name')]=base64.b64decode(''.join((p.text or'').split()),validate=True).decode('utf-8')
    return values


def _number(params,key,default):
    try:value=float(params.get(key,default))
    except (ValueError,TypeError,OverflowError):raise ValueError('Invalid native195 '+key)from None
    if not math.isfinite(value) or not 0<=value<=1000:raise ValueError('Native195 '+key+' outside finite0..1000')
    return value


def validate_native_intervals(timing):
    # Native host uses floor(.5*1000/rate); engine interval is1000/rate.
    # Keep exact finite int32 conversion bounds, including fractional endpoints.
    for key,factor in(('rate',1000),('hostRate',500)):
        value=timing[key]
        if value:
            interval=factor/value
            if not math.isfinite(interval)or math.floor(interval)>2147483647:
                raise ValueError('Native195 '+key+' interval exceeds signed32 milliseconds')


def _native_bool(params,key):
    value=params.get(key,'false')
    if type(value)is bool:return value
    text=str(value).strip().lower()
    if text not in('true','false','1','0',''):raise ValueError('Invalid native195 boolean '+key)
    return text in('true','1')


def native_timing(params,engine):
    from krita_import import enabled,size_like_controls
    from independent_mask190 import COMPONENT190
    timing={'version':2,'rate':_number(params,'PaintOpSettings/rate',20),
            'hostRate':_number(params,'PaintOpSettings/rate',1),
            'ignoreDistanceSpacing':_native_bool(params,'PaintOpSettings/ignoreSpacing'),
            'updateSpacingBetweenDabs':_native_bool(params,'PaintOpSettings/updateSpacingBetweenDabs')}
    validate_native_intervals(timing)
    notes=[]
    # MyPaint and refresh-only consumers do not instantiate a Rate option.
    if engine in RATE_ENGINES and enabled(params.get('PressureRate')):
        token=COMPONENT190.set(True)
        try:controls=size_like_controls(params,'Rate',notes,allow_time=True)
        finally:COMPONENT190.reset(token)
        try:strength=float(params.get('RateValue','1'))
        except(ValueError,TypeError):raise ValueError('Invalid native195 Rate strength')from None
        if not math.isfinite(strength)or not 0<=strength<=1:raise ValueError('Native195 Rate strength outside0..1')
        if any(n['status']=='unsupported'for n in notes)or enabled(params.get('RateUseCurve','true'))and not controls:raise ValueError('Unsupported native195 Rate expression')
        # Native compound expressions already own strength before clamping.
        if strength!=1 and not any('combine'in c for c in controls):
            controls.append({'control':'off','minimum':0,'jitter':0,'curve':[[0,strength],[1,strength]]})
        if controls:timing['rateDynamics']=controls
    return timing,notes


def lower_timing195(data,node,params,name,catalog,external,impl,options):
    from brush_contract import compatibility,finalize_identity
    engine=node.get('paintopid')
    if engine not in NATIVE_ENGINES:raise ValueError('Unsupported native195 host consumer')
    timing,notes=native_timing(params,engine)
    token=TIMING195.set(True)
    try:result=impl(data,name,catalog,external,0,**options)
    finally:TIMING195.reset(token)
    d=result['descriptor'];d['version']=195;b=d.setdefault('behavior',{});b['timing']=timing
    if engine=='tangentnormal':
        from krita_import import enabled
        d['tangentNormal']['sharpnessChecked']=enabled(params.get('PressureSharpness'))
    # Functional refresh randomness follows81: canonical sourceTime and sensor
    # role, not vendor stream order. Child dabs remain their own retained data.
    def bind(value,path):
        if isinstance(value,dict):
            if value.get('control')=='random':value['randomSource']={'kind':'grafettoSourceTime-v1','key':path}
            for key,item in value.items():
                if key not in('brush','randomSource'):bind(item,path+'/'+key)
        elif isinstance(value,list):
            for index,item in enumerate(value):bind(item,path+'/'+str(index))
    bind(b,'behavior')
    for field in ('mixer','sketch','spray','hatching','curveTrace'):
        if field in d:bind(d[field],field)
    result['compatibility'].extend(notes)
    if engine not in RATE_ENGINES:
        from krita_import import enabled
        if enabled(params.get('PressureRate')):result['compatibility'].append(compatibility('nativeIgnored.Rate','This native consumer does not instantiate a Rate option. Copied Rate controls remain in source identity and do not alter the host cadence.','supported'))
    result['compatibility'].append(compatibility('nativeHost195','Canonical native host clock and independent engine timing retained. Refresh-only, line callback, moving bypass and ordinary distance/time roles derive from the retained family payload. Host default1 differs from engine default20; host rate0 suspends callbacks. Recorded sourceTime requests replay without retiming; author-only nonpainting refresh and keyed functional randomness do not claim native RNG order or pixel identity.','supported'))
    result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    finalize_identity(d,data)
    bad=[n['feature']for n in result['compatibility']if n['status']=='unsupported']
    if bad:raise ValueError('Unlowered active native195 settings: '+', '.join(bad))
    from stationary195 import validate_portable195
    from convert import validate_portable_profile,validate_portable_dynamics
    validate_portable195(d,{key:value['size']for key,value in catalog.assets.items()},validate_portable_profile,validate_portable_dynamics,raw_assets={key:(catalog.output/value['file']).read_bytes()for key,value in catalog.assets.items()})
    return result
