"""Retain source author DATA using the existing bounded KPP XML reader.

No spline compiler, stock IDs, renderer admission, or third resource reader.
Selected curve text/points/corner flags remain independent of any compiler.
"""
import math
import re
import struct

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
    total=2048+sum(len((k+v).encode('utf-8')) for k,v in data['settings'].items())+sum(len(s.encode('utf-8')) for s in data['unsupported'])
    for option in data['options']:
        total+=64
        for curve in [option['commonCurve']]+[s['curve'] for s in option['sensors']]:
            total+=len(curve['text'].encode('utf-8'))+32*len(curve['points'])
        total+=sum(64+len(s['sourceId'].encode('utf-8')) for s in option['sensors'])
    return total


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
    # Mask checkability depends on extractedPrefix and is explicitly not compiled here.
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


def retain_source_stamp(params,definition,width,height,xml,*,depth=0):
    # Preserve raw planner/material inputs, not embedded patterns/resources or thumbnail data.
    if not all(isinstance(k,str) and isinstance(v,str) for k,v in params.items()): raise ValueError('Invalid source setting key/value')
    prefixes=OPTIONS+('Pressure','Custom','Curve','Scattering/','PaintOpSettings/','Texture/Pattern/Enabled','MaskingBrush/','ColorSource/')
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
    reasons=[];options=[]
    if depth: reasons.append('mask-prefix-and-master-size-unresolved')
    if params.get('ColorSource/Type','plain')!='plain': reasons.append('source-color-provider-unresolved')
    if any(finite(definition.get(k,default))!=default for k,default in [('AdjustmentMidPoint',127),('BrightnessAdjustment',0),('ContrastAdjustment',0)]) or flag(definition.get('AutoAdjustMidPoint','false')):
        reasons.append('source-image-adjustments-unavailable')
    try: options=[option_data(params,name,xml,charge) for name in OPTIONS]
    except (ValueError,OverflowError) as error: reasons.append(str(error)[:256])
    scale=finite(definition.get('scale',1))*(2 if definition.get('BrushVersion','1')=='1' else 1);angle=finite(definition.get('angle',0))
    if scale<=0: raise ValueError('Nonpositive native source scale')
    level=integer(params.get('KisPrecisionOption/precisionLevel',5))
    if not 1<=level<=5 or finite(definition.get('spacing',.25))<0 or finite(definition.get('autoSpacingCoeff',1))<0 or finite(params.get('PaintOpSettings/rate',20))<=0: raise ValueError('Invalid native source spacing/precision/rate')
    result={'version':1,'reader':'krita-bd6e8d0-v1','role':'mask' if depth else 'primary','settings':raw,
            'brush':{'width':width,'height':height,'scale':scale,'angle':angle},
            'spacing':{'value':finite(definition.get('spacing',.25)),'automatic':flag(definition.get('useAutoSpacing','false')),'coefficient':finite(definition.get('autoSpacingCoeff',1)),'isotropic':flag(params.get('Spacing/Isotropic','false'))},
            'timing':{'enabled':flag(params.get('PaintOpSettings/isAirbrushing','false')),'rate':finite(params.get('PaintOpSettings/rate',20)),'ignoreDistance':flag(params.get('PaintOpSettings/ignoreSpacing','false'))},
            'precision':{'level':integer(params.get('KisPrecisionOption/precisionLevel',5)),'automatic':flag(params.get('KisPrecisionOption/AutoPrecisionEnabled','false'))},
            'flags':{'scatterX':flag(params.get('Scattering/AxisX','true')),'scatterY':flag(params.get('Scattering/AxisY','true')),'mirrorX':flag(params.get('HorizontalMirrorEnabled','false')),'mirrorY':flag(params.get('VerticalMirrorEnabled','false')),
                     'indirectPainting':params.get('PaintOpAction')=='2' or bool(depth),'textureEnabled':flag(params.get('Texture/Pattern/Enabled','false')),
                     'materialFixed1':not any(flag(params.get('Pressure'+key,'false')) for key in ('Sharpness','Softness','LightnessStrength','h','s','v','Darken','Mix'))},
            'options':options,'unsupported':reasons}
    if source_stamp_budget(result)>MAX_SOURCE_STAMP_BUDGET: raise ValueError('Source stamp aggregate budget exceeded')
    return result


def validate_portable_source_stamp(descriptor):
    if 'sourceStamp' not in descriptor: return
    data=descriptor['sourceStamp']
    if not isinstance(data,dict) or data.get('version')!=1 or data.get('reader')!='krita-bd6e8d0-v1' or data.get('role') not in ('primary','mask'): raise ValueError('Invalid portable source stamp')
    try:
        if source_stamp_budget(data)>MAX_SOURCE_STAMP_BUDGET: raise ValueError('Source stamp aggregate budget exceeded')
    except (KeyError,TypeError,AttributeError): raise ValueError('Invalid portable source stamp budget')
    settings=data.get('settings');brush=data.get('brush')
    if not isinstance(settings,dict) or not all(isinstance(k,str) and isinstance(v,str) for k,v in settings.items()) or not isinstance(brush,dict): raise ValueError('Invalid portable source stamp data')
    if set(brush)!={'width','height','scale','angle'} or any(type(brush.get(k)) is not int or not 1<=brush[k]<=32768 for k in ('width','height')): raise ValueError('Invalid source brush metric')
    from krita_import import xml
    definition=xml(settings.get('brush_definition',''))
    if definition.get('type') not in ('png_brush','gbr_brush'): raise ValueError('Unsupported raw source brush')
    expected=retain_source_stamp(settings,definition,brush['width'],brush['height'],xml,depth=int(data['role']=='mask'))
    def same(a,b):
        if isinstance(b,bool): return type(a) is bool and a==b
        if isinstance(b,(int,float)): return type(a) in (int,float) and math.isfinite(a) and a==b
        if isinstance(b,dict): return isinstance(a,dict) and set(a)==set(b) and all(same(a[k],v) for k,v in b.items())
        if isinstance(b,list): return isinstance(a,list) and len(a)==len(b) and all(same(x,y) for x,y in zip(a,b))
        return type(a) is type(b) and a==b
    if not same(data,expected): raise ValueError('Portable source stamp differs from raw native settings')
    if not 1<=data['precision']['level']<=5 or data['spacing']['value']<0 or data['spacing']['coefficient']<0 or data['timing']['rate']<=0: raise ValueError('Invalid native source spacing/precision/rate')
