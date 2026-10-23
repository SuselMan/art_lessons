"""Bounded Krita resource reader; independent implementation of documented data.

KPP thumbnails are never used as brush tips. Missing resources and unsupported
paint operations fail explicitly rather than changing the meaning of a preset.
"""
import base64
import hashlib
import io
import math
from pathlib import PurePosixPath
import struct
import xml.etree.ElementTree as ET
import zipfile
from PIL import Image, PngImagePlugin
from brush_contract import MAX_PIXELS, clamp, compatibility, descriptor, finalize_identity

MAX_XML = 32 * 1024 * 1024


def xml(data):
    if len(data) > MAX_XML or '<!ENTITY' in data.upper():
        raise ValueError('Krita XML exceeds limit or declares entities')
    root = ET.fromstring(data)
    count = 0
    def visit(node, depth=0):
        nonlocal count
        count += 1
        if depth > 32 or count > 10000:
            raise ValueError('Krita XML nesting/count limit')
        for child in node:
            visit(child, depth+1)
    visit(root)
    return root


def numeric(value, default=0):
    try:
        n = float(value)
        return n if math.isfinite(n) else default
    except (ValueError, TypeError):
        return default


def enabled(value):
    return str(value).lower() in ('true', '1')


def gbr(data):
    if len(data) < 20:
        raise ValueError('Truncated GBR header')
    header, version, w, h, channels = struct.unpack('>5I', data[:20])
    minimum = 20 if version == 1 else 28
    if version not in (1, 2) or header < minimum or header > len(data) or not 0 < w <= 10000 or not 0 < h <= 10000 or w*h > MAX_PIXELS or channels not in (1, 4):
        raise ValueError('Unsupported GBR header/dimensions')
    if version == 2 and data[20:24] != b'GIMP':
        raise ValueError('Invalid GBR magic')
    end = header+w*h*channels
    if end != len(data):
        raise ValueError('GBR payload size mismatch; animated pipes are not static brushes')
    image = Image.frombytes('L' if channels == 1 else 'RGBA', (w, h), data[header:end])
    # GBR grayscale bytes already encode positive opacity, not a black-on-white image.
    if channels == 4:
        image = image.getchannel('A')
    return image


def raster(data, name, brush=False):
    if name.lower().endswith('.gbr'):
        return gbr(data)
    if name.lower().endswith('.pat'):
        if len(data)<24: raise ValueError('Truncated PAT header')
        header, version, w, h, channels, magic = struct.unpack('>6I',data[:24])
        if version!=1 or magic!=0x47504154 or header<24 or header>len(data) or w*h>MAX_PIXELS or min(w,h)<1 or channels not in (1,3,4) or len(data)!=header+w*h*channels:
            raise ValueError('Unsupported PAT pattern')
        return Image.frombytes({1:'L',3:'RGB',4:'RGBA'}[channels],(w,h),data[header:])
    image = Image.open(io.BytesIO(data))
    if image.width*image.height > MAX_PIXELS:
        raise ValueError('Krita resource exceeds pixel limit')
    image.load()
    if brush:
        # Krita image tips: transparency is coverage; opaque black-on-white tips
        # are masks. Coloured brush application is reported separately.
        if 'A' in image.getbands():
            return image.getchannel('A')
        return image.convert('L').point(lambda v: 255-v)
    return image


def preset(data, name, catalog, external, depth=0):
    if depth>1: raise ValueError('Nested Krita masking brushes exceed supported depth')
    PngImagePlugin.MAX_TEXT_CHUNK = MAX_XML
    PngImagePlugin.MAX_TEXT_MEMORY = MAX_XML * 2
    image = Image.open(io.BytesIO(data))
    if image.format != 'PNG' or image.width*image.height > MAX_PIXELS:
        raise ValueError('KPP must be a bounded PNG')
    image.load() # PNG permits preset text after IDAT as well as before it.
    text = image.info.get('preset')
    if not isinstance(text, str):
        raise ValueError('KPP has no preset XML; its PNG is only a thumbnail')
    root = xml(text)
    if root.tag != 'Preset':
        raise ValueError('Invalid Krita preset root')
    engine = root.get('paintopid')
    if engine not in ('paintbrush', 'colorsmudge'):
        raise ValueError('Unsupported Krita paint engine: '+str(engine))
    params = {p.get('name'): p.text or '' for p in root.findall('param')}
    if len(params) != len(root.findall('param')):
        raise ValueError('Duplicate Krita parameter')
    eraser=params.get('CompositeOp') in ('erase','destination-out') or enabled(params.get('Krita/erase'))
    resources = dict(external)
    for resource in root.findall('./resources/resource'):
        filename = resource.get('filename', '')
        if not filename or len(resource.text or '') > MAX_XML:
            raise ValueError('Invalid embedded Krita resource')
        payload = base64.b64decode(''.join((resource.text or '').split()), validate=True)
        md5 = resource.get('md5sum', '')
        if len(md5) == 32 and hashlib.md5(payload).hexdigest() != md5.lower():
            raise ValueError('Embedded Krita resource checksum mismatch')
        resources[filename] = payload
    def resource(filename):
        matches = [(key, value() if callable(value) else value) for key, value in resources.items() if key == filename or PurePosixPath(key).name == PurePosixPath(filename).name]
        if not filename or not matches:
            raise ValueError('Missing Krita resource: '+filename)
        if any(value != matches[0][1] for _, value in matches):
            raise ValueError('Ambiguous Krita resource: '+filename)
        return matches[0][1]
    definition = xml(params.get('brush_definition', ''))
    warnings = []
    notes = [compatibility('kritaEngine', 'Krita '+engine+' settings translated to Grafetto; vendor pixel equivalence is not claimed.')]
    d = descriptor(data, '')
    kind = definition.get('type')
    if kind == 'auto_brush':
        generator = definition.find('MaskGenerator')
        if generator is None:
            raise ValueError('Missing Krita auto-brush generator')
        shape = generator.get('type', 'circle')
        if shape not in ('circle', 'rect'):
            raise ValueError('Unsupported Krita auto-brush shape: '+shape)
        hardness = clamp((numeric(generator.get('hfade'),1)+numeric(generator.get('vfade'),1))/2)
        ratio = clamp(numeric(generator.get('ratio'),1),0.0625,1)
        d['tip'] = {'kind':'round','hardness':hardness,'aspect':1/ratio,'angle':0,'rotation':'fixed'}
        if shape == 'rect':
            mask = Image.new('L',(256,256),255)
            d['tip']['kind']='bitmap';d['tip']['mask']=catalog.asset(mask,warnings)
        if generator.get('id','default') != 'default' or numeric(generator.get('spikes'),2) != 2 or numeric(definition.get('randomness')) or numeric(definition.get('density'),1) != 1:
            notes.append(compatibility('autoBrush','Gaussian/curve generator, spikes, randomness and density are not reproduced.','unsupported'))
        if enabled(definition.get('useAutoSpacing')):
            notes.append(compatibility('autoSpacing','Adaptive Krita spacing is approximated by the saved fixed spacing.'))
    elif kind in ('gbr_brush', 'png_brush', 'svg_brush', 'abr_brush'):
        filename = definition.get('filename','')
        mask = raster(resource(filename), filename, True)
        d['tip']['mask'] = catalog.asset(mask,warnings)
        d['tip']['aspect']=1/clamp(numeric(definition.get('ratio'),1),0.0625,1)
        if numeric(definition.get('brushApplication')) not in (0,):
            notes.append(compatibility('brushApplication','Lightness/coloured stamp application is approximated as an alpha mask.','unsupported'))
    else:
        raise ValueError('Unsupported Krita brush definition: '+str(kind))
    d['spacing']=clamp(numeric(definition.get('spacing'),0.1),0.000001,2)
    d['tip']['angle']=math.remainder(numeric(definition.get('angle')),2*math.pi)
    d['flow']=clamp(numeric(params.get('FlowValue'),1))
    d['opacity']=clamp(numeric(params.get('OpacityValue'),1))
    behavior={'version':2,'rendering':{'mode':'buildUp','blendMode':'normal','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}}
    modes={'normal':'normal','multiply':'multiply','screen':'screen','overlay':'overlay','darken':'darken','lighten':'lighten','burn':'colorBurn','dodge':'colorDodge','linear_burn':'linearBurn','linear_dodge':'add','add':'add','subtract':'subtract','diff':'difference','exclusion':'exclusion','soft_light':'softLight','hard_light':'hardLight','divide':'divide','hue':'hue','saturation':'saturation','color':'color','luminosity':'luminosity'}
    if eraser: behavior['erase']=True
    mode='normal' if eraser else params.get('CompositeOp','normal')
    if mode in modes:
        behavior['rendering']['blendMode']=modes[mode]
    else:
        notes.append(compatibility('blendMode','Unsupported Krita blend '+mode+'; normal used.','unsupported'))
    for option,field in [('Size','sizeByPressure'),('Opacity','opacityByPressure'),('Flow','flowByPressure')]:
        if not enabled(params.get(option+'UseCurve',params.get('Pressure'+option))):
            continue
        sensor=xml(params.get(option+'Sensor','<params id="pressure"/>'))
        if sensor.get('id') != 'pressure':
            notes.append(compatibility(option+'Sensor','Multiple/non-pressure Krita sensors are not yet reproduced.','unsupported'));continue
        curve=sensor.findtext('curve') or params.get(option+'commonCurve') or '0,0;1,1;'
        points=[[numeric(v) for v in pair.split(',')] for pair in curve.split(';') if pair.strip()]
        if len(points)<2 or len(points)>256 or any(len(p)!=2 or not all(0<=v<=1 for v in p) for p in points) or any(points[i][0] <= points[i-1][0] for i in range(1,len(points))):
            raise ValueError('Invalid Krita pressure curve')
        d[field]=points
    if enabled(params.get('Texture/Pattern/Enabled')):
        filename=params.get('Texture/Pattern/PatternFileName','')
        payload=resource(filename)
        mask=raster(payload,filename)
        aid=catalog.asset(mask,warnings,grain=True)
        d['texture']={'id':aid,'strength':clamp(numeric(params.get('Texture/Strength/Value'),1)),'periodPx':clamp(256*numeric(params.get('Texture/Pattern/Scale'),1),1,4096)}
        notes.append(compatibility('texture','Pattern retained; Krita texture offset, relief and application modes require further translation.'))
    if engine == 'colorsmudge' and not eraser:
        d['model']='mixer';d['mixer']={'load':clamp(numeric(params.get('ColorRateValue'),0.5)),'pickup':clamp(numeric(params.get('SmudgeRateValue'),0.5)),'strength':1}
        notes.append(compatibility('colorSmudge','Krita Color Smudge is approximated using Grafetto carried-pigment mixer; dulling/smearing formulas differ.'))
    active=[k for k in params if k.startswith('Pressure') and enabled(params[k]) and k not in ('PressureSize','PressureOpacity','PressureFlow')]
    if active:
        notes.append(compatibility('activeDynamics',', '.join(sorted(active)),'unsupported'))
    if enabled(params.get('MaskingBrush/Enabled')):
        child_root=ET.Element('Preset',{'paintopid':'paintbrush','name':'Masking component'})
        prefix='MaskingBrush/Preset/'
        for key,value in params.items():
            if key.startswith(prefix): ET.SubElement(child_root,'param',{'name':key[len(prefix):]}).text=value
        child_png=io.BytesIO();meta=PngImagePlugin.PngInfo();meta.add_text('version','5.0');meta.add_text('preset',ET.tostring(child_root,encoding='unicode'),zip=True)
        Image.new('L',(1,1)).save(child_png,format='PNG',pnginfo=meta)
        child_result=preset(child_png.getvalue(),name,catalog,resources,depth+1)
        notes.extend({**note,'feature':'masking.'+note['feature']} for note in child_result['compatibility'])
        child=child_result['descriptor']
        ratio=numeric(params.get('MaskingBrush/MasterSizeCoeff'),1)
        if not enabled(params.get('MaskingBrush/UseMasterSize','true')):
            child_definition=xml(params.get(prefix+'brush_definition',''))
            parent_generator=definition.find('MaskGenerator');child_generator=child_definition.find('MaskGenerator')
            if parent_generator is not None and child_generator is not None:
                ratio=numeric(child_generator.get('diameter'),50)/max(1,numeric(parent_generator.get('diameter'),50))
            else:
                notes.append(compatibility('maskingSize','Absolute size of linked masking tip requires calibration; saved master ratio used.'))
        ratio=clamp(ratio,.01,8)
        child['sizeByPressure']=[[x,y*ratio] for x,y in child['sizeByPressure']]
        child=finalize_identity(child,child_png.getvalue())
        mode=params.get('MaskingBrush/MaskingCompositeOp','multiply')
        combine=modes.get(mode,'multiply')
        if mode not in modes: notes.append(compatibility('maskingBlend','Unsupported Krita masking mode '+mode+'; multiply used.','unsupported'))
        behavior['dual']={'brush':child,'blendMode':combine,'sampling':'independent'}
        notes.append(compatibility('maskingBrush','Independent masking spacing, dynamics and grain retained. Krita-specific edge/colour mixing formulas remain approximate.'))
    if enabled(params.get('AirbrushOption/isAirbrushing')):
        notes.append(compatibility('airbrush','Timed spraying is not reproduced.','unsupported'))
    d['behavior']=behavior
    warnings.extend(n['feature']+': '+n['detail'] for n in notes if n['status']!='supported')
    return {'descriptor':finalize_identity(d,data),'name':root.get('name') or PurePosixPath(name).stem,'source':PurePosixPath(name).name,'warnings':warnings,'compatibility':notes}


def convert_krita(path, catalog):
    if path.suffix.lower() == '.kpp':
        try:
            catalog.brushes.append(preset(path.read_bytes(), path.name, catalog, {}))
        except (ValueError, ET.ParseError, OSError) as error:
            catalog.skipped.append({'name':path.stem,'reasons':[str(error)]})
        return
    with zipfile.ZipFile(path) as archive:
        entries=archive.infolist()
        if len(entries)>4096 or sum(e.file_size for e in entries)>1024*1024*1024 or any(e.file_size>MAX_XML*2 for e in entries):
            raise ValueError('Krita bundle expansion/count limit')
        names=[e.filename for e in entries]
        if len(set(names))!=len(names) or any(n.startswith('/') or '\\' in n or '..' in PurePosixPath(n).parts for n in names):
            raise ValueError('Unsafe or duplicate Krita bundle member')
        resources={n:(lambda entry=n: archive.read(entry)) for n in names if n.lower().endswith(('.gbr','.png','.pat','.jpg','.jpeg','.webp'))}
        for name in sorted(n for n in names if n.lower().endswith('.kpp')):
            try:
                catalog.brushes.append(preset(archive.read(name),name,catalog,resources))
            except (ValueError, ET.ParseError, OSError) as error:
                catalog.skipped.append({'name':PurePosixPath(name).stem,'reasons':[str(error)]})
