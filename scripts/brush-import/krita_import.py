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


def gaussian_circle(hfade, vfade, diameter, antialias=False, size=256):
    """Sample the normalized erf radial profile, independently of vendor code.

    Format/math reference: KDE Krita kis_gauss_circle_mask_generator.cpp and
    kis_antialiasing_fade_maker.h. This static cache cannot reproduce Krita's
    per-dab scale-dependent antialiasing or subpixel mask regeneration.
    """
    fade=clamp(1-(hfade+vfade)/2,1e-6,1-1e-6)
    center=2.5*(6761*fade-10000)/(math.sqrt(2)*6761*fade)
    factor=1/(2*math.erf(center))
    slope=math.sqrt(2)*12500/(6761*fade)
    def profile(r):
        return clamp(factor*(math.erf(r*slope+center)-math.erf(r*slope-center)))
    start=max(0,1-2/max(diameter,0.000001))
    edge=profile(start)
    pixels=bytearray(size*size)
    for y in range(size):
        for x in range(size):
            radius=math.hypot((x+.5)*2/size-1,(y+.5)*2/size-1)
            coverage=0 if radius>1 else profile(radius)
            if antialias and radius>start and radius<=1:
                coverage=edge*(1-radius)/(1-start)
            pixels[y*size+x]=int(clamp(coverage)*255)
    return Image.frombytes('L',(size,size),bytes(pixels))


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


def gih(data):
    """Read the documented image-pipe container without discarding any frame.

    The currently shipped Krita pipes use one random/incremental dimension.
    Other selection/rank combinations fail explicitly pending runtime support.
    Reference: https://developer.gimp.org/core/standards/gih/
    """
    if len(data)>MAX_XML*2:
        raise ValueError('GIH file exceeds limit')
    first=data.find(b'\n',0,65536)
    second=data.find(b'\n',first+1,65536) if first>=0 else -1
    if second<0:
        raise ValueError('Truncated GIH header')
    header=data[first+1:second].decode('ascii').split()
    try:
        count=int(header[0])
        pairs=[item.split(':',1) for item in header[1:]]
        params=dict(pairs)
        if len(params)!=len(pairs):
            raise ValueError('Duplicate GIH header parameter')
        if not 1<=count<=256 or int(params.get('dim','1'))!=1 or int(params.get('rank0',str(count)))!=count or int(params.get('ncells',str(count)))!=count:
            raise ValueError('Unsupported GIH frame count or dimensions/ranks')
    except (IndexError,ValueError) as error:
        raise ValueError('Invalid or unsupported GIH parameters: '+str(error)) from error
    mode=params.get('sel0',params.get('selection','incremental'))
    if mode not in ('random','incremental'):
        raise ValueError('Unsupported GIH selection mode: '+mode)
    frames=[];offset=second+1;pixels=0;coloured=False
    for _ in range(count):
        # Krita loads valid frames until exact EOF, then indexes modulo the
        # actual count. Its official fairy-dust pipe declares4 but contains1.
        if offset==len(data) and frames:
            break
        if len(data)-offset<20:
            raise ValueError('Truncated GIH frame')
        header_size,version,w,h,channels=struct.unpack('>5I',data[offset:offset+20])
        if header_size>MAX_XML or w*h>MAX_PIXELS or channels not in (1,4):
            raise ValueError('GIH frame exceeds limits')
        length=header_size+w*h*channels
        frame=gbr(data[offset:offset+length])
        frames.append(frame);pixels+=w*h;coloured|=channels==4;offset+=length
        if pixels>MAX_PIXELS:
            raise ValueError('GIH cumulative pixel limit')
    if offset!=len(data):
        raise ValueError('GIH trailing bytes or frame count mismatch')
    return {'mode':mode,'frames':frames,'coloured':coloured,'declaredCount':count}


def tip_asset(mask,catalog,warnings):
    """Match Catalog.asset's resize/padding exactly, including odd offsets."""
    size=max(2,min(2048,1 << (max(mask.size)-1).bit_length()))
    scale=min(1,size/max(mask.size))
    w,h=(max(1,round(side*scale)) for side in mask.size)
    longest=max(w,h)
    if longest==size and ((size-w)%2 or (size-h)%2):
        # A short odd side puts its centered square crop half a texel outside
        # a tight POT. Add transparent padding rather than shift/crop pixels.
        if size>=2048:
            raise ValueError('Odd native tip requires padding beyond 2048 texture limit')
        size*=2
        native=mask.resize((w,h),Image.Resampling.LANCZOS)
        canvas=Image.new(mask.mode,(size,size),0)
        canvas.paste(native,((size-w)//2,(size-h)//2))
        aid=catalog.asset(canvas,warnings)
    else:
        aid=catalog.asset(mask,warnings)
    bounds={'x':((size-w)//2+(w-longest)/2)/size,
            'y':((size-h)//2+(h-longest)/2)/size,
            'width':longest/size,'height':longest/size}
    return aid,bounds


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


def sensor_controls(params, option, notes):
    """Read Krita's single sensor or ChildSensor list into the shared product."""
    if not enabled(params.get(option+'UseCurve','true')):
        return []
    sensor=xml(params.get(option+'Sensor','<params id="pressure"/>'))
    sensors=list(sensor.findall('ChildSensor')) if sensor.get('id')=='sensorslist' else [sensor]
    if len(sensors)>32: raise ValueError('Krita sensor count limit')
    ids=[node.get('id') for node in sensors]
    if len(ids)!=len(set(ids)): raise ValueError('Duplicate Krita sensor')
    if numeric(params.get(option+'curveMode'))!=0:
        notes.append(compatibility(option+'SensorCombination','Non-multiplicative sensor combination is unsupported.','unsupported'))
        return []
    common=params.get(option+'commonCurve') or (sensors[-1].findtext('curve') if sensors else None)
    use_common=enabled(params.get(option+'UseSameCurve','true'))
    controls=[]
    supported={'pressure':'pressure','declination':'tiltElevation','xtilt':'tiltX','ytilt':'tiltY','ascension':'azimuth','speed':'speed','drawingangle':'direction'}
    for node in sensors:
        name=node.get('id','')
        if name not in supported:
            notes.append(compatibility(option+'Sensor','Unsupported Krita sensor '+name,'unsupported'));continue
        curve=(common if use_common and common else node.findtext('curve')) or params.get('Curve'+option,'0,0;1,1;')
        points=[[numeric(v,float('nan')) for v in pair.split(',')] for pair in curve.split(';') if pair.strip()]
        if len(points)<2 or len(points)>256 or any(len(p)!=2 or not all(0<=v<=1 for v in p) for p in points) or any(points[i][0]<=points[i-1][0] for i in range(1,len(points))):
            raise ValueError('Invalid Krita sensor curve')
        # KisCubicCurve clamps outside its first/last knot. Preserve all native
        # interior points and make that endpoint extension explicit.
        if points[0][0]>0:
            points.insert(0,[0,points[0][1]])
        if points[-1][0]<1:
            points.append([1,points[-1][1]])
        if len(controls)>=4:
            notes.append(compatibility(option+'Sensor','More than four active supported sensors; excess controls unsupported.','unsupported'));continue
        controls.append({'control':supported[name],'minimum':0,'jitter':0,'curve':points})
        if name!='pressure':
            notes.append(compatibility(option+'Sensor','Sensor '+name+' uses recorded Grafetto input; speed scaling and curve interpolation require vendor calibration.'))
    return controls


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
    # XML bytearray properties have an outer serialization layer. The embedded
    # pattern string itself is base64, hence two layers for bytearray patterns.
    for p in root.findall('param'):
        if p.get('type')=='bytearray':
            params[p.get('name')]=base64.b64decode(''.join((p.text or '').split()),validate=True).decode('utf-8')
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
    d['version']=4
    source_size=None
    kind = definition.get('type')
    if kind == 'auto_brush':
        generator = definition.find('MaskGenerator')
        if generator is None:
            raise ValueError('Missing Krita auto-brush generator')
        source_size=numeric(generator.get('diameter'),1)
        shape = generator.get('type', 'circle')
        if shape not in ('circle', 'rect'):
            raise ValueError('Unsupported Krita auto-brush shape: '+shape)
        hardness = clamp((numeric(generator.get('hfade'),1)+numeric(generator.get('vfade'),1))/2)
        ratio = clamp(numeric(generator.get('ratio'),1),0.0625,1)
        d['tip'] = {'kind':'round','hardness':hardness,'aspect':1/ratio,'angle':0,'rotation':'fixed'}
        if shape == 'rect':
            mask = Image.new('L',(256,256),255)
            d['tip']['kind']='bitmap';d['tip']['mask']=catalog.asset(mask,warnings)
        gaussian=generator.get('id')=='gauss' and shape=='circle' and numeric(generator.get('spikes'),2)==2
        if gaussian:
            mask=gaussian_circle(numeric(generator.get('hfade'),1),numeric(generator.get('vfade'),1),numeric(generator.get('diameter'),10),enabled(generator.get('antialiasEdges')))
            d['tip']['kind']='bitmap';d['tip']['hardness']=1;d['tip']['mask']=catalog.asset(mask,warnings)
            notes.append(compatibility('gaussianGenerator','Gaussian erf radial profile retained in a static 256px tip; Krita regenerates scale-dependent edge antialiasing and subpixel masks per dab.'))
        if (generator.get('id','default') != 'default' and not gaussian) or numeric(generator.get('spikes'),2) != 2 or numeric(definition.get('randomness')) or numeric(definition.get('density'),1) != 1:
            notes.append(compatibility('autoBrush','Gaussian/curve generator, spikes, randomness and density are not reproduced.','unsupported'))
        if enabled(definition.get('useAutoSpacing')):
            notes.append(compatibility('autoSpacing','Krita adaptive spacing coefficient retained; anisotropic axis metrics and spacing sensors require separate calibration.'))
    elif kind in ('gbr_brush', 'png_brush', 'svg_brush', 'abr_brush'):
        filename = definition.get('filename','')
        if filename.lower().endswith('.gih'):
            pipe=gih(resource(filename))
            frames=pipe['frames']
            if len({frame.size for frame in frames})!=1:
                raise ValueError('GIH frames with unequal dimensions are unsupported')
            assets=[tip_asset(frame,catalog,warnings) for frame in frames]
            mask=frames[0]
            d['tip']['mask'],d['tip']['maskBounds']=assets[0]
            if len(assets)>1:
                d['tip']['animation']={'mode':pipe['mode'],'frames':[asset[0] for asset in assets]}
            if pipe['declaredCount']!=len(frames):
                notes.append(compatibility('gihFrameCount',f"Header declares {pipe['declaredCount']} frames, but exactly {len(frames)} valid frames end at EOF; retained actual frames as Krita does."))
            notes.append(compatibility('gihSelection','All pipe frames retained; random selection uses deterministic Grafetto per-dab randomness rather than Krita RNG.' if pipe['mode']=='random' else 'Incremental pipe selection uses dab sequence modulo actual frame count.'))
            if pipe['coloured']:
                notes.append(compatibility('gihColour','RGBA pipe colour is approximated as alpha coverage; coloured stamp pixels are not retained.','unsupported'))
        else:
            mask = raster(resource(filename), filename, True)
            d['tip']['mask'],d['tip']['maskBounds']=tip_asset(mask,catalog,warnings)
        # KisScalingSizeBrush::userEffectiveSize is longest native side * scale.
        source_size=max(mask.size)*numeric(definition.get('scale'),1)
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
    if enabled(definition.get('useAutoSpacing')):
        behavior['spacing']={'mode':'kritaAuto','coefficient':clamp(numeric(definition.get('autoSpacingCoeff'),1),.001,100)}
    modes={'normal':'normal','multiply':'multiply','screen':'screen','overlay':'overlay','darken':'darken','lighten':'lighten','burn':'colorBurn','dodge':'colorDodge','linear_burn':'linearBurn','linear_dodge':'add','add':'add','subtract':'subtract','diff':'difference','exclusion':'exclusion','soft_light':'softLight','hard_light':'hardLight','divide':'divide','hue':'hue','saturation':'saturation','color':'color','luminosity':'luminosity','linear light':'linearLight','vivid_light':'vividLight','pin_light':'pinLight','hard mix':'hardMix','hard_mix_photoshop':'hardMix','darker color':'darkerColor','lighter color':'lighterColor'}
    if eraser: behavior['erase']=True
    mode='normal' if eraser else params.get('CompositeOp','normal')
    if mode in modes:
        behavior['rendering']['blendMode']=modes[mode]
    else:
        notes.append(compatibility('blendMode','Unsupported Krita blend '+mode+'; normal used.','unsupported'))
    for option,target in [('Size','size'),('Opacity','opacity'),('Flow','flow'),('Scatter','scatter')]:
        if not enabled(params.get('Pressure'+option,params.get(option+'UseCurve','false'))):
            continue
        controls=sensor_controls(params,option,notes)
        if controls:
            # Keep pressure in the canonical curves so dab spacing sees size
            # pressure before sampling; remaining sensors modulate the stamps.
            field={'Size':'sizeByPressure','Opacity':'opacityByPressure','Flow':'flowByPressure'}.get(option)
            pressure=next((control for control in controls if control['control']=='pressure'),None)
            if field and pressure:
                d[field]=pressure['curve'];controls=[control for control in controls if control is not pressure]
            if controls: behavior.setdefault('modulations',{})[target]=controls
            notes.append(compatibility(option+'Curve','Sensor control points retained; Krita cubic curves use Grafetto piecewise-linear interpolation.'))
    if enabled(params.get('PressureScatter')):
        amount=clamp(numeric(params.get('ScatterValue',params.get('Scattering/Amount')),1),0,4)
        x=enabled(params.get('Scattering/AxisX','true'));y=enabled(params.get('Scattering/AxisY','true'))
        if x or y:
            d['scatter']={'count':1,'radius':amount,'scale':1,'sizeJitter':0,'angleJitter':0,'flowJitter':0}
            behavior['scatter']={'countJitter':0,'bothAxes':x and y}
            notes.append(compatibility('scatter','Scatter amount and sensors retained; single-axis orientation and distribution use Grafetto semantics.'))
    if enabled(params.get('Texture/Pattern/Enabled')):
        filename=params.get('Texture/Pattern/PatternFileName','')
        try:
            payload=resource(filename)
            mask=raster(payload,filename)
        except ValueError as error:
            # KisEmbeddedTextureData::loadLinkedPattern uses embedded bytes only
            # when the linked resource is missing, not to hide corrupt resources.
            embedded=params.get('Texture/Pattern/Pattern','')
            if not str(error).startswith('Missing Krita resource:') or not embedded:
                raise
            if len(embedded)>MAX_XML:
                raise ValueError('Embedded Krita pattern exceeds limit')
            payload=base64.b64decode(''.join(embedded.split()),validate=True)
            mask=raster(payload,'embedded.png')
        aid=catalog.asset(mask,warnings,grain=True)
        d['texture']={'id':aid,'strength':clamp(numeric(params.get('Texture/Strength/Value'),1)),'periodPx':clamp(mask.width*numeric(params.get('Texture/Pattern/Scale'),1),1,4096)}
        notes.append(compatibility('texture','Pattern retained; Krita texture offset, relief and application modes require further translation.'))
    if engine == 'colorsmudge' and not eraser:
        # Krita's checkable rate options default unchecked. A disabled colour
        # rate contributes no foreground paint; disabled smudge means full pickup.
        # Source semantics (independent mapping, no vendor implementation copied):
        # KDE/krita plugins/paintops/colorsmudge/kis_colorsmudgeop.cpp,
        # libpaintop/KisKritaSensorPack.cpp and KisCurveOptionData.h.
        # Enabled but missing Value defaults to the option range maximum (1).
        color_rate=clamp(numeric(params.get('ColorRateValue'),1)) if enabled(params.get('PressureColorRate')) else 0
        smudge_rate=clamp(numeric(params.get('SmudgeRateValue'),1)) if enabled(params.get('PressureSmudgeRate')) else 1
        d['model']='mixer';d['mixer']={'load':color_rate,'pickup':smudge_rate,'strength':1}
        notes.append(compatibility('colorSmudge','Krita Color Smudge is approximated using Grafetto carried-pigment mixer; dulling/smearing formulas differ.'))
    active=[k for k in params if k.startswith('Pressure') and enabled(params[k]) and k not in ('PressureSize','PressureOpacity','PressureFlow','PressureScatter')]
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
    result={'descriptor':finalize_identity(d,data),'name':root.get('name') or PurePosixPath(name).stem,'source':PurePosixPath(name).name,'warnings':warnings,'compatibility':notes}
    if source_size is not None:
        result['sourceDefaults']={'sizePx':clamp(source_size,.01,10000),'opacity':d['opacity'],'flow':d['flow']}
    return result


def convert_krita(path, catalog, external=None):
    if path.suffix.lower() == '.kpp':
        try:
            catalog.brushes.append(preset(path.read_bytes(), path.name, catalog, external or {}))
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
        resources=dict(external or {})
        resources.update({n:(lambda entry=n: archive.read(entry)) for n in names if n.lower().endswith(('.gbr','.gih','.png','.pat','.jpg','.jpeg','.webp'))})
        for name in sorted(n for n in names if n.lower().endswith('.kpp')):
            try:
                catalog.brushes.append(preset(archive.read(name),name,catalog,resources))
            except (ValueError, ET.ParseError, OSError) as error:
                catalog.skipped.append({'name':PurePosixPath(name).stem,'reasons':[str(error)]})
