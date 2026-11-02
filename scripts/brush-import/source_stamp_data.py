"""Retain source author DATA using the existing bounded KPP XML reader.

No spline compiler, stock IDs, renderer admission, or third resource reader.
Selected curve text/points/corner flags remain independent of any compiler.
"""
import math
import re
import struct
from pathlib import Path
from curve_transfer import native_curve_is_identity
from native_curve_compile import compile_curves, PROFILE, MAX_CURVES, MAX_KNOTS

OPTIONS=('Size','Rotation','Ratio','Scatter','Opacity','Flow','Mirror','Spacing','Rate')
SOURCE_IDS=('pressure','pressurein','tangentialpressure','drawingangle','xtilt','ytilt','ascension','declination','rotation','fuzzy','fuzzystroke','speed','fade','distance','time','perspective')
SENSORS=('pressure','pressureIn','tangentialPressure','drawingAngle','xTilt','yTilt','tiltDirection','tiltElevation','rotation','fuzzyPerDab','fuzzyPerStroke','speed','fade','distance','time','perspective')
IDENTITY='0,0;1,1;'
MAX_SOURCE_STAMP_BUDGET=1048576
MAX_LIBRARY_SOURCE_STAMP_BUDGET=16777216
DECIMAL=re.compile(r'[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?')


def source_stamp_budget(data):
    if not isinstance(data.get('settings'),dict) or len(data['settings'])>256 or not isinstance(data.get('options'),list) or len(data['options'])>9 or not isinstance(data.get('unsupported'),list) or len(data['unsupported'])>32: raise ValueError('Invalid source stamp budget structure')
    if any(not isinstance(k,str) or not isinstance(v,str) or len(k)>128 or len(v)>65536 for k,v in data['settings'].items()): raise ValueError('Source settings budget exceeded')
    for option in data['options']:
        if not isinstance(option,dict) or not isinstance(option.get('sensors'),list) or len(option['sensors'])>16: raise ValueError('Invalid source stamp sensor budget')
        for curve in [option.get('commonCurve')]+[s.get('curve') for s in option['sensors']]:
            if not isinstance(curve,dict) or not isinstance(curve.get('text'),str) or len(curve['text'])>65536 or not isinstance(curve.get('points'),list) or len(curve['points'])>256: raise ValueError('Invalid source stamp curve budget')
    radial=data.get('source',{}).get('softnessCurve')
    if data.get('source',{}).get('kind')=='softAuto':
        if not isinstance(radial,dict) or not isinstance(radial.get('text'),str) or len(radial['text'])>65536 or not isinstance(radial.get('points'),list) or not 1<=len(radial['points'])<=256: raise ValueError('Invalid soft source curve budget')
    total=2048+sum(len((k+v).encode('utf-8')) for k,v in data['settings'].items())+sum(len(s.encode('utf-8')) for s in data['unsupported'])
    if radial is not None: total+=len(radial['text'].encode('utf-8'))+32*len(radial['points'])
    for option in data['options']:
        total+=64
        for curve in [option['commonCurve']]+[s['curve'] for s in option['sensors']]:
            total+=len(curve['text'].encode('utf-8'))+32*len(curve['points'])
        total+=sum(64+len(s['sourceId'].encode('utf-8')) for s in option['sensors'])
    if 'compiled' in data:
        compiled=data['compiled']
        if not isinstance(compiled,dict) or not isinstance(compiled.get('curves'),list) or len(compiled['curves'])>MAX_CURVES: raise ValueError('Invalid compiled source budget')
        if 'textureStrength' in compiled:
            slot=compiled['textureStrength']
            if type(slot) is not dict or set(slot)!={'kind','curve'} or type(slot.get('curve')) is not dict: raise ValueError('Invalid compiled texture budget')
        entries=compiled['curves']+([compiled['radialCurve']] if 'radialCurve' in compiled else [])+([compiled['textureStrength']['curve']] if 'textureStrength' in compiled else [])
        if len(entries)>MAX_CURVES: raise ValueError('Invalid compiled source budget')
        for entry in entries:
            source=entry['source'];coefficients=entry['coefficients']
            if not isinstance(source.get('text'),str) or len(source['text'])>65536 or len(source['points'])>256 or len(coefficients)>255: raise ValueError('Invalid compiled curve budget')
            total+=64+len(source['text'].encode('utf-8'))+32*len(source['points'])+32*len(coefficients)
    return total


def soft_source_material_domain(data):
    """One closed raw material domain; native tool/behavior stays importer-owned."""
    if not isinstance(data,dict) or not isinstance(data.get('unsupported'),list): return False
    source=data.get('source',{});flags=data.get('flags',{});settings=data.get('settings',{})
    if not all(isinstance(v,dict) for v in (source,flags,settings)): return False
    action=settings.get('PaintOpAction')
    return (data.get('version')==2 and data.get('reader')=='krita-bd6e8d0-v1' and data.get('role')=='primary'
            and source.get('kind')=='softAuto' and source.get('generator')=='soft' and source.get('shape')=='circle'
            and source.get('spikes')==2 and source.get('antialias') is False and source.get('randomness')==0 and source.get('density')==1
            and flags.get('materialFixed1') is True and flags.get('textureEnabled') is False
            and type(source.get('diameter')) in (int,float) and math.isfinite(source['diameter']) and 0<source['diameter']<=4096
            and type(source.get('ratio')) in (int,float) and math.isfinite(source['ratio']) and 0<source['ratio']<=1
            and math.floor(source['diameter']*4+.5)+2<=16384
            and isinstance(data.get('options'),list) and len(data['options'])==9
            and (action is None and not flags.get('indirectPainting')
                 or action in ('1','2') and flags.get('indirectPainting')==(action=='2')))


SEEDED_DEFAULT_AUTO_PROFILE='neon64-f32-fma-seeded-density-v1'


def seeded_default_auto_material_domain(data):
    """Data eligibility only; caller separately binds a real mapped provider.

    Preserve the historical reason array. Its sole density tag is meaningful
    only after raw settings, full programs and every material parameter agree.
    """
    try:
        validate_source_stamp_shape({'sourceStamp':data})
        source=data['source'];flags=data['flags'];settings=data['settings']
        compiled=data['compiled']
        if (data['version']!=2 or data['role']!='primary' or source['kind']!='defaultAuto'
                or source['generator']!='default' or source['shape'] not in ('circle','rect')
                or source['spikes']!=2 or source['randomness']!=0
                or not 0<source['diameter']<=4096 or not .0625<=source['ratio']<=1
                or not 0<=source['density']<=1 or not flags['materialFixed1'] or flags['textureEnabled']
                or settings.get('ColorSource/Type','plain')!='plain'
                or len(data['options'])!=9 or compiled['version']!=2
                or compiled['profile']!='eigen-5.0.1-mapped-arm64-f64-v3'):
            return False
        action=settings.get('PaintOpAction')
        if not (action is None and not flags['indirectPainting']
                or action in ('1','2') and flags['indirectPainting']==(action=='2')):
            return False
        reasons=data['unsupported']
        return not reasons or (source['density']<1 and reasons==['default-auto-mask-parameters-unavailable'])
    except (KeyError,TypeError,ValueError,OverflowError):
        return False


def mapped_soft_frontier_retired(data):
    """Recognize a derived data spelling, NOT provider/compiler attestation.

    Full raw and compiled validation still follows. This predicate never calls
    those validators, so mapped raw validation can reuse it without recursion.
    """
    if not soft_source_material_domain(data) or 'soft-auto-raster-author-unavailable' in data['unsupported']: return False
    source=data['source'];compiled=data.get('compiled',{})
    if not isinstance(compiled,dict): return False
    if (set(compiled)!={'version','reader','profile','buildId','curves','radialCurve'}
            or type(compiled['version']) is not int or compiled['version']!=2
            or compiled['reader']!=data['reader'] or compiled['profile']!='eigen-5.0.1-mapped-arm64-f64-v3'
            or not isinstance(compiled['buildId'],str) or not re.fullmatch(r'[0-9a-f]{64}',compiled['buildId'])
            or not isinstance(compiled['curves'],list)): return False
    radial=compiled['radialCurve'];raw=source.get('softnessCurve')
    return (isinstance(radial,dict) and set(radial)=={'source','coefficients'} and isinstance(raw,dict)
            and same_source_data(radial['source'],raw))



def _texture_pressure_source_curve(data, source_kind):
    """Closed optional material DATA. None preserves unsupported legacy imports.

    This selects original raw pressure only, never a raster/author capability.
    No XML reader entity handling or fallback/default curve is involved.
    """
    if type(data) is not dict: return None
    source=data.get('source',{}); flags=data.get('flags',{}); settings=data.get('settings',{})
    if not all(type(v) is dict for v in (source,flags,settings)): return None
    if (data.get('version')!=2 or data.get('role')!='primary' or source.get('kind')!=source_kind
            or data.get('unsupported') or flags.get('textureEnabled') is not True
            or flags.get('materialFixed1') is not True or source.get('spikes')!=2
            or source.get('randomness')!=0 or source.get('density')!=1): return None
    if source_kind=='gaussianAuto' and (data.get('reader')!='krita-bd6e8d0-v1'
            or type(data.get('options')) is not list or len(data['options'])!=9
            or source.get('shape')!='circle' or source.get('antialias') is not False
            or not isinstance(source.get('ratio'),(int,float)) or isinstance(source.get('ratio'),bool)
            or not 0<source['ratio']<=1): return None
    expected={'Texture/Pattern/Enabled':'true','PressureTexture/Strength/':'true',
              'Texture/Strength/StrengthVersion':'2','Texture/Strength/UseCurve':'true',
              'Texture/Strength/UseSameCurve':'true','Texture/Strength/Value':'1',
              'Texture/Strength/curveMode':'0'}
    for key in settings:
        if ((key.startswith('Texture/Strength/') and key not in expected and key!='Texture/Strength/Sensor')
                or (key.startswith('PressureTexture/Strength/') and key!='PressureTexture/Strength/')
                or key.startswith(('CustomTexture/Strength/','CurveTexture/Strength/'))): return None
    if any(settings.get(k)!=v for k,v in expected.items()): return None
    text=settings.get('Texture/Strength/Sensor')
    if type(text) is not str or len(text)>65536: return None
    match=re.fullmatch(r"[ \t\r\n]*(?:<!DOCTYPE params>[ \t\r\n]*)?<params[ \t\r\n]+id[ \t\r\n]*=[ \t\r\n]*(?:\"pressure\"|'pressure')[ \t\r\n]*>[ \t\r\n]*<curve>([^<&]*)</curve>[ \t\r\n]*</params>[ \t\r\n]*",text)
    if match is None: return None
    try: curve=curve_data(match[1].strip())
    except ValueError: return None
    if not 2<=len(curve['points'])<=9 or curve['points'][0]['corner'] or curve['points'][-1]['corner']: return None
    return curve

def texture_pressure_source_curve(data):
    """Existing DefaultAuto pressure DATA; Gaussian never enters this public family."""
    return _texture_pressure_source_curve(data,'defaultAuto')

def gaussian_texture_pressure_source_curve(data):
    """Separate Gaussian pressure DATA only; original random phase is not resolved."""
    return _texture_pressure_source_curve(data,'gaussianAuto')

def texture_native_default_source_curve(data):
    """Pinned native default DATA only; no raw XML rewrite or raster admission."""
    if type(data) is not dict: return None
    source=data.get('source',{}); flags=data.get('flags',{}); settings=data.get('settings',{})
    if not all(type(v) is dict for v in (source,flags,settings)): return None
    if (data.get('version')!=2 or data.get('reader')!='krita-bd6e8d0-v1' or data.get('role')!='primary' or source.get('kind')!='softAuto'
            or type(data.get('options')) is not list or len(data['options'])!=9
            or flags.get('textureEnabled') is not True or flags.get('materialFixed1') is not True): return None
    expected={'Texture/Pattern/Enabled':'true','PressureTexture/Strength/':'true',
              'Texture/Strength/StrengthVersion':'2','Texture/Strength/UseCurve':'true',
              'Texture/Strength/UseSameCurve':'true','Texture/Strength/Value':'1',
              'Texture/Strength/curveMode':'0'}
    for key in settings:
        if ((key.startswith('Texture/Strength/') and key not in expected and key!='Texture/Strength/Sensor')
                or (key.startswith('PressureTexture/Strength/') and key!='PressureTexture/Strength/')
                or key.startswith(('CustomTexture/Strength/','CurveTexture/Strength/'))): return None
    if any(settings.get(k)!=v for k,v in expected.items()): return None
    text=settings.get('Texture/Strength/Sensor')
    if type(text) is not str or len(text)>65536: return None
    if re.fullmatch(r"[ \t\r\n]*(?:<!DOCTYPE params>[ \t\r\n]*)?<params[ \t\r\n]+id[ \t\r\n]*=[ \t\r\n]*(?:\"pressure\"|'pressure')[ \t\r\n]*/>[ \t\r\n]*",text) is None: return None
    # DEFAULT_CURVE_STRING and override order proven at Krita bd6e8d0.
    return curve_data(IDENTITY)

def required_source_curves(data):
    curves={}
    for option in data['options']:
        if not option['checked'] or not option['useCurve']: continue
        for sensor in option['sensors']:
            curve=sensor['curve']
            if not native_curve_is_identity([(p['x'],p['y']) for p in curve['points']]): curves.setdefault(curve['text'],curve)
    return list(curves.values())


def compile_source_stamp(data,executable):
    if not isinstance(executable,(str,Path)) or not Path(executable).is_absolute(): raise ValueError('An explicit absolute native curve compiler is required')
    curves=required_source_curves(data)
    if len(curves)>MAX_CURVES or sum(len(c['points']) for c in curves)>MAX_KNOTS: raise ValueError('Source curve compiler work budget exceeded')
    raw_budget=source_stamp_budget({k:v for k,v in data.items() if k!='compiled'})
    extra=sum(64+len(c['text'].encode('utf-8'))+32*len(c['points'])+32*max(1,len(c['points'])-1) for c in curves)
    if raw_budget+extra>MAX_SOURCE_STAMP_BUDGET: raise ValueError('Compiled source stamp aggregate budget exceeded')
    coefficients=compile_curves([[[p['x'],p['y'],p['corner']] for p in c['points']] for c in curves],executable) if curves else []
    result={'version':1,'reader':data['reader'],'profile':PROFILE,'curves':[{'source':source,'coefficients':pieces} for source,pieces in zip(curves,coefficients)]}
    if source_stamp_budget({**data,'compiled':result})>MAX_SOURCE_STAMP_BUDGET: raise ValueError('Compiled source stamp aggregate budget exceeded')
    return result


def validate_compiled_source_shape(data):
    if 'compiled' not in data: return
    compiled=data['compiled']
    if isinstance(compiled,dict) and compiled.get('version') in (2,3,4):
        from source_stamp_mapped import validate_mapped_source_stamp_shape
        validate_mapped_source_stamp_shape(data,compiled)
        return
    required=required_source_curves(data)
    if (not isinstance(compiled,dict) or set(compiled)!={'version','reader','profile','curves'} or type(compiled['version']) is not int or compiled['version']!=1
            or compiled['reader']!=data['reader'] or compiled['profile']!=PROFILE or not isinstance(compiled['curves'],list) or len(compiled['curves'])!=len(required)
            or len(required)>MAX_CURVES or sum(len(c['points']) for c in required)>MAX_KNOTS): raise ValueError('Invalid compiled source dictionary')
    for entry,source in zip(compiled['curves'],required):
        if not isinstance(entry,dict) or set(entry)!={'source','coefficients'} or not same_source_data(entry['source'],source): raise ValueError('Compiled curve differs from raw source binding')
        pieces=entry['coefficients']
        if not isinstance(pieces,list) or len(pieces)!=max(1,len(source['points'])-1) or any(not isinstance(p,list) or len(p)!=4 or any(type(v) not in (int,float) or not math.isfinite(v) for v in p) for p in pieces): raise ValueError('Invalid compiled source coefficients')


def verify_compiled_source_stamp(data,executable,*,mapped_curve_provider=None):
    if 'compiled' not in data: return
    if data['compiled'].get('version') in (2,3,4):
        from source_stamp_mapped import verify_mapped_source_stamp
        verify_mapped_source_stamp(data,data['compiled'],mapped_curve_provider)
        return
    if executable is None: raise ValueError('An explicit trusted source curve compiler is required for compiled portable data')
    expected=compile_source_stamp(data,executable)
    if not same_source_data(data['compiled'],expected): raise ValueError('Portable source coefficients differ from native compiler')


def same_source_data(a,b):
    if isinstance(b,bool): return type(a) is bool and a==b
    if isinstance(b,(int,float)): return type(a) in (int,float) and math.isfinite(a) and a==b
    if isinstance(b,dict): return isinstance(a,dict) and set(a)==set(b) and all(same_source_data(a[k],v) for k,v in b.items())
    if isinstance(b,list): return isinstance(a,list) and len(a)==len(b) and all(same_source_data(x,y) for x,y in zip(a,b))
    return type(a) is type(b) and a==b


def curve_data(text):
    if not isinstance(text,str) or len(text)>65536 or '\0' in text: raise ValueError('Invalid raw source curve')
    points=[]
    for row in text.split(';'):
        if not row.strip(): continue
        fields=row.split(',')
        if len(fields)<2 or any(v.strip() not in ('','is_corner') for v in fields[2:]): raise ValueError('Unknown raw source curve flag')
        if len(points)>=256 or not all(DECIMAL.fullmatch(v.strip()) for v in fields[:2]): raise ValueError('Invalid raw source decimal point')
        x,y=map(float,fields[:2])
        if not all(math.isfinite(v) and 0<=v<=1 for v in (x,y)) or (points and x<=points[-1]['x']): raise ValueError('Invalid raw source curve points')
        points.append({'x':x,'y':y,'corner':any(v.strip()=='is_corner' for v in fields[2:])})
    if not 1<=len(points)<=256: raise ValueError('Invalid raw source curve count')
    return {'text':text,'points':points}


def flag(value): return str(value).lower() in ('true','1')
def finite(value):
    n=float(value)
    if not math.isfinite(n): raise ValueError('Nonfinite source setting')
    return n

def integer(value):
    if not re.fullmatch(r'[+-]?\d+',str(value).strip()): raise ValueError('Invalid integer source law')
    return int(value)


def option_data(params,name,xml,charge=None):
    def selected_curve(text):
        if charge: charge(len(text.encode('utf-8')))
        data=curve_data(text)
        if charge: charge(32*len(data['points']))
        return data
    # Primary paintbrush standard options: Opacity and Flow always checked.
    # Mask master-size ownership remains explicit unsupported in retained data.
    raw=params.get(name+'Sensor','')
    sensors=[] if not raw else ([xml(raw)] if 'sensorslist' not in raw else list(xml(raw).findall('ChildSensor')))
    if len(sensors)>16: raise ValueError('Too many native sensors')
    selected={}
    common=IDENTITY
    for node in sensors:
        source=node.get('id','')
        if source not in SOURCE_IDS or source in selected: raise ValueError('Unknown or duplicate native sensor')
        selected[source]=(node,node.findtext('curve',IDENTITY));common=node.findtext('curve',IDENTITY)
    # Native reset activates pressure only if no explicitly active sensor survived.
    if not selected: selected={'pressure':(None,IDENTITY)}
    legacy='curve' not in raw and flag(params.get('Custom'+name,'false'))
    if 'curve' not in raw: common=params.get('Curve'+name,IDENTITY) if legacy else IDENTITY
    same=flag(params.get(name+'UseSameCurve','true'))
    if same: common=params.get(name+'commonCurve',common or IDENTITY) or IDENTITY
    records=[]
    for source in SOURCE_IDS:
        if source not in selected: continue
        node,own=selected[source];attrs={} if node is None else node.attrib
        text=common if same else params.get('Curve'+name,IDENTITY) if legacy else own
        sensor={'id':SENSORS[SOURCE_IDS.index(source)],'sourceId':source,'sourceSlot':SOURCE_IDS.index(source),'curve':selected_curve(text)}
        if source in ('fade','distance','time'):
            length=integer(attrs.get('duration' if source=='time' else 'length',1000 if source=='fade' else 30))
            if not 1<=length<=2147483647: raise ValueError('Invalid native sensor length')
            sensor.update(length=length,periodic=integer(attrs.get('periodic','0'))!=0)
        if source=='drawingangle':
            angle=struct.unpack('f',struct.pack('f',finite(attrs.get('angleOffset',0))))[0]
            step=integer(attrs.get('fanCornersStep',30))
            if not math.isfinite(angle) or not 1<=step<=360: raise ValueError('Invalid native fan law')
            sensor.update(angleOffset=angle,lockedAngle=integer(attrs.get('lockedAngleMode','0'))!=0,fanCorners=integer(attrs.get('fanCornersEnabled','0'))!=0,fanStep=step)
        records.append(sensor)
    maximum=5 if name=='Scatter' else 1
    strength=finite(params.get(name+'Value',params.get('Scattering/Amount',maximum) if name=='Scatter' else maximum))
    checkable=name not in ('Opacity','Flow')
    return {'id':name,'checkable':checkable,'checked':not checkable or flag(params.get('Pressure'+name,'false')),
            'useCurve':flag(params.get(name+'UseCurve','true')),'useSameCurve':same,'commonCurve':selected_curve(common),
            'curveMode':integer(params.get(name+'curveMode',0)),'strength':strength,'min':0,'max':maximum,'sensors':records}


def material_option_is_fixed_one(params,name):
    # KisStandardOption::apply returns1 before curve/strength for unchecked data.
    # computeValueComponents(useCurve=false) returns constant strength without
    # sensor access/RNG; unit strength is exactly1 for Softness/Lightness ranges.
    return not flag(params.get('Pressure'+name,'false')) or (not flag(params.get(name+'UseCurve','true')) and finite(params.get(name+'Value',1))==1)


def source_identity(definition):
    kind=definition.get('type')
    if kind in ('png_brush','gbr_brush'): return {'kind':'image'}
    if kind!='auto_brush': raise ValueError('Unsupported raw source brush')
    generator=definition.find('MaskGenerator')
    if generator is None or generator.get('id','default') not in ('default','gauss','soft'): raise ValueError('Unsupported native auto source generator')
    # Pinned KisAutoBrushFactory reader: legacy radius takes precedence; all
    # non-circle XML shape names map to Rectangle (including serialized rct).
    def number(value):
        if not DECIMAL.fullmatch(str(value).strip()): raise ValueError('Invalid native auto decimal')
        return finite(value)
    generator_id=generator.get('id','default')
    result={'kind':{'gauss':'gaussianAuto','soft':'softAuto','default':'defaultAuto'}[generator_id],'generator':generator_id,'shape':'circle' if generator.get('type','circle')=='circle' else 'rect',
            'diameter':number(generator.get('radius',generator.get('diameter',1))), 'ratio':number(generator.get('ratio',1)),
            'horizontalFade':number(generator.get('hfade',0)), 'verticalFade':number(generator.get('vfade',0)),
            'antialias':integer(generator.get('antialiasEdges',0))!=0,'spikes':integer(generator.get('spikes',2)),
            'randomness':number(definition.get('randomness',0)), 'density':number(definition.get('density',1))}
    if generator_id in ('gauss','soft') and result['shape']!='circle': raise ValueError('Unsupported native '+('Gaussian' if generator_id=='gauss' else 'soft')+' auto shape')
    if result['diameter']<=0 or result['ratio']<=0 or not 1<=result['spikes']<=2147483647 or any(not 0<=result[k]<=1 for k in ('horizontalFade','verticalFade','randomness','density')): raise ValueError('Invalid native auto source parameters')
    if generator_id=='soft':
        result['softnessCurve']=curve_data(generator.get('softness_curve') or '0,1;1,0')
    return result


def retain_source_stamp(params,definition,width,height,xml,*,depth=0):
    # Preserve raw planner/material inputs, not embedded patterns/resources or thumbnail data.
    if not all(isinstance(k,str) and isinstance(v,str) for k,v in params.items()): raise ValueError('Invalid source setting key/value')
    prefixes=OPTIONS+('Pressure','Custom','Curve','Scattering/','PaintOpSettings/','Texture/Pattern/Enabled','Texture/Strength/','MaskingBrush/','ColorSource/')
    keys={'brush_definition','HorizontalMirrorEnabled','VerticalMirrorEnabled','PaintOpAction','PrecisionLevel','AutoPrecisionEnabled'}
    raw={k:v for k,v in params.items() if k in keys or k.startswith(prefixes) or 'precision' in k.lower() or 'Sharpness' in k or 'Softness' in k or 'Lightness' in k}
    # Child data lives in its own descriptor; master relationship is retained, not duplicated.
    raw={k:v for k,v in raw.items() if not k.startswith('MaskingBrush/Preset/')}
    if len(raw)>256 or any(len(k)>128 or len(v)>65536 or '\0' in k+v for k,v in raw.items()) or sum(len(k)+len(v) for k,v in raw.items())>1048576:
        raise ValueError('Raw source stamp settings exceed bound')
    budget=2048+sum(len((k+v).encode('utf-8')) for k,v in raw.items())
    def charge(amount):
        nonlocal budget
        budget+=amount
        if budget>MAX_SOURCE_STAMP_BUDGET: raise ValueError('Source stamp aggregate budget exceeded')
    charge(0)
    source=source_identity(definition)
    auto=source['kind'] in ('defaultAuto','gaussianAuto','softAuto')
    if source['kind']=='softAuto': charge(len(source['softnessCurve']['text'].encode('utf-8'))+32*len(source['softnessCurve']['points']))
    if auto:
        width=math.trunc(max(1,source['diameter']));height=math.trunc(max(1,source['diameter']*source['ratio']))
        if not 1<=width<=32768 or not 1<=height<=32768: raise ValueError('Native auto initial dimensions exceed retained source bound')
    reasons=['soft-auto-raster-author-unavailable'] if source['kind']=='softAuto' else [];options=[]
    if auto and (source['spikes']!=2 or source['randomness']!=0 or source['density']!=1): reasons.append(('gaussian' if source['kind']=='gaussianAuto' else 'default')+'-auto-mask-parameters-unavailable')
    if depth: reasons.append('mask-prefix-and-master-size-unresolved')
    if params.get('ColorSource/Type','plain')!='plain': reasons.append('source-color-provider-unresolved')
    if any(finite(definition.get(k,default))!=default for k,default in [('AdjustmentMidPoint',127),('BrightnessAdjustment',0),('ContrastAdjustment',0)]) or flag(definition.get('AutoAdjustMidPoint','false')):
        reasons.append('source-image-adjustments-unavailable')
    try: options=[option_data(params,name,xml,charge) for name in OPTIONS]
    except (ValueError,OverflowError) as error: reasons.append(str(error)[:256])
    scale=1 if auto else finite(definition.get('scale',1))*(2 if definition.get('BrushVersion','1')=='1' else 1)
    angle=finite(definition.get('angle',0))
    spacing_default=1 if auto else .25
    if scale<=0: raise ValueError('Nonpositive native source scale')
    level=integer(params.get('KisPrecisionOption/precisionLevel',5))
    if not 1<=level<=5 or finite(definition.get('spacing',spacing_default))<0 or finite(definition.get('autoSpacingCoeff',1))<0 or finite(params.get('PaintOpSettings/rate',20))<=0: raise ValueError('Invalid native source spacing/precision/rate')
    result={'version':2,'source':source,'reader':'krita-bd6e8d0-v1','role':'mask' if depth else 'primary','settings':raw,
            'brush':{'width':width,'height':height,'scale':scale,'angle':angle},
            'spacing':{'value':finite(definition.get('spacing',spacing_default)),'automatic':flag(definition.get('useAutoSpacing','false')),'coefficient':finite(definition.get('autoSpacingCoeff',1)),'isotropic':flag(params.get('Spacing/Isotropic','false'))},
            'timing':{'enabled':flag(params.get('PaintOpSettings/isAirbrushing','false')),'rate':finite(params.get('PaintOpSettings/rate',20)),'ignoreDistance':flag(params.get('PaintOpSettings/ignoreSpacing','false'))},
            'precision':{'level':integer(params.get('KisPrecisionOption/precisionLevel',5)),'automatic':flag(params.get('KisPrecisionOption/AutoPrecisionEnabled','false'))},
            'flags':{'scatterX':flag(params.get('Scattering/AxisX','true')),'scatterY':flag(params.get('Scattering/AxisY','true')),'mirrorX':flag(params.get('HorizontalMirrorEnabled','false')),'mirrorY':flag(params.get('VerticalMirrorEnabled','false')),
                     'indirectPainting':params.get('PaintOpAction')=='2' or bool(depth),'textureEnabled':flag(params.get('Texture/Pattern/Enabled','false')),
                     'materialFixed1':material_option_is_fixed_one(params,'Softness') and material_option_is_fixed_one(params,'LightnessStrength')
                     and not any(flag(params.get('Pressure'+key,'false')) for key in ('Sharpness','h','s','v','Darken','Mix'))},
            'options':options,'unsupported':reasons}
    if source_stamp_budget(result)>MAX_SOURCE_STAMP_BUDGET: raise ValueError('Source stamp aggregate budget exceeded')
    return result


def validate_source_stamp_shape(descriptor):
    if 'sourceStamp' not in descriptor: return
    data=descriptor['sourceStamp']
    if not isinstance(data,dict) or data.get('version') not in (1,2) or data.get('reader')!='krita-bd6e8d0-v1' or data.get('role') not in ('primary','mask'): raise ValueError('Invalid portable source stamp')
    try:
        if source_stamp_budget(data)>MAX_SOURCE_STAMP_BUDGET: raise ValueError('Source stamp aggregate budget exceeded')
    except (KeyError,TypeError,AttributeError): raise ValueError('Invalid portable source stamp budget')
    settings=data.get('settings');brush=data.get('brush')
    if not isinstance(settings,dict) or not all(isinstance(k,str) and isinstance(v,str) for k,v in settings.items()) or not isinstance(brush,dict): raise ValueError('Invalid portable source stamp data')
    if set(brush)!={'width','height','scale','angle'} or any(type(brush.get(k)) is not int or not 1<=brush[k]<=32768 for k in ('width','height')): raise ValueError('Invalid source brush metric')
    from krita_import import xml
    definition=xml(settings.get('brush_definition',''))
    if data['version']==1 and (definition.get('type') not in ('png_brush','gbr_brush') or 'source' in data): raise ValueError('Legacy source data is image-only')
    expected=retain_source_stamp(settings,definition,brush['width'],brush['height'],xml,depth=int(data['role']=='mask'))
    if data['version']==1:
        expected.pop('source');expected['version']=1
    if mapped_soft_frontier_retired(data):
        expected['unsupported']=[reason for reason in expected['unsupported'] if reason!='soft-auto-raster-author-unavailable']
    if not same_source_data({k:v for k,v in data.items() if k!='compiled'},expected): raise ValueError('Portable source stamp differs from raw native settings')
    if not 1<=data['precision']['level']<=5 or data['spacing']['value']<0 or data['spacing']['coefficient']<0 or data['timing']['rate']<=0: raise ValueError('Invalid native source spacing/precision/rate')

    validate_compiled_source_shape(data)


def validate_portable_source_stamp(descriptor,curve_compiler=None,*,mapped_curve_provider=None):
    validate_source_stamp_shape(descriptor)
    if 'sourceStamp' in descriptor:
        verify_compiled_source_stamp(descriptor['sourceStamp'],curve_compiler,mapped_curve_provider=mapped_curve_provider)
