"""Bounded Krita resource reader; independent implementation of documented data.

KPP thumbnails are never used as brush tips. Missing resources and unsupported
paint operations fail explicitly rather than changing the meaning of a preset.
"""
import base64
import hashlib
import io
import math
import re
from pathlib import PurePosixPath
import struct
import xml.etree.ElementTree as ET
import zipfile
from PIL import Image, ImageChops, PngImagePlugin
from brush_contract import MAX_PIXELS, clamp, compatibility, descriptor, finalize_identity
from curve_transfer import native_transfer,scaled_curve
from sequential_xy import compatible as sequential_xy_compatible
from stroke_input import source_policy as stroke_input_policy
from krita_texture import preprocess_texture
from krita_lightness import compile_lightness_planes

MAX_XML = 32 * 1024 * 1024


def preset_preview(image):
    """Author's artwork only; strip preset XML and resources from display PNG."""
    preview = image.convert('RGBA')
    preview.thumbnail((64, 64), Image.Resampling.LANCZOS)
    clean = Image.new('RGBA', preview.size)
    clean.paste(preview)
    output = io.BytesIO()
    clean.quantize(colors=128, method=Image.Quantize.FASTOCTREE).save(output, format='PNG', optimize=True)
    encoded = base64.b64encode(output.getvalue()).decode('ascii')
    if len(encoded) > 90000:
        raise ValueError('Krita preview exceeds display limit')
    return 'data:image/png;base64,' + encoded


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


def radial_curve_samples(curve, diameter):
    """Source-authored resolution is immutable when physical dab axes change."""
    if type(diameter) not in (int,float) or not math.isfinite(diameter) or not 0<diameter<=10000:
        raise ValueError('Invalid soft curve native diameter')
    resolution=math.floor(diameter*4+.5)
    if not 1<=resolution<=40000: raise ValueError('Singular soft curve native resolution')
    transfer=native_transfer(curve,resolution+2)
    # native_transfer's identity bypass belongs to sensors only. A mask always
    # has R+2 values, sampled over R+1 intervals, without sensor epsilon/sign.
    samples=([j/(resolution+1) for j in range(resolution+2)]
             if isinstance(transfer,list) else transfer['samples'])
    return resolution,samples


def radial_curve_lookup(curve, diameter, catalog, warnings):
    resolution,samples=radial_curve_samples(curve,diameter)
    payload=b''.join(struct.pack('>I',math.floor(value*0xffffffff+.5)) for value in samples)
    side=4
    while side*side<len(payload): side*=2
    raw=payload+bytes(side*side-len(payload))
    # An exact square already at the destination POT size: no image resize,
    # normalization or per-entry U8 quantization may touch these packed bytes.
    lookup=catalog.asset(Image.frombytes('L',(side,side),raw),warnings,grain=True)
    return {'kind':'radialCurve','lookup':lookup,'resolution':resolution,'encoding':'unorm32be','antialias':False}


def soft_circle(curve='0,0;1,1', diameter=60, size=256):
    """Independent radial-squared curve coverage (native SoftId circle).

    References: pinned kis_curve_circle_mask_generator.{h,cpp}: norme is r²,
    generator stores inverted opacity, scalar applicator inverts it back.
    Static source curve only; native resolution-dependent AA is not simulated.
    """
    if type(size) is not int or not 2<=size<=2048: raise ValueError('Soft curve raster size exceeds bounds')
    if type(diameter) not in (int,float) or not math.isfinite(diameter) or not 0<diameter<=10000: raise ValueError('Invalid soft curve native diameter')
    resolution=math.floor(diameter*4+.5)
    if resolution<1: raise ValueError('Singular soft curve native resolution')
    transfer=native_transfer(curve,resolution+2)
    samples=([i/(resolution+1) for i in range(resolution+2)] if isinstance(transfer,list) else transfer['samples'])
    def sample(t):
        position=t*resolution;lower=min(resolution,int(position));fraction=position-lower
        return samples[lower]*(1-fraction)+samples[lower+1]*fraction
    data=bytearray(size*size)
    for y in range(size):
        ny=(2*y+1-size)/size
        for x in range(size):
            nx=(2*x+1-size)/size;radius_squared=nx*nx+ny*ny
            if radius_squared<=1:
                coverage=sample(radius_squared)
                data[y*size+x]=255-int((1-coverage)*255)
    return Image.frombytes('L',(size,size),bytes(data))


def gbr(data, preserve_color=False):
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
    if channels == 4 and not preserve_color:
        image = image.getchannel('A')
    return image


def gih(data, preserve_color=False):
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
        frame=gbr(data[offset:offset+length],preserve_color)
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


def has_color(image):
    red,green,blue=image.convert('RGB').split()
    return ImageChops.difference(red,green).getbbox() is not None or ImageChops.difference(red,blue).getbbox() is not None


def integer_image_sampling(image, application, asset_size):
    """Only an unchanged opaque gray source can be recovered from coverage.

    A bounded source domain admits a complete native level bank before a stroke;
    colored/transparent/material and rescaled sources retain their old policy.
    The renderer performs the final whole-brush residency admission separately.
    """
    if application != 0 or max(image.size) > 512 or has_color(image):
        return None
    if image.convert('RGBA').getchannel('A').getextrema() != (255, 255):
        return None
    width, height = image.size
    return {'kind':'integer-pyramid', 'signal':'inverse-gray',
            'sourceRect':{'x':(asset_size-width)//2, 'y':(asset_size-height)//2,
                          'width':width, 'height':height}}


def brush_application(definition, images):
    """KisPredefinedBrushFactory legacy precedence, independent format reader."""
    colorful=any(has_color(image) for image in images)
    legacy=lambda: 0 if numeric(definition.get('ColorAsMask','1'))!=0 or not colorful else 1
    if definition.get('preserveLightness') is not None:
        return 2 if numeric(definition.get('preserveLightness'))!=0 else legacy()
    if definition.get('brushApplication') is not None:
        value=numeric(definition.get('brushApplication'),-1)
        if value not in (0,1,2,3):
            raise ValueError('Unsupported Krita brush application')
        return int(value)
    if definition.get('ColorAsMask') is not None:
        return legacy()
    return 1 if colorful else 0


def image_coverage(image, application=0):
    if application!=0:
        # Existing approximation only; caller reports the resolved unsupported
        # application explicitly. Lightness/RGB/gradient material is not added.
        return image.getchannel('A') if 'A' in image.getbands() else image.convert('L').point(lambda v:255-v)
    rgba=image.convert('RGBA')
    # qGray uses integer11:16:5 weights. Opacity is inverse gray times alpha,
    # rounded to nearest8-bit value; opaque white remains transparent.
    pixels=bytes(((255-((11*r+16*g+5*b)//32))*a+127)//255 for r,g,b,a in rgba.get_flattened_data())
    return Image.frombytes('L',image.size,pixels)


def lightness_planes(image, definition):
    # Native metadata absence matters: explicit AutoAdjustMidPoint=false
    # suppresses the pre-version2 adjustment migration.
    return compile_lightness_planes(image,
        midpoint=int(numeric(definition.get('AdjustmentMidPoint'),127)),
        brightness=numeric(definition.get('BrightnessAdjustment'),0),
        contrast=numeric(definition.get('ContrastAdjustment'),0),
        adjustment_version=int(numeric(definition.get('AdjustmentVersion'),1)),
        auto_midpoint=enabled(definition.get('AutoAdjustMidPoint')) if definition.get('AutoAdjustMidPoint') is not None else None)


def raster(data, name, brush=False):
    if name.lower().endswith('.gbr'):
        image=gbr(data,preserve_color=brush)
        return image_coverage(image) if brush and image.mode=='RGBA' else image
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
        return image_coverage(image)
    return image


def sensor_controls(params, option, notes, *, allow_time=False):
    """Read Krita's single sensor or ChildSensor list into the shared product."""
    if not enabled(params.get(option+'UseCurve','true')):
        return []
    sensor_definition=params.get(option+'Sensor') or '<params id="pressure"/>'
    sensor=xml(sensor_definition)
    sensors=list(sensor.findall('ChildSensor')) if sensor.get('id')=='sensorslist' else [sensor]
    if len(sensors)>32: raise ValueError('Krita sensor count limit')
    ids=[node.get('id') for node in sensors]
    if len(ids)!=len(set(ids)): raise ValueError('Duplicate Krita sensor')
    if option!='Rotation' and sum(name in ('fuzzy','fuzzystroke','ascension','rotation') for name in ids)>1:
        notes.append(compatibility(option+'SensorCombination','Multiple native additive sensors require a summed response; product approximation rejected.','unsupported'))
        return []
    mode=numeric(params.get(option+'curveMode'))
    # Native curveMode combines scaling sensors only. One pressure scaling
    # sensor plus one additive fuzzy has the same result for product/max/min/
    # sum/difference: Cpressure(p)*Cfuzzy(U), not max of those two responses.
    scaling_count=sum(name not in ('fuzzy','fuzzystroke','ascension','drawingangle','rotation') for name in ids)
    if mode!=0 and not (mode in (1,2,3,4) and scaling_count<=1):
        notes.append(compatibility(option+'SensorCombination','Non-multiplicative combination of multiple scaling sensors is unsupported.','unsupported'))
        return []
    legacy_curve=params.get('Curve'+option,'0,0;1,1;') if 'curve' not in sensor_definition and enabled(params.get('Custom'+option)) else '0,0;1,1;'
    common=params.get(option+'commonCurve') or (sensors[-1].findtext('curve') if sensors else None)
    use_common=enabled(params.get(option+'UseSameCurve','true'))
    controls=[]
    supported={'pressure':'pressure','declination':'tiltElevation','xtilt':'tiltX','ytilt':'tiltY','ascension':'azimuth','speed':'speed','drawingangle':'direction','fuzzy':'random','fuzzystroke':'strokeRandom','fade':'dabProgress'}
    if allow_time:supported['time']='time'
    for node in sensors:
        name=node.get('id','')
        if name not in supported:
            notes.append(compatibility(option+'Sensor','Unsupported Krita sensor '+name,'unsupported'));continue
        if name in ('fade','time'):
            raw=node.get('duration','30') if name=='time' else node.get('length','1000')
            try: period=int(raw)
            except (ValueError,OverflowError): period=0
            if not 1<=period<=(2147483647 if name=='time' else 1000000) or (not re.fullmatch(r'[+-]?[0-9]+',raw.strip())if name=='time'else str(period)!=raw.strip()):
                notes.append(compatibility(option+'Sensor','Invalid or out-of-range '+name+' duration/length; sensor unsupported.','unsupported'));continue
        curve=(common if use_common and common else node.findtext('curve')) or legacy_curve
        transfer=native_transfer(curve)
        if len(controls)>=4:
            notes.append(compatibility(option+'Sensor','More than four active supported sensors; excess controls unsupported.','unsupported'));continue
        controls.append({'control':supported[name],'minimum':0,'jitter':0,'curve':transfer})
        if name in ('fade','time'):
            periodic=enabled(node.get('periodic','0'))
            if name=='time':
                try:periodic=int(node.get('periodic','0').strip())!=0
                except(ValueError,TypeError):periodic=False
            controls[-1].update(period=period,periodic=periodic)
        if name=='fuzzystroke':
            key=option+'FuzzyStroke'
            if not option or '\0' in key or len(key.encode('utf-16-le','surrogatepass'))//2>128:
                raise ValueError('Invalid native fuzzy-stroke option key')
            controls[-1]['randomSource']={'kind':'qt5Taus88','key':key}
        if name!='pressure':
            notes.append(compatibility(option+'Sensor',
                'Speed is captured in view/widget coordinates, normalized by native default30 and logged before geometry; Grafetto30ms EMA approximates the different native history estimator.' if name=='speed'
                else 'Sensor '+name+' uses recorded Grafetto input; curve interpolation requires vendor calibration.'))
    return controls


def size_like_controls(params, option, notes, *, allow_time=False):
    """Product-only subset; additive/absolute native sensors need other math."""
    if not enabled(params.get(option+'UseCurve','true')): return []
    sensor=xml(params.get(option+'Sensor') or '<params id="pressure"/>')
    sensors=list(sensor.findall('ChildSensor')) if sensor.get('id')=='sensorslist' else [sensor]
    if any(node.get('id') in ('ascension','rotation','drawingangle') for node in sensors):
        notes.append(compatibility(option+'SensorCombination','Additive or absolute native size-like sensor cannot be compiled as a product; constant rate retained.','unsupported'))
        return []
    return sensor_controls(params,option,notes,allow_time=allow_time)


def preset(data, name, catalog, external, depth=0, *, sequential_xy=False, stroke_input=False, timed_input=False):
    if type(sequential_xy) is not bool: raise ValueError('Sequential XY opt-in must be an explicit boolean')
    if type(stroke_input) is not bool: raise ValueError('Stroke input opt-in must be an explicit boolean')
    if type(timed_input) is not bool: raise ValueError('Timed input opt-in must be an explicit boolean')
    if depth>1: raise ValueError('Nested Krita masking brushes exceed supported depth')
    PngImagePlugin.MAX_TEXT_CHUNK = MAX_XML
    PngImagePlugin.MAX_TEXT_MEMORY = MAX_XML * 2
    image = Image.open(io.BytesIO(data))
    if image.format != 'PNG' or image.width*image.height > MAX_PIXELS:
        raise ValueError('KPP must be a bounded PNG')
    image.load() # PNG permits preset text after IDAT as well as before it.
    author_preview = preset_preview(image)
    text = image.info.get('preset')
    if not isinstance(text, str):
        raise ValueError('KPP has no preset XML; its PNG is only a thumbnail')
    root = xml(text)
    if root.tag != 'Preset':
        raise ValueError('Invalid Krita preset root')
    engine = root.get('paintopid')
    if engine not in ('paintbrush', 'colorsmudge', 'roundmarker'):
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
    if engine == 'roundmarker':
        from krita_round import roundmarker_preset
        return roundmarker_preset(data, root, params, name)
    definition = xml(params.get('brush_definition', ''))
    warnings = []
    notes = [compatibility('kritaEngine', 'Krita '+engine+' settings translated to Grafetto; vendor pixel equivalence is not claimed.')]
    d = descriptor(data, '')
    d['version']=27
    source_size=None
    source_metric=None
    application=0
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
        gaussian=generator.get('id')=='gauss' and shape=='circle' and numeric(generator.get('spikes'),2)==2
        gaussian_aa=enabled(generator.get('antialiasEdges'))
        try:
            hf=float(generator.get('hfade','0'));vf=float(generator.get('vfade','0'))
        except (TypeError,ValueError): hf=vf=math.nan
        valid_fade=all(math.isfinite(v) and 0<=v<=1 for v in (hf,vf))
        native_fade=1-(hf+vf)/2 if valid_fade else math.nan
        if native_fade==0: native_fade=1e-6
        elif native_fade==1: native_fade=1-1e-6
        representable_fade=valid_fade and 1e-6<=native_fade<=1-1e-6
        hard_gaussian=hf==1 and vf==1
        procedural_gaussian=(gaussian and engine=='paintbrush' and ratio==1
            and (gaussian_aa or representable_fade) and numeric(definition.get('randomness'))==0
            and numeric(definition.get('density'),1)==1)
        if procedural_gaussian:
            # Existing immutable Gaussian program/frame remains the round path.
            d['tip']['kind']='round'
            d['tip']['profile']={'kind':'gaussian','fade':clamp(1-hardness,1e-6,1-1e-6) if gaussian_aa else native_fade,'antialias':gaussian_aa}
            if not gaussian_aa: d['version']=29 if hard_gaussian else 30
            d['tip']['hardness']=1
            notes.append(compatibility('gaussianProcedural','Erf radial parameters retained with native AA flag; enabled AA uses scale-aware1px fringe/U8 stencil, disabled AA uses one native radial sample without a bitmap halo. GPU erf precision, subpixel placement and scalar/SIMD rounding require comparison.'))
        elif gaussian:
            mask=gaussian_circle(numeric(generator.get('hfade'),1),numeric(generator.get('vfade'),1),numeric(generator.get('diameter'),10),enabled(generator.get('antialiasEdges')))
            d['tip']['kind']='bitmap';d['tip']['hardness']=1;d['tip']['mask']=catalog.asset(mask,warnings)
            notes.append(compatibility('gaussianGenerator','Gaussian erf radial profile retained in a static 256px tip; Krita regenerates scale-dependent edge antialiasing and subpixel masks per dab.'))
        soft=(generator.get('id')=='soft' and shape=='circle' and numeric(generator.get('spikes'),2)==2
              and not enabled(generator.get('antialiasEdges')) and numeric(definition.get('randomness'))==0
              and numeric(definition.get('density'),1)==1)
        if soft:
            curve=generator.get('softness_curve','0,0;1,1')
            # Missing checkable Softness means unchecked in native Krita.
            # Even an enabled constant option is outside this first capability.
            procedural_soft=(not enabled(params.get('PressureSoftness'))
                             and not enabled(params.get('PressureSharpness')))
            if procedural_soft:
                d['tip']['kind']='procedural';d['tip']['hardness']=1
                authored_long_axis=max(source_size,source_size*numeric(generator.get('ratio'),1))
                d['tip']['profile']=radial_curve_lookup(curve,authored_long_axis,catalog,warnings)
                d['version']=31
                notes.append(compatibility('radialCurveProfile','Native authored-diameter4x R+2 squared-radius LUT retained as packed UNORM32BE before mask quantization; physical geometry remains independent. GPU precision/subpixel and scalar/SIMD rounding require native comparison.'))
            else:
                mask=soft_circle(curve,source_size)
                d['tip']['kind']='bitmap';d['tip']['hardness']=1;d['tip']['mask']=catalog.asset(mask,warnings)
                notes.append(compatibility('softCurveGenerator','Static256px source curve fallback; active softness or threshold combinations are outside radialCurve capability.','unsupported'))
            if enabled(params.get('PressureSoftness')):
                notes.append(compatibility('softnessDynamics','Native softness transforms interior curve knots per dab; static base curve retained.','unsupported'))
        if (generator.get('id','default') != 'default' and not gaussian and not soft) or numeric(generator.get('spikes'),2) != 2 or numeric(definition.get('randomness')) or numeric(definition.get('density'),1) != 1:
            notes.append(compatibility('autoBrush','Gaussian/curve generator, spikes, randomness and density are not reproduced.','unsupported'))
        default_generator=generator.get('id','default')=='default'
        softness_checked=enabled(params.get('PressureSoftness'))
        constant_softness=(not softness_checked or
            (not enabled(params.get('SoftnessUseCurve','true')) and numeric(params.get('SoftnessValue'),1)==1))
        standard=(default_generator and shape in ('circle','rect') and numeric(generator.get('spikes'),2)==2
            and numeric(definition.get('randomness'))==0 and numeric(definition.get('density'),1)==1
            and constant_softness)
        if standard:
            horizontal=numeric(generator.get('hfade'),0)
            vertical=numeric(generator.get('vfade'),0)
            if not 0<=horizontal<=1 or not 0<=vertical<=1:
                raise ValueError('Native standard mask fade outside0..1')
            d['tip'].pop('mask',None)
            d['tip']['kind']='procedural'
            d['tip']['profile']={'kind':'standard','shape':'ellipse' if shape=='circle' else 'rectangle',
                'horizontalFade':horizontal,'verticalFade':vertical,'antialias':enabled(generator.get('antialiasEdges'))}
            notes.append(compatibility('standardMaskProfile','Independent axial fade and physical-size U8 scalar1/3/6 antialias sampling retained; scalar/SIMD rounding and undefined hard-circle boundary require comparison.'))
        elif default_generator:
            notes.append(compatibility('standardMaskProfile','Dynamic/nonunit softness, spikes, per-pixel density or randomness remain unsupported; legacy mask approximation retained.','unsupported'))
        if shape=='rect' and not standard:
            mask=Image.new('L',(256,256),255)
            d['tip']['kind']='bitmap';d['tip']['mask']=catalog.asset(mask,warnings)
        if enabled(definition.get('useAutoSpacing')):
            notes.append(compatibility('autoSpacing','Krita adaptive spacing coefficient retained; anisotropic axis metrics and spacing sensors require separate calibration.'))
    elif kind in ('gbr_brush', 'png_brush', 'svg_brush', 'abr_brush'):
        filename = definition.get('filename','')
        material_gray=[]; stamp_images=[]
        if filename.lower().endswith('.gih'):
            pipe=gih(resource(filename),preserve_color=True)
            adjustment_active=any(frame.mode=='RGBA' for frame in pipe['frames'])
            application=brush_application(definition,pipe['frames'])
            if application==1 and engine=='colorsmudge' and not eraser:stamp_images=[frame.convert('RGBA') for frame in pipe['frames']]
            if application==2 and engine=='paintbrush' and all(frame.mode=='RGBA' for frame in pipe['frames']):
                planes=[lightness_planes(frame,definition) for frame in pipe['frames']]
                material_gray=[gray for gray,alpha in planes]
                frames=[alpha for gray,alpha in planes]
            elif stamp_images:
                frames=[frame.getchannel('A') for frame in stamp_images]
            else:
                frames=[frame if frame.mode=='L' else image_coverage(frame,application) for frame in pipe['frames']]
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
            if pipe['coloured'] and application!=0 and not material_gray and not stamp_images:
                notes.append(compatibility('gihColour','RGBA pipe colour is approximated as alpha coverage; coloured stamp pixels are not retained.','unsupported'))
        else:
            image=gbr(resource(filename),preserve_color=True) if filename.lower().endswith('.gbr') else raster(resource(filename),filename)
            adjustment_active=image.mode=='RGBA' if filename.lower().endswith('.gbr') else has_color(image) or image.convert('RGBA').getchannel('A').getextrema()[0]<255
            application=brush_application(definition,[image])
            if application==1 and engine=='colorsmudge' and not eraser:stamp_images=[image.convert('RGBA')]
            if application==2 and engine=='paintbrush' and adjustment_active:
                gray,mask=lightness_planes(image,definition)
                material_gray=[gray]
            elif stamp_images:
                mask=stamp_images[0].getchannel('A')
            else:
                mask=image if filename.lower().endswith('.gbr') and image.mode=='L' else image_coverage(image,application)
            d['tip']['mask'],d['tip']['maskBounds']=tip_asset(mask,catalog,warnings)
            if kind in ('png_brush','gbr_brush') and filename.lower().endswith(('.png','.gbr')) and not material_gray and not stamp_images:
                sampling=integer_image_sampling(image,application,catalog.assets[d['tip']['mask']]['size'])
                if sampling:
                    d['tip']['imageSampling']=sampling
                    notes.append(compatibility('integerImagePyramid','Opaque grayscale source grid retained; native integer levels and bounded preparation replace padded trilinear masks. QPainter residual interpolation and transformed edge rounding still require comparison.'))
            if kind=='svg_brush':
                notes.append(compatibility('svgRasterizer','Pinned official stock SVG rasterized on white at native1000px using librsvg; Qt SVG edge antialiasing may differ. General SVG uploads remain unsupported.'))
        # KisScalingSizeBrush::userEffectiveSize is longest native side * scale.
        source_size=max(mask.size)*numeric(definition.get('scale'),1)
        source_metric=mask.size
        d['tip']['aspect']=1/clamp(numeric(definition.get('ratio'),1),0.0625,1)
        if stamp_images:
            channels=[]
            for frame in stamp_images:
                planes=[tip_asset(frame.getchannel(channel),catalog,warnings) for channel in 'RGB']
                if any(bounds!=d['tip']['maskBounds'] for asset,bounds in planes):raise ValueError('Colour/alpha bounds differ')
                channels.append([asset for asset,bounds in planes])
            d['tip']['color']={'planes':channels[0]}
            if len(channels)>1:d['tip']['color']['frames']=channels
            notes.append(compatibility('colorSmudgeStamp','Original RGB/alpha planes retained; one premultiplied RGBA texture per frame. Bounded source texture filtering differs from native.'))
        elif material_gray:
            gray_assets=[tip_asset(gray,catalog,warnings) for gray in material_gray]
            if any(bounds!=d['tip']['maskBounds'] for asset,bounds in gray_assets):
                raise ValueError('Lightness/alpha plane bounds mismatch')
            strength=clamp(numeric(params.get('LightnessStrengthValue'),1)) if enabled(params.get('PressureLightnessStrength')) else 1
            d['tip']['material']={'kind':'lightness','gray':gray_assets[0][0],'strength':strength}
            if len(gray_assets)>1: d['tip']['material']['grayFrames']=[asset for asset,bounds in gray_assets]
            if enabled(params.get('PressureLightnessStrength')) and enabled(params.get('LightnessStrengthUseCurve','true')):
                notes.append(compatibility('lightnessStrength','Active native lightness-strength sensors are not applied; constant strength retained.','unsupported'))
            notes.append(compatibility('lightnessMaterial','Adjusted straight gray and source alpha retained as paired planes; native premultiplied filtering, RGB lightness tone mapping and U8 rounding require renderer comparison.'))
        elif application!=0:
            application_name={1:'IMAGESTAMP',2:'LIGHTNESSMAP',3:'GRADIENTMAP'}[application]
            notes.append(compatibility('brushApplication',application_name+' resolved from native/legacy flags; its material is unsupported and retains the alpha-mask approximation.','unsupported'))
        elif adjustment_active and (any(numeric(definition.get(key),default)!=default for key,default in [('AdjustmentMidPoint',127),('BrightnessAdjustment',0),('ContrastAdjustment',0)]) or enabled(definition.get('AutoAdjustMidPoint'))):
            notes.append(compatibility('alphaMaskAdjustments','Custom brightness/contrast/midpoint adjustment of image masks is not implemented.','unsupported'))
    else:
        raise ValueError('Unsupported Krita brush definition: '+str(kind))
    d['spacing']=clamp(numeric(definition.get('spacing'),0.1),0.000001,2)
    # Native brush angles are counterclockwise: pyramid negates the sum,
    # and auto brushes rotate destination coordinates back into the mask.
    d['tip']['angle']=math.remainder(-numeric(definition.get('angle')),2*math.pi)
    sharpness_controls=[]
    if enabled(params.get('PressureSharpness')):
        value=numeric(params.get('SharpnessValue',params.get('Sharpness/factor',1)),1)
        softness=numeric(params.get('Sharpness/softness'),0)/100
        if 'SharpnessValue' not in params and 'Sharpness/factor' in params:
            softness=value
        if not 0<=value<=1 or not 0<=softness<=1:
            raise ValueError('Native Sharpness value/softness outside0..1')
        dynamic=enabled(params.get('SharpnessUseCurve','true'))
        if dynamic:
            start=len(notes)
            sharpness_controls=size_like_controls(params,'Sharpness',notes,allow_time=timed_input)
            if not sharpness_controls or any(n['status']=='unsupported' for n in notes[start:]):
                sharpness_controls=[]
                notes.append(compatibility('maskThreshold','Unsupported native Sharpness sensors; no constant threshold substituted.','unsupported'))
        if not dynamic or sharpness_controls:
            d['tip']['alphaThreshold']={'value':value,'softness':softness}
            notes.append(compatibility('maskThreshold','Native U8 alpha threshold retained before texture; supported sensor product evaluated per dab. Subpixel/filter quantization remains approximate.'))
            if sharpness_controls: d['version']=max(d['version'],28)
        if enabled(params.get('Sharpness/alignoutline')):
            notes.append(compatibility('maskThresholdAlignment','Native outline pixel alignment is unsupported.','unsupported'))
    d['flow']=clamp(numeric(params.get('FlowValue'),1))
    d['opacity']=clamp(numeric(params.get('OpacityValue'),1))
    behavior={'version':2,'speedInput':{'version':1,'space':'view','maximum':30,'estimator':'grafettoEMA30ms'},'rendering':{'opacityCeiling':'uniform','mode':'buildUp','blendMode':'normal','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}}
    if sharpness_controls: behavior.setdefault('modulations',{})['sharpness']=sharpness_controls
    spacing_checked=enabled(params.get('PressureSpacing'))
    auto_spacing=enabled(definition.get('useAutoSpacing'))
    isotropic=enabled(params.get('Spacing/Isotropic'))
    # Every source brush spaces against its own actual axes, including plain
    # pressure size. A nominal fallback loses native Fade's emitted-dab clock.
    raw_coefficient=definition.get('autoSpacingCoeff','1') if auto_spacing else definition.get('spacing',str(d['spacing']))
    try:
        coefficient=float(raw_coefficient)
        strength=float(params.get('SpacingValue',1)) if spacing_checked else 1
    except (TypeError,ValueError): raise ValueError('Invalid native spacing coefficient/strength')
    if not math.isfinite(coefficient) or not 0<=coefficient<=100 or not math.isfinite(strength) or not 0<=strength<=1:
        raise ValueError('Native spacing coefficient/strength outside bounded range')
    coefficient*=strength
    if coefficient==0:
        # Any zero axis law reaches the same native .5px floor. This
        # ordinary diameter profile avoids a synthetic fifth control.
        profile={'mode':'diameter','coefficient':0}
        if auto_spacing: notes.append(compatibility('spacingZero','Zero auto spacing represented by equivalent zero diameter law before native distance floor.','supported'))
    else:
        profile={'mode':'kritaAuto' if auto_spacing else 'diameter','coefficient':max(.001,coefficient) if auto_spacing else coefficient}
        if auto_spacing and coefficient<.001:
            notes.append(compatibility('spacingCoefficient','Positive auto coefficient below bounded.001 was raised; native step may differ.','unsupported'))
        if spacing_checked:
            controls=size_like_controls(params,'Spacing',notes,allow_time=timed_input)
            if controls: profile['dynamics']=controls
    if isotropic: profile['isotropic']=True
    behavior['spacing']=profile
    if source_metric is not None:
        # Native spacing uses the unpadded characteristic rectangle, including
        # the static brush angle, before applying the dynamic option rotation.
        # maskBounds is a square UV crop and cannot recover these dimensions.
        width,height=source_metric
        angle=d['tip']['angle'];c,s=abs(math.cos(angle)),abs(math.sin(angle))
        if width!=height or angle!=0:
            longest=max(width,height)
            profile['axisScale']={'x':(c*width+s*height)/longest,'y':(s*width+c*height)/longest}
            if angle!=0: profile['angleOffset']=-angle
    if spacing_checked or isotropic:
        notes.append(compatibility('spacingDynamics','Native spacing strength/response retained after fixed/auto law and before distance floor; update-between-dabs clock, rotated characteristic dimensions and subpixel accumulation still require calibration.'))
    modes={'normal':'normal','multiply':'multiply','screen':'screen','overlay':'overlay','darken':'darken','lighten':'lighten','burn':'colorBurn','dodge':'colorDodge','linear_burn':'linearBurn','linear_dodge':'add','add':'add','subtract':'subtract','diff':'difference','exclusion':'exclusion','soft_light':'softLight','hard_light':'hardLight','divide':'divide','hue':'hue','saturation':'saturation','color':'color','luminosity':'luminosity','linear light':'linearLight','vivid_light':'vividLight','pin_light':'pinLight','hard mix':'hardMix','hard_mix_photoshop':'hardMix','darker color':'darkerColor','lighter color':'lighterColor'}
    if eraser: behavior['erase']=True
    mode='normal' if eraser else params.get('CompositeOp','normal')
    if mode in modes:
        behavior['rendering']['blendMode']=modes[mode]
    else:
        notes.append(compatibility('blendMode','Unsupported Krita blend '+mode+'; normal used.','unsupported'))
    # Native checked Size keeps its constant even when UseCurve=false.
    # Missing PressureSize is unchecked; stale UseCurve/Value do not enable it.
    size_checked=enabled(params.get('PressureSize','false'))
    size_strength=1.0
    if size_checked:
        try: size_strength=float(params.get('SizeValue',1))
        except (TypeError,ValueError): raise ValueError('Invalid native SizeValue')
        if not math.isfinite(size_strength) or not 0<=size_strength<=1:
            raise ValueError('Native SizeValue outside supported0..1')
    for option,target in [('Size','size'),('Opacity','opacity'),('Flow','flow'),('Scatter','scatter')]:
        checked=size_checked if option=='Size' else enabled(params.get('Pressure'+option,params.get(option+'UseCurve','false')))
        if not checked:
            continue
        controls=sensor_controls(params,option,notes,allow_time=timed_input)
        if controls:
            # Keep pressure in the canonical curves so dab spacing sees size
            # pressure before sampling; remaining sensors modulate the stamps.
            field={'Size':'sizeByPressure','Opacity':'opacityByPressure','Flow':'flowByPressure'}.get(option)
            pressure=next((control for control in controls if control['control']=='pressure'),None)
            if field and pressure:
                d[field]=pressure['curve'];controls=[control for control in controls if control is not pressure]
            if controls: behavior.setdefault('modulations',{})[target]=controls
            notes.append(compatibility(option+'Curve','Native natural-cubic response compiled to256-sample float transfer with linear lookup; sensor normalization still requires vendor calibration.'))
    if size_checked and size_strength!=1:
        # Supported normalized size factors are0..1. Bake bounded strength
        # once into the canonical factor, retaining other independent inputs.
        d['sizeByPressure']=scaled_curve(d['sizeByPressure'],size_strength)
        notes.append(compatibility('SizeStrength','Checked native SizeValue retained once as per-dab size multiplier, including constant UseCurve=false.','supported'))
    color_decoded=[]
    for option,target in [('h','hue'),('s','saturation'),('v','value')]:
        if not enabled(params.get('Pressure'+option)): continue
        node=xml(params.get(option+'Sensor') or '<params id="pressure"/>')
        if (enabled(params.get(option+'UseCurve','true')) and numeric(params.get(option+'Value'),1)==1
                and numeric(params.get(option+'curveMode'),0)==0 and node.get('id') in ('fuzzy','pressure')):
            controls=sensor_controls(params,option,notes,allow_time=timed_input)
            if len(controls)==1:
                behavior.setdefault('colorAdjustment',{})[target]=controls[0]
                color_decoded.append('Pressure'+option)
                notes.append(compatibility('hsvAdjustment.'+option,'Per-dab signed HSV adjustment retained for single pressure/random sensor and unit strength; U8 colorspace quantization and vendor random sequence remain approximate.'))
    ratio_decoded=False
    if enabled(params.get('PressureRatio')):
        controls=size_like_controls(params,'Ratio',notes,allow_time=timed_input)
        value=clamp(numeric(params.get('RatioValue'),1))
        # Existing local-Y roundness divides the tip aspect, preserving the
        # native base generator ratio rather than applying it to diameter.
        controls.append({'control':'off','minimum':0,'jitter':0,'curve':[[0,value],[1,value]]})
        if len(controls)<=4:
            behavior.setdefault('modulations',{})['roundness']=controls
            ratio_decoded=True
            notes.append(compatibility('ratioDynamics','Native local-Y ratio and independent sensors retained; Grafetto minimum roundness .02 and maximum aspect20 approximate near-zero native ratios.'))
    rotation_decoded=False
    if enabled(params.get('PressureRotation')) and enabled(params.get('RotationUseCurve','true')):
        rotation_sensor=xml(params.get('RotationSensor','<params id="pressure"/>'))
        rotation_sensors=list(rotation_sensor.findall('ChildSensor')) if rotation_sensor.get('id')=='sensorslist' else [rotation_sensor]
        strength=numeric(params.get('RotationValue'),1)
        # A single additive direction sensor: C(u) is evaluated BEFORE the
        # native additive conversion and strength. Angle offsets are modulo2pi.
        if (len(rotation_sensors)==1 and rotation_sensors[0].get('id')=='ascension'
                and numeric(params.get('RotationcurveMode'),0)==0 and -1<=strength<=1):
            rotation_notes=[]
            controls=sensor_controls(params,'Rotation',rotation_notes,allow_time=timed_input)
            notes.extend(note for note in rotation_notes if note['status']=='unsupported')
            if len(controls)==1:
                control=controls[0];curve=control['curve']
                transform=lambda value:.5+strength*(value-.5)
                if isinstance(curve,list):
                    mapped=[[x,transform(y)] for x,y in curve]
                else:
                    mapped={**curve,'samples':[transform(value) for value in curve['samples']]}
                    # Direction input is normalized unsigned0..1; the mapped
                    # additive output must not restore a signed sensor value.
                    mapped.pop('preserveInputSign',None)
                behavior.setdefault('dynamics',{})['angle']={**control,'control':'tiltDirection','curve':mapped}
                rotation_decoded=True
                notes.append(compatibility('RotationCurve','Single additive tilt-direction response compiled before native angle strength; raw tilt direction includes neutral zero-tilt orientation.'))
    # Native fuzzy is additive [-1,1]. C(u) is evaluated in unsigned space,
    # then mapped back before RotationValue. Physical Qt rotation is
    # -pi + strength*pi*(2*C(u)-1); do not turn a shaped distribution into
    # an uncurved jitter or use a pressure controller as its random source.
    if (not rotation_decoded and enabled(params.get('PressureRotation'))
            and enabled(params.get('RotationUseCurve','true'))
            and len(rotation_sensors)==1 and rotation_sensors[0].get('id')=='fuzzy'
            and numeric(params.get('RotationcurveMode'),0)==0 and -1<=strength<=1):
        node=rotation_sensors[0]
        curve=(params.get('RotationcommonCurve') if enabled(params.get('RotationUseSameCurve','true')) else None) or node.findtext('curve') or (params.get('CurveRotation') if enabled(params.get('CustomRotation')) else None) or '0,0;1,1;'
        transfer=native_transfer(curve)
        transform=lambda value:.5+strength*(value-.5)
        if isinstance(transfer,list): mapped=[[x,transform(y)] for x,y in transfer]
        else:
            mapped={**transfer,'samples':[transform(value) for value in transfer['samples']]}
            mapped.pop('preserveInputSign',None)
        behavior.setdefault('dynamics',{})['angle']={'control':'random','minimum':0,'jitter':0,'curve':mapped}
        rotation_decoded=True
        notes.append(compatibility('RotationFuzzy','Native per-dab additive random angle and response curve retained; deterministic Grafetto RNG differs from Krita random sequence.'))
    if (not rotation_decoded and enabled(params.get('PressureRotation'))
            and enabled(params.get('RotationUseCurve','true')) and len(rotation_sensors)==1
            and rotation_sensors[0].get('id')=='drawingangle'
            and numeric(params.get('RotationcurveMode'),0)==0):
        node=rotation_sensors[0]
        curve=(params.get('RotationcommonCurve') if enabled(params.get('RotationUseSameCurve','true')) else None) or node.findtext('curve') or '0,0;1,1;'
        if native_transfer(curve)==[[0,0],[1,1]] and not enabled(node.get('lockedAngleMode')):
            offset=numeric(node.get('angleOffset'))
            if -360<=offset<=360:
                d['tip']['angle']=math.remainder(d['tip']['angle']+math.radians(offset),2*math.pi)
                behavior['rotation']={'follow':1,'random':'none'}
                rotation_decoded=True
                notes.append(compatibility('RotationDrawingAngle','Absolute drawing direction and angle offset retained for identity sensor curve; corner fanning and locked-angle mode are not reproduced.'))
    if (not rotation_decoded and enabled(params.get('PressureRotation'))
            and enabled(params.get('RotationUseCurve','true')) and numeric(params.get('RotationcurveMode'),0)==0
            and -1<=strength<=1 and 1<=len(rotation_sensors)<=4
            and all(node.get('id') in ('fuzzy','fuzzystroke','pressure','declination','xtilt','ytilt','speed') for node in rotation_sensors)):
        controls=sensor_controls(params,'Rotation',notes,allow_time=timed_input)
        if len(controls)==len(rotation_sensors):
            additive=[c for node,c in zip(rotation_sensors,controls) if node.get('id') in ('fuzzy','fuzzystroke')]
            scaling=[c for node,c in zip(rotation_sensors,controls) if node.get('id') not in ('fuzzy','fuzzystroke')]
            behavior['rotation']={'follow':0,'random':'none','composition':{'strength':strength,'additive':additive,**({'scaling':scaling} if scaling else {})}}
            rotation_decoded=True
            notes.append(compatibility('RotationComposition','Native signed additive minus scaling rotation retained; per-stroke random is option-keyed, deterministic Grafetto random sequences differ from Krita.'))
    if enabled(params.get('PressureScatter')):
        amount=clamp(numeric(params.get('ScatterValue',params.get('Scattering/Amount')),1),0,4)
        x=enabled(params.get('Scattering/AxisX','true'));y=enabled(params.get('Scattering/AxisY','true'))
        if x or y:
            d['scatter']={'count':1,'radius':amount,'scale':1,'sizeJitter':0,'angleJitter':0,'flowJitter':0}
            behavior['scatter']={'countJitter':0,'bothAxes':x and y,'placement':'xyUniform' if x and y else 'pathUniform' if x else 'normalUniform'}
            notes.append(compatibility('scatter','Native axis-selected uniform placement and full diameter amplitude retained; deterministic Grafetto RNG and nominal diameter differ from native RNG and integer dab-bbox diameter.'))
        else:
            behavior.get('modulations',{}).pop('scatter',None)
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
        texture_mode=numeric(params.get('Texture/Pattern/TexturingMode'),0)
        # KisStrengthOption is checkable: unchecked (also the missing-key
        # default) returns1 before reading strength or sensors. UseCurve is
        # independent: stale enabled curves must not revive an unchecked option.
        texture_strength_enabled=enabled(params.get('PressureTexture/Strength/'))
        texture_strength=clamp(numeric(params.get('Texture/Strength/Value'),1)) if texture_strength_enabled else 1
        if texture_mode in (0,1):
            prefix='Texture/Pattern/'
            scale=numeric(params.get(prefix+'Scale'),1)
            if scale<0: raise ValueError('Negative Krita texture scale')
            # Native0/1 skip scaling. Qt rounds transformed rectangle extents;
            # smooth filtering is approximated offline with PIL bilinear.
            grid=mask.size if scale in (0,1) else tuple(max(2,math.floor(v*scale+.5)) for v in mask.size)
            if max(grid)>8192: raise ValueError('Krita texture native period exceeds8192')
            native_width=grid[0]
            target=grid
            if max(grid)>2048:
                ratio=2048/max(grid);target=tuple(max(2,math.floor(v*ratio+.5)) for v in grid)
                warnings.append('Krita scaled pattern exceeds2048; downsampled preserving aspect and native world period')
                notes.append(compatibility('textureResolution','Scaled pattern downsampled to2048; native detail and rounded aspect differ.','unsupported'))
            if target!=mask.size:
                mask=mask.resize(target,Image.Resampling.BILINEAR)
                notes.append(compatibility('textureResampling','Native Qt SmoothTransformation approximated offline with PIL bilinear at rounded integer grid.'))
            mask=preprocess_texture(mask,
                brightness=numeric(params.get(prefix+'Brightness'),0),
                contrast=numeric(params.get(prefix+'Contrast'),1),
                neutral_point=numeric(params.get(prefix+'NeutralPoint'),.5),
                invert=enabled(params.get(prefix+'Invert')),
                cutoff_policy=int(numeric(params.get(prefix+'CutoffPolicy'),0)),
                cutoff_left=int(numeric(params.get(prefix+'CutoffLeft'),0)),
                cutoff_right=int(numeric(params.get(prefix+'CutoffRight'),255)))
            width,height=mask.size
            pot=max(2,1<<(max(width,height)-1).bit_length())
            padded=Image.new('L',(pot,pot));padded.paste(mask,(0,0))
            aid=catalog.asset(padded,warnings,grain=True)
            offset={axis:clamp(numeric(params.get(prefix+'Offset'+axis.upper()),0),-8192,8192) for axis in ('x','y')}
            offset.update(randomX=enabled(params.get(prefix+'isRandomOffsetX')),randomY=enabled(params.get(prefix+'isRandomOffsetY')))
            d['texture']={'id':aid,'strength':texture_strength,
                          'periodPx':native_width,'patternSize':{'width':width,'height':height},
                          'application':{'mode':'multiply' if texture_mode==0 else 'subtract','soft':enabled(params.get(prefix+'UseSoftTexturing'))},'offset':offset}
            if any(abs(numeric(params.get(prefix+'Offset'+axis),0))>8192 for axis in ('X','Y')):
                notes.append(compatibility('textureOffset','Native offset exceeds bounded8192 and was clamped.','unsupported'))
            if offset['randomX'] or offset['randomY']:
                notes.append(compatibility('textureRandomOffset','Per-stroke pattern phase uses deterministic Grafetto RNG rather than Krita RNG.'))
            if enabled(params.get(prefix+'AutoInvertOnErase')):
                notes.append(compatibility('textureEraseInvert','Automatic texture inversion on erasing is not implemented.','unsupported'))
            controls=sensor_controls(params,'Texture/Strength/',notes,allow_time=timed_input) if texture_strength_enabled else []
            if controls: behavior.setdefault('modulations',{})['grainDepth']=controls
            notes.append(compatibility('texture','Native alpha-operation parameters and grid retained; GPU filtering/byte quantization require native comparison.'))
        else:
            aid=catalog.asset(mask,warnings,grain=True)
            d['texture']={'id':aid,'strength':texture_strength,'periodPx':clamp(mask.width*numeric(params.get('Texture/Pattern/Scale'),1),1,4096)}
            notes.append(compatibility('textureApplication','Unsupported native texturing mode '+str(texture_mode)+'; previous grain approximation retained.','unsupported'))
    if engine == 'colorsmudge' and not eraser:
        # Krita's checkable rate options default unchecked. A disabled colour
        # rate contributes no foreground paint; disabled smudge means full pickup.
        # Source semantics (independent mapping, no vendor implementation copied):
        # KDE/krita plugins/paintops/colorsmudge/kis_colorsmudgeop.cpp,
        # libpaintop/KisKritaSensorPack.cpp and KisCurveOptionData.h.
        # Enabled but missing Value defaults to the option range maximum (1).
        try:
            raw_color_rate=float(params.get('ColorRateValue',1))
        except (ValueError,TypeError):
            raise ValueError('Invalid raw native ColorRateValue')
        if not math.isfinite(raw_color_rate) or not 0<=raw_color_rate<=1:
            raise ValueError('Raw native ColorRateValue outside0..1')
        color_rate=raw_color_rate if enabled(params.get('PressureColorRate')) else 0
        try:
            raw_smudge_rate=float(params.get('SmudgeRateValue',1))
        except (ValueError,TypeError):
            raise ValueError('Invalid raw native SmudgeRateValue')
        if not math.isfinite(raw_smudge_rate) or not 0<=raw_smudge_rate<=1:
            raise ValueError('Raw native SmudgeRateValue outside0..1')
        smudge_rate=raw_smudge_rate if enabled(params.get('PressureSmudgeRate')) else 1
        d['model']='mixer';d['mixer']={'load':color_rate,'pickup':smudge_rate,'strength':1,
                                    'initialLoad':color_rate,'smearAlpha':enabled(params.get('SmudgeRateSmearAlpha','true'))}
        # Both pure and foreground canvas paths require this same native
        # canvas ALPHAMASK strategies. Material/interstroke/overlay need separate sources.
        modern=enabled(params.get('SmudgeRateUseNewEngine','false')) or 'color' in d['tip']
        previous_canvas=(numeric(params.get('SmudgeRateMode'),0) in (0,1)
                         and (application==0 or 'color' in d['tip']) and not enabled(params.get('MergedPaint','false'))
                         and (params.get('CompositeOp','normal')=='normal' or (modern and mode in modes)))
        if previous_canvas:
            d['mixer'].update(source='previousCanvas',load=0,initialLoad=0)
            if modern: d['mixer']['algorithm']='krita-stamp' if 'color' in d['tip'] else 'krita-mask'
            # Native has no FlowOption in Color Smudge. Opacity is already in
            # dab.opacity, and is used in two distinct native composition stages.
            d['flow']=1;d['flowByPressure']=[[0,1],[1,1]]
            behavior.get('modulations',{}).pop('flow',None)
            if color_rate>0:
                foreground={'rate':color_rate if modern else clamp(max(1-raw_smudge_rate,.2)*color_rate)}
                controls=size_like_controls(params,'ColorRate',notes,allow_time=timed_input)
                if controls: foreground['dynamics']=controls
                d['mixer']['foreground']=foreground
            if numeric(params.get('SmudgeRateMode'),0)==1:
                radius=numeric(params.get('SmudgeRadiusValue'),3)
                if numeric(params.get('SmudgeRadiusVersion'),1)<2: radius/=100
                radius=clamp(radius,0,3) if enabled(params.get('PressureSmudgeRadius')) else 0
                d['mixer']['sampling']={'mode':'maskMean' if modern else 'uniformMean','radius':min(radius,1) if modern else radius}
                if enabled(params.get('PressureSmudgeRadius')):
                    controls=size_like_controls(params,'SmudgeRadius',notes,allow_time=timed_input)
                    if controls: d['mixer']['sampling']['radiusDynamics']=controls
                notes.append(compatibility('colorSmudge','Legacy normal ALPHAMASK dulling uses previous-canvas uniform mean and optional foreground: fixed64 Halton samples, bounded512px gather and premultiplied RGBA8 differ from native adaptive/colorspace rounding.'))
            else:
                notes.append(compatibility('colorSmudge','Legacy normal ALPHAMASK smearing samples previous canvas with optional foreground; native mask/byte quantization require calibration.'))
            if modern:
                notes=[note for note in notes if note.get('feature')!='colorSmudge']
                notes.append(compatibility('colorSmudge','New ALPHAMASK feedback composition, squared dynamic Color Rate, Smearing/Dulling and mask-weighted mean. Adaptive mask-weighted Halton sampling with64/2% initial batch,16-tap convergence and radius retries;1024 taps/attempt and512px gather cap plus RGBA8 colour-space differences remain.'))
        else:
            d['tip'].pop('color',None)
            notes.append(compatibility('colorSmudge','Unsupported native non-ALPHAMASK, overlay, non-normal or unknown-mode strategy; carried-pigment approximation retained.','unsupported'))
        if enabled(params.get('PressureSmudgeRate')):
            controls=size_like_controls(params,'SmudgeRate',notes,allow_time=timed_input)
            if controls:
                d['mixer']['pickupDynamics']=controls
                notes.append(compatibility('SmudgeRateCurve','Native smudge-rate natural-cubic response compiled to256-sample transfer; sensor normalization remains subject to calibration.'))
    active=[k for k in params if k.startswith('Pressure') and enabled(params[k]) and k not in ('PressureSize','PressureOpacity','PressureFlow','PressureScatter','PressureSmudgeRate') and not (k=='PressureSmudgeRadius' and 'sampling' in d.get('mixer',{})) and not (k=='PressureColorRate' and d.get('mixer',{}).get('source')=='previousCanvas') and not (k=='PressureTexture/Strength/' and d.get('texture',{}).get('application')) and not (k=='PressureSpacing' and 'spacing' in behavior) and not (k=='PressureRotation' and rotation_decoded) and not (k=='PressureRatio' and ratio_decoded) and not (k=='PressureSharpness' and d['tip'].get('alphaThreshold')) and k not in color_decoded and not (k=='PressureLightnessStrength' and d['tip'].get('material'))]
    if active:
        notes.append(compatibility('activeDynamics',', '.join(sorted(active)),'unsupported'))
    if enabled(params.get('MaskingBrush/Enabled')):
        child_root=ET.Element('Preset',{'paintopid':'paintbrush','name':'Masking component'})
        prefix='MaskingBrush/Preset/'
        for key,value in params.items():
            if key.startswith(prefix): ET.SubElement(child_root,'param',{'name':key[len(prefix):]}).text=value
        child_png=io.BytesIO();meta=PngImagePlugin.PngInfo();meta.add_text('version','5.0');meta.add_text('preset',ET.tostring(child_root,encoding='unicode'),zip=True)
        Image.new('L',(1,1)).save(child_png,format='PNG',pnginfo=meta)
        child_result=preset(child_png.getvalue(),name,catalog,resources,depth+1,stroke_input=False,timed_input=timed_input)
        notes.extend({**note,'feature':'masking.'+note['feature']} for note in child_result['compatibility'])
        if stroke_input:
            child_params={key[len(prefix):]:value for key,value in params.items() if key.startswith(prefix)}
            try:
                if stroke_input_policy(child_params,xml,native_transfer) is not None:
                    notes.append(compatibility('masking.strokeInput','Independent child input law is not executed; source policy not emitted.','unsupported'))
            except ValueError as error:
                notes.append(compatibility('masking.strokeInput',str(error),'unsupported'))
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
        child['sizeByPressure']=scaled_curve(child['sizeByPressure'],ratio)
        child=finalize_identity(child,child_png.getvalue())
        if child['version']==31: d['version']=31
        mode=params.get('MaskingBrush/MaskingCompositeOp','multiply')
        combine=modes.get(mode,'multiply')
        if mode not in modes: notes.append(compatibility('maskingBlend','Unsupported Krita masking mode '+mode+'; multiply used.','unsupported'))
        behavior['dual']={'brush':child,'blendMode':combine,'sampling':'independent'}
        notes.append(compatibility('maskingBrush','Independent masking spacing, dynamics and grain retained. Krita-specific edge/colour mixing formulas remain approximate.'))
    if enabled(params.get('PaintOpSettings/isAirbrushing',params.get('AirbrushOption/isAirbrushing'))):
        if timed_input and depth==0 and enabled(params.get('PaintOpSettings/isAirbrushing')):
            try:rate=float(params.get('PaintOpSettings/rate',20))
            except(ValueError,TypeError):rate=float('nan')
            refresh_random=[]
            for option in ('Size','Rotation','Mirror','Spacing'):
                # KisBrushBasedPaintOp::effectiveSpacing evaluates Mirror BEFORE
                # Spacing, on both paint and non-painting refresh. Mirror.apply
                # skips its sensors unless at least one native axis is enabled.
                if option=='Mirror' and not (enabled(params.get('HorizontalMirrorEnabled'))or enabled(params.get('VerticalMirrorEnabled'))):continue
                if not enabled(params.get('Pressure'+option))or not enabled(params.get(option+'UseCurve','true')):continue
                sensor=xml(params.get(option+'Sensor','<params id="pressure"/>'))
                sensors=list(sensor.findall('ChildSensor'))if sensor.get('id')=='sensorslist'else[sensor]
                if any(node.get('id')=='fuzzy'for node in sensors):refresh_random.append(option)
            rate_notes=[]
            controls=size_like_controls(params,'Rate',rate_notes,allow_time=False) if enabled(params.get('PressureRate')) else []
            try:value=float(params.get('RateValue',1)) if enabled(params.get('PressureRate')) else 1
            except(ValueError,TypeError):value=float('nan')
            if value!=1:controls.append({'control':'off','minimum':0,'jitter':0,'curve':[[0,value],[1,value]]})
            valid=not refresh_random and math.isfinite(value) and 0<=value<=1 and len(controls)<=4 and math.isfinite(rate) and 0<=rate<=1000 and not any(n['status']=='unsupported'for n in rate_notes)
            valid=valid and (not enabled(params.get('PressureRate')) or not enabled(params.get('RateUseCurve','true')) or bool(controls))
            valid=valid and all(c['control']in('pressure','off') and c.get('jitter',0)==0 for c in controls)
            if valid:
                behavior['timing']={'version':1,'rate':rate,'ignoreDistanceSpacing':enabled(params.get('PaintOpSettings/ignoreSpacing'))}
                if controls:behavior['timing']['rateDynamics']=controls
                for note in notes:
                    if note['feature']=='activeDynamics':
                        remaining=[part for part in note['detail'].split(', ')if part!='PressureRate']
                        note['detail']=', '.join(remaining)
                notes[:]=[note for note in notes if note['feature']!='activeDynamics'or note['detail']]
                notes.append(compatibility('airbrush','Native distance/time author request policy retained.'))
            else:
                detail='Native random '+', '.join(refresh_random)+' spacing-refresh queries require a canonical non-painting RNG event contract; timed policy not enabled.'if refresh_random else 'Unsupported native Rate value or controls; timed policy not enabled.'
                notes.append(compatibility('airbrush',detail,'unsupported'))
        elif timed_input and not enabled(params.get('PaintOpSettings/isAirbrushing')):
            notes.append(compatibility('airbrush','Legacy alias does not enable timed painting in pinned native settings reader.'))
        else:notes.append(compatibility('airbrush','Timed spraying is not reproduced.','unsupported'))
    if engine=='paintbrush':
        wash=depth>0 or params.get('PaintOpAction')=='2'
        if not wash:
            behavior['rendering']['accumulation']='directOver'
        else:
            behavior['rendering']['accumulation']='alphaDarken'
    d['behavior']=behavior
    if stroke_input:
        try:
            input_policy=stroke_input_policy(params,xml,native_transfer)
            if input_policy is not None:
                # Do not opt in when the existing rendering lowering did not retain this source sensor.
                if behavior.get('rotation') != {'follow':1,'random':'none'}:
                    raise ValueError('Identity DrawingAngle rendering lowering is not available')
                behavior['strokeInput']=input_policy
                notes.append(compatibility('strokeInput','Explicit source input metadata retained; cursor-history/fan execution requires the matching engine capability.'))
        except ValueError as error:
            notes.append(compatibility('strokeInput',str(error),'unsupported'))
    warnings.extend(n['feature']+': '+n['detail'] for n in notes if n['status']!='supported')
    def native_keyed(value):
        if isinstance(value,dict):
            return value.get('control')=='strokeRandom' and 'randomSource' in value or any(native_keyed(v) for v in value.values())
        return isinstance(value,list) and any(native_keyed(v) for v in value)
    if native_keyed(d): d['version']=32
    # Research readiness only: no CLI/stock default enables this capability.
    if sequential_xy and depth==0 and sequential_xy_compatible(d):
        behavior['sequentialRandom']={'version':1,'kind':'qt5Taus88','policy':'scatterXY'}
        d['version']=33
    if behavior.get('strokeInput'): d['version']=34
    def source_clock(value):
        if isinstance(value,dict):return value.get('control')=='time' or 'timing'in value or any(source_clock(v)for v in value.values())
        return isinstance(value,list) and any(source_clock(v)for v in value)
    if source_clock(behavior):d['version']=35
    result={'descriptor':finalize_identity(d,data),'name':root.get('name') or PurePosixPath(name).stem,'source':PurePosixPath(name).name,'warnings':warnings,'compatibility':notes}
    result['preview'] = author_preview
    if source_size is not None:
        result['sourceDefaults']={'sizePx':clamp(source_size,.01,10000),'opacity':d['opacity'],'flow':d['flow']}
    return result


def convert_krita(path, catalog, external=None, *, sequential_xy=False, stroke_input=False, timed_input=False):
    if type(sequential_xy) is not bool: raise ValueError('Sequential XY opt-in must be an explicit boolean')
    if type(stroke_input) is not bool: raise ValueError('Stroke input opt-in must be an explicit boolean')
    if type(timed_input) is not bool: raise ValueError('Timed input opt-in must be an explicit boolean')
    if path.suffix.lower() == '.kpp':
        try:
            catalog.brushes.append(preset(path.read_bytes(), path.name, catalog, external or {}, sequential_xy=sequential_xy,stroke_input=stroke_input,timed_input=timed_input))
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
                catalog.brushes.append(preset(archive.read(name),name,catalog,resources, sequential_xy=sequential_xy,stroke_input=stroke_input,timed_input=timed_input))
            except (ValueError, ET.ParseError, OSError) as error:
                catalog.skipped.append({'name':PurePosixPath(name).stem,'reasons':[str(error)]})
