"""Bounded Krita resource reader; independent implementation of documented data.

KPP thumbnails are never used as brush tips. Missing resources and unsupported
paint operations fail explicitly rather than changing the meaning of a preset.
"""
from variable_gih import validate_variable_gih_descriptor,is_sensor_original_rgba119,is_sensor_original_rgba121,is_equal_lightness_gih123,is_unequal_lightness_gih124
from gih_dimensions import uses_mode as gih_uses_mode,validate_dimensions
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
from stroke_input import source_policy as stroke_input_policy,independent_drawing_angle_pair
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

    One dimension, equal declared count/ncells/rank, bounded actual frames.
    Random/incremental/constant/pressure plus bounded-rank captured velocity/angular.
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
        dimensions=None
        dim=int(params.get('dim','1'))
        if dim!=1:
            if not 2<=dim<=4 or not 1<=count<=256 or int(params.get('ncells','0'))!=count:raise ValueError('Unsupported multidimensional GIH count')
            names={f'{key}{i}'for i in range(dim)for key in('rank','sel')}
            if any(key.startswith(('rank','sel'))and key not in names for key in params)or not names<=set(params):raise ValueError('Incomplete GIH dimension header')
            keys=list(params)
            if any(keys.index('dim')>keys.index(key)for key in names):raise ValueError('GIH dim must precede dimension selectors')
            dimensions=[{'mode':params[f'sel{i}'],'rank':int(params[f'rank{i}'])}for i in range(dim)]
            if any(v['mode']not in('constant','pressure','velocity','angular','xtilt','ytilt','random','incremental')or not 2<=v['rank']<=256 for v in dimensions)or all(v['mode']=='constant'for v in dimensions):raise ValueError('Unsupported GIH dimension selector')
            if math.prod(v['rank']for v in dimensions)!=count:raise ValueError('GIH ncells must equal rank product')
        elif not 1<=count<=2147483647 or int(params.get('rank0',str(count)))!=count or int(params.get('ncells',str(count)))!=count:
            raise ValueError('Unsupported GIH frame count or dimensions/ranks')
    except (IndexError,ValueError) as error:
        raise ValueError('Invalid or unsupported GIH parameters: '+str(error)) from error
    mode='dimensions'if dimensions is not None else params.get('sel0',params.get('selection','incremental'))
    if mode not in ('random','incremental','constant','pressure','velocity','angular','xtilt','ytilt','dimensions'):
        raise ValueError('Unsupported GIH selection mode: '+mode)
    if mode in ('random','incremental') and count>256:
        raise ValueError('Unsupported legacy GIH declared frame count')
    if mode=='angular' and not 2<=count<=256:raise ValueError('GIH angular rank must be2..256')
    if mode in('xtilt','ytilt')and not 2<=count<=256:raise ValueError('GIH tilt rank must be2..256')
    if mode=='velocity' and count>256:
        raise ValueError('Unsupported GIH velocity declared rank above256')
    frames=[];offset=second+1;pixels=0;coloured=False
    for _ in range(count):
        # Krita loads valid frames until exact EOF, then indexes modulo the
        # actual count. Its official fairy-dust pipe declares4 but contains1.
        if offset==len(data) and frames:
            break
        if len(frames)>=256:
            raise ValueError('GIH actual frame limit')
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
    return {'mode':mode,'frames':frames,'coloured':coloured,'declaredCount':count,**({'dimensions':dimensions}if dimensions is not None else{})}


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


def alpha_mask_image(image, definition):
    """IMAGE/PIPE_IMAGE ALPHAMASK only; preserve alpha, transform gray once.

    Caller must distinguish native MASK resources, which ignore these controls.
    The same existing bounded native tone compiler handles LIGHTNESSMAP planes.
    """
    gray, alpha = lightness_planes(image, definition)
    return Image.merge('RGBA', (gray, gray, gray, alpha))


def raster(data, name, brush=False, svg_policy=None):
    if (svg_policy is not None or name.lower().endswith('.svg')) and not data.startswith(b'\x89PNG\r\n\x1a\n'):
        if svg_policy is None:raise ValueError('SVG resource requires explicit application policy')
        from captured_svg import captured_svg
        return captured_svg(bytes(data),svg_policy)
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
    """Read native sensor groups; preserve legacy products or emit a bounded expression."""
    if not enabled(params.get(option+'UseCurve','true')):
        return []
    sensor_definition=params.get(option+'Sensor') or '<params id="pressure"/>'
    sensor=xml(sensor_definition)
    sensors=list(sensor.findall('ChildSensor')) if sensor.get('id')=='sensorslist' else [sensor]
    if len(sensors)>32: raise ValueError('Krita sensor count limit')
    ids=[node.get('id') for node in sensors]
    if len(ids)!=len(set(ids)): raise ValueError('Duplicate Krita sensor')
    mode=numeric(params.get(option+'curveMode'))
    additive_ids=('fuzzy','fuzzystroke','ascension')
    scaling_count=sum(name not in ('fuzzy','fuzzystroke','ascension','drawingangle','rotation') for name in ids)
    compound=option!='Rotation' and (sum(name in additive_ids for name in ids)>1 or mode!=0 and scaling_count>1 or len(sensors)>4 or 'ascension'in ids or 'drawingangle'in ids)
    if mode not in (0,1,2,3,4):
        notes.append(compatibility(option+'SensorCombination','Unsupported native sensor combination mode.','unsupported'))
        return []
    legacy_curve=params.get('Curve'+option,'0,0;1,1;') if 'curve' not in sensor_definition and enabled(params.get('Custom'+option)) else '0,0;1,1;'
    common=params.get(option+'commonCurve') or (sensors[-1].findtext('curve') if sensors else None)
    use_common=enabled(params.get(option+'UseSameCurve','true'))
    controls=[]
    source_ids=[]
    supported={'pressure':'pressure','declination':'tiltElevation','xtilt':'tiltX','ytilt':'tiltY','ascension':'azimuth','speed':'speed','drawingangle':'direction','fuzzy':'random','fuzzystroke':'strokeRandom','fade':'dabProgress','distance':'distance'}
    if allow_time:supported['time']='time'
    for node in sensors:
        name=node.get('id','')
        if name not in supported:
            notes.append(compatibility(option+'Sensor','Unsupported Krita sensor '+name,'unsupported'));continue
        if name in ('fade','time','distance'):
            raw=node.get('duration','30') if name=='time' else node.get('length','1000')
            try: period=int(raw)
            except (ValueError,OverflowError): period=0
            if not 1<=period<=(2147483647 if name in('time','distance') else 1000000) or (not re.fullmatch(r'[+-]?[0-9]+',raw.strip())if name in('time','distance')else str(period)!=raw.strip()):
                notes.append(compatibility(option+'Sensor','Invalid or out-of-range '+name+' duration/length; sensor unsupported.','unsupported'));continue
        curve=(common if use_common and common else node.findtext('curve')) or legacy_curve
        transfer=native_transfer(curve)
        if len(controls)>=(16 if compound or option=='Rotation' else 4):
            notes.append(compatibility(option+'Sensor','More than four active supported sensors; excess controls unsupported.','unsupported'));continue
        source_ids.append(name)
        controls.append({'control':('tiltDirection'if compound and name=='ascension'else supported[name]),'minimum':0,'jitter':0,'curve':transfer})
        if name in ('fade','time','distance'):
            periodic=enabled(node.get('periodic','0'))
            if name in('time','distance'):
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
                else 'Distance follows canonical centreline length in world pixels; native input-curve subdivision may differ.'if name=='distance'else 'Sensor '+name+' uses recorded Grafetto input; curve interpolation requires vendor calibration.'))
    if compound and controls:
        constant=numeric(params.get(option+'Value'),1)
        if not 0<=constant<=1:
            notes.append(compatibility(option+'SensorCombination','Nonunit option strength with a combined response requires constant-before-clamp execution; not approximated.','unsupported'))
            return []
        scaling=[control for control,name in zip(controls,source_ids)if name not in additive_ids and name!='drawingangle']
        additive=[control for control,name in zip(controls,source_ids)if name in additive_ids]
        notes.append(compatibility(option+'SensorCombination','Native scaling product/sum/max/min/difference and signed additive sum retained; constant applied before the final size-like clamp; external multiplier is retained exactly once.','supported'))
        combine={'mode':{0:'product',1:'sum',2:'max',3:'min',4:'difference'}[int(mode)],'scaling':scaling,'additive':additive,**({'constant':constant}if constant!=1 else {})}
        if 'drawingangle'in source_ids:
            control=controls[source_ids.index('drawingangle')];node=next(n for n in sensors if n.get('id')=='drawingangle')
            offset=numeric(node.get('angleOffset'),0)
            if not -360<=offset<=360:raise ValueError('Invalid size-like DrawingAngle offset')
            combine['absolute']={'locked':enabled(node.get('lockedAngleMode')),'angleOffset':offset,'curve':control['curve']}
        return [{'control':'off','minimum':0,'jitter':0,'combine':combine}]
    return controls


def size_like_controls(params, option, notes, *, allow_time=False):
    """Size-like expression; stylus rotation waits for a recorded twist channel."""
    if not enabled(params.get(option+'UseCurve','true')): return []
    sensor=xml(params.get(option+'Sensor') or '<params id="pressure"/>')
    sensors=list(sensor.findall('ChildSensor')) if sensor.get('id')=='sensorslist' else [sensor]
    if any(node.get('id')=='rotation' for node in sensors):
        notes.append(compatibility(option+'SensorCombination','Stylus rotation requires a recorded twist channel; constant rate retained.','unsupported'))
        return []
    return sensor_controls(params,option,notes,allow_time=allow_time)


def preset(data, name, catalog, external, depth=0, *, sequential_xy=False, stroke_input=False, timed_input=False, _allow_texture_material=True):
    if type(sequential_xy) is not bool: raise ValueError('Sequential XY opt-in must be an explicit boolean')
    if type(stroke_input) is not bool: raise ValueError('Stroke input opt-in must be an explicit boolean')
    if type(_allow_texture_material) is not bool: raise ValueError('Private texture origin must be boolean')
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
    if engine not in ('paintbrush', 'colorsmudge', 'roundmarker', 'spraybrush', 'sketchbrush', 'hairybrush', 'curvebrush', 'hatchingbrush', 'gridbrush', 'particlebrush', 'experimentbrush', 'deformbrush', 'filter', 'duplicate', 'mypaintbrush', 'tangentnormal'):
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
    if engine == 'tangentnormal':
        from krita_tangent_normal import tangent_normal_preset
        return tangent_normal_preset(data,root,params,name,catalog,external)
    if engine == 'mypaintbrush':
        from mypaint_import import mypaint_preset
        if params.get('CompositeOp','normal') not in ('normal','erase')or any(enabled(params.get(k))for k in('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing')):raise ValueError('Unsupported MyPaint composite/timing mode')
        if 'MyPaint/json'not in params:raise ValueError('MyPaint KPP missing JSON')
        result=mypaint_preset(params['MyPaint/json'].encode('utf-8'),name,catalog,data,enabled(params.get('EraserMode'))or params.get('CompositeOp')=='erase')
        result['name']=root.get('name')or result['name']
        result['descriptor']=finalize_identity(result['descriptor'],data)
        return result
    if engine == 'duplicate':
        from krita_clone import clone_preset
        return clone_preset(data,root,params,name,catalog,external)
    if engine == 'filter':
        from krita_filter import filter_preset
        return filter_preset(data,root,params,name,catalog,external)
    if engine == 'deformbrush':
        from krita_deform import deform_preset
        return deform_preset(data,root,params,name,catalog,external)
    if engine == 'experimentbrush':
        from krita_experiment import experiment_preset
        return experiment_preset(data,root,params,name,catalog,external)
    if engine == 'particlebrush':
        from krita_particle import particle_preset
        return particle_preset(data,root,params,name,catalog,external)
    if engine == 'gridbrush':
        from krita_grid import grid_preset
        return grid_preset(data,root,params,name,catalog,external)
    if engine == 'hatchingbrush':
        from krita_hatching import hatching_preset
        return hatching_preset(data,root,params,name,catalog,external)
    if engine == 'curvebrush':
        from krita_curve import curve_preset
        return curve_preset(data,root,params,name,catalog,external)
    if engine == 'hairybrush':
        from krita_bristle import bristle_preset
        return bristle_preset(data,root,params,name,catalog,external)
    if engine == 'sketchbrush':
        from krita_sketch import sketch_preset
        return sketch_preset(data,root,params,name,catalog,external,resource)
    if engine == 'spraybrush':
        from krita_spray import spray_preset
        return spray_preset(data,root,params,name,catalog,external,resource)
    if engine == 'roundmarker':
        from krita_round import roundmarker_preset
        return roundmarker_preset(data, root, params, name)
    definition = xml(params.get('brush_definition', ''))
    warnings = []
    notes = [compatibility('kritaEngine', 'Krita '+engine+' settings translated to Grafetto; vendor pixel equivalence is not claimed.')]
    d = descriptor(data, '')
    d['version']=27
    child_drawing_angle=None
    source_size=None
    source_metric=None
    application=0
    softness_value=1
    softness_controls=[]
    lightness_controls=[]
    gaussian_softness_noop=False
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
        spikes=numeric(generator.get('spikes'),2)
        spikes_supported=engine=='paintbrush'and math.isfinite(spikes)and spikes==int(spikes)and 3<=spikes<=20
        noise_density=numeric(definition.get('density'),1);noise_randomness=numeric(definition.get('randomness'),0)
        if engine=='paintbrush'and not all(math.isfinite(v)and 0<=v<=1 for v in(noise_density,noise_randomness)):
            raise ValueError('Auto-mask density/randomness outside0..1')
        noise_active=noise_density!=1 or noise_randomness!=0
        noise_supported=engine=='paintbrush'
        noise_representable=not noise_active or noise_supported
        gaussian=generator.get('id')=='gauss' and shape=='circle' and(spikes==2 or spikes_supported)
        gaussian_softness_noop=generator.get('id')=='gauss'and engine=='paintbrush'and enabled(params.get('PressureSoftness'))
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
        procedural_gaussian=(gaussian and engine=='paintbrush' and(ratio==1 or spikes_supported)
            and (gaussian_aa or representable_fade) and noise_representable)
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
        soft=(generator.get('id')=='soft' and shape=='circle' and(spikes==2 or spikes_supported)
              and not enabled(generator.get('antialiasEdges')) and noise_representable)
        if soft:
            curve=generator.get('softness_curve','0,0;1,1')
            # Missing checkable Softness means unchecked in native Krita.
            # Checked Pixel Softness uses its own affine basis capability.
            procedural_soft=((engine=='colorsmudge' or not enabled(params.get('PressureSoftness')))
                             and not enabled(params.get('PressureSharpness')))
            dynamic_soft=False
            if engine=='paintbrush'and enabled(params.get('PressureSoftness'))and not enabled(params.get('PressureSharpness')):
                softness_value=numeric(params.get('SoftnessValue'),1)
                if not math.isfinite(softness_value)or not 0<=softness_value<=1:raise ValueError('Native Softness value outside0..1')
                dynamic_soft=True
                if enabled(params.get('SoftnessUseCurve','true')):
                    start=len(notes);softness_controls=size_like_controls(params,'Softness',notes,allow_time=timed_input)
                    dynamic_soft=bool(softness_controls)and not any(n['status']=='unsupported'for n in notes[start:])
            if dynamic_soft:
                from softness_curve import compile_softness_basis
                basis=compile_softness_basis(curve,max(source_size,source_size*numeric(generator.get('ratio'),1)))
                payload=basis['payload'];side=4
                while side*side<len(payload):side*=2
                lookup=catalog.asset(Image.frombytes('L',(side,side),payload+bytes(side*side-len(payload))),warnings,grain=True)
                d['tip']['kind']='procedural';d['tip']['hardness']=1
                d['tip']['profile']={'kind':'radialCurveSoftness','lookup':lookup,'resolution':basis['resolution'],'encoding':basis['encoding'],'minimum':basis['minimum'],'span':basis['span'],'antialias':False}
                d['version']=max(d['version'],68)
                notes.append(compatibility('radialCurveSoftness','Native interior-knot softness retained in a bounded affine basis; mix and clamp precede radial interpolation. GPU rounding remains approximate.','supported'))
            elif procedural_soft:
                d['tip']['kind']='procedural';d['tip']['hardness']=1
                authored_long_axis=max(source_size,source_size*numeric(generator.get('ratio'),1))
                d['tip']['profile']=radial_curve_lookup(curve,authored_long_axis,catalog,warnings)
                d['version']=31
                notes.append(compatibility('radialCurveProfile','Native authored-diameter4x R+2 squared-radius LUT retained as packed UNORM32BE before mask quantization; physical geometry remains independent. GPU precision/subpixel and scalar/SIMD rounding require native comparison.'))
            else:
                mask=soft_circle(curve,source_size)
                d['tip']['kind']='bitmap';d['tip']['hardness']=1;d['tip']['mask']=catalog.asset(mask,warnings)
                notes.append(compatibility('softCurveGenerator','Static256px source curve fallback; active softness or threshold combinations are outside radialCurve capability.','unsupported'))
            if engine!='colorsmudge' and enabled(params.get('PressureSoftness'))and not dynamic_soft:
                notes.append(compatibility('softnessDynamics','Native softness transforms interior curve knots per dab; static base curve retained.','unsupported'))
        if (generator.get('id','default') != 'default' and not gaussian and not soft) or (spikes!=2 and not spikes_supported) or(noise_active and not noise_supported):
            notes.append(compatibility('autoBrush','Gaussian/curve generator, spikes, randomness and density are not reproduced.','unsupported'))
        default_generator=generator.get('id','default')=='default'
        softness_checked=engine!='colorsmudge' and enabled(params.get('PressureSoftness'))
        constant_softness=(not softness_checked or
            (not enabled(params.get('SoftnessUseCurve','true')) and numeric(params.get('SoftnessValue'),1)==1))
        softness_supported=constant_softness
        if default_generator and engine=='paintbrush' and softness_checked:
            softness_value=numeric(params.get('SoftnessValue'),1)
            if not math.isfinite(softness_value) or not 0<=softness_value<=1:
                raise ValueError('Native Softness value outside0..1')
            softness_supported=True
            if enabled(params.get('SoftnessUseCurve','true')):
                start=len(notes)
                softness_controls=size_like_controls(params,'Softness',notes,allow_time=timed_input)
                softness_supported=bool(softness_controls) and not any(n['status']=='unsupported'for n in notes[start:])
        standard=(default_generator and shape in ('circle','rect') and(spikes==2 or spikes_supported)
            and noise_representable and softness_supported)
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
        rectangle_profile=None
        new_gaussian=(engine=='paintbrush'and depth==0 and not enabled(params.get('MaskingBrush/Enabled'))and generator.get('id')=='gauss'and(spikes==2 or spikes_supported)and(not noise_active or spikes==2)and valid_fade and(shape=='rect'or ratio!=1 and not spikes_supported))
        if new_gaussian:
            rectangle_profile={'kind':'gaussian2D','shape':'rectangle'if shape=='rect'else'ellipse','horizontalFade':hf,'verticalFade':vf,'antialias':gaussian_aa}
        new_curve=(engine=='paintbrush'and depth==0 and not enabled(params.get('MaskingBrush/Enabled'))and generator.get('id')=='soft'and shape=='rect'and(spikes==2 or spikes_supported)and(not noise_active or spikes==2)and not enabled(params.get('PressureSharpness')))
        if new_curve:
            curve=generator.get('softness_curve','0,0;1,1')
            if not enabled(params.get('PressureSoftness')):
                rectangle_profile={**radial_curve_lookup(curve,source_size,catalog,warnings),'kind':'curveRectangle','antialias':enabled(generator.get('antialiasEdges'))}
            else:
                softness_value=numeric(params.get('SoftnessValue'),1)
                if not math.isfinite(softness_value)or not 0<=softness_value<=1:raise ValueError('Native Softness value outside0..1')
                start=len(notes)
                softness_controls=size_like_controls(params,'Softness',notes,allow_time=timed_input)if enabled(params.get('SoftnessUseCurve','true'))else[]
                if not any(n['status']=='unsupported'for n in notes[start:])and(not enabled(params.get('SoftnessUseCurve','true'))or softness_controls):
                    from softness_curve import compile_softness_basis
                    basis=compile_softness_basis(curve,source_size);payload=basis['payload'];side=4
                    while side*side<len(payload):side*=2
                    lookup=catalog.asset(Image.frombytes('L',(side,side),payload+bytes(side*side-len(payload))),warnings,grain=True)
                    rectangle_profile={'kind':'curveRectangleSoftness','lookup':lookup,'resolution':basis['resolution'],'encoding':basis['encoding'],'minimum':basis['minimum'],'span':basis['span'],'antialias':enabled(generator.get('antialiasEdges'))}
        if rectangle_profile:
            d['tip'].pop('mask',None);d['tip'].pop('maskBounds',None);d['tip']['kind']='procedural';d['tip']['hardness']=1;d['tip']['profile']=rectangle_profile
            d['version']=max(d['version'],{'gaussian2D':78,'curveRectangle':79,'curveRectangleSoftness':80}[rectangle_profile['kind']])
            notes[:]=[n for n in notes if n['feature']not in('autoBrush','gaussianGenerator')]
            notes.append(compatibility('autoRectangle','Separable Gaussian axes or complementary nearest-index curve products retained, with native 2D edge fade. GPU erf, curve and edge rounding may differ.','supported'))
        if spikes_supported and d['tip'].get('profile'):
            d['tip']['kind']='procedural';d['tip']['autoShape']={'version':1,'spikes':int(spikes)}
            d['version']=max(d['version'],71)
            notes.append(compatibility('autoSpikes','Native angular sector folding retains source ratio and independent square allocation. Scalar/GPU edge rounding may differ.','supported'))
        if noise_active and noise_supported and d['tip'].get('profile'):
            d['tip']['kind']='procedural';d['tip']['autoNoise']={'version':1,'density':noise_density,'randomness':noise_randomness}
            d['version']=max(d['version'],98 if d['tip']['profile']['kind']in('gaussian2D','curveRectangle','curveRectangleSoftness')else 74)
            notes.append(compatibility('autoMaskNoise','Per-pixel attenuation and density use a captured-seed functional D16/R8 law on a canonical full-dab grid. Native random sequence and pixels differ.','supported'))
        if noise_active and noise_supported and not d['tip'].get('autoNoise'):notes.append(compatibility('autoMaskNoise','Per-pixel density/randomness are not implemented for this fallback generator.','unsupported'))
        if gaussian_softness_noop:notes.append(compatibility('gaussianSoftness','Native Gaussian generator stores but does not use Softness; saved controls do not affect the mask.','supported'))
        if enabled(definition.get('useAutoSpacing')):
            notes.append(compatibility('autoSpacing','Krita adaptive spacing coefficient retained; anisotropic axis metrics and spacing sensors require separate calibration.'))
    elif kind in ('gbr_brush', 'png_brush', 'svg_brush', 'abr_brush'):
        filename = definition.get('filename','')
        material_gray=[]; gradient_gray=[];stamp_images=[];variable_gih_bounds=None
        if filename.lower().endswith('.gih'):
            pipe=gih(resource(filename),preserve_color=True)
            adjustment_active=any(frame.mode=='RGBA' for frame in pipe['frames'])
            application=brush_application(definition,pipe['frames'])
            if application==0 and adjustment_active:
                pipe['frames']=[alpha_mask_image(frame,definition) if frame.mode=='RGBA' else frame for frame in pipe['frames']]
            if application==1 and engine in('paintbrush','colorsmudge') and (not eraser or engine=='colorsmudge') and(engine=='colorsmudge'or all(frame.mode=='RGBA'for frame in pipe['frames'])):stamp_images=[frame.convert('RGBA') for frame in pipe['frames']]
            if (application==2 and engine in ('paintbrush','colorsmudge') and all(frame.mode=='RGBA' for frame in pipe['frames'])) or (application==3 and engine in('paintbrush','colorsmudge')):
                planes=[lightness_planes(frame,definition) for frame in pipe['frames']]
                if application==3:gradient_gray=[gray for gray,alpha in planes]
                else:material_gray=[gray for gray,alpha in planes]
                frames=[alpha for gray,alpha in planes]
            elif stamp_images:
                frames=[frame.getchannel('A') for frame in stamp_images]
            else:
                frames=[frame if frame.mode=='L' else image_coverage(frame,application) for frame in pipe['frames']]
            unequal=len({frame.size for frame in frames})!=1
            unequal_lightness_gih124=bool(unequal and len(frames)>=2 and material_gray and application==2 and pipe['mode']in('angular','xtilt','ytilt','dimensions')and all(v.mode=='RGBA'for v in pipe['frames'])and _allow_texture_material and engine=='paintbrush'and not depth and not eraser)
            if unequal:
                if engine!='paintbrush' or material_gray and not unequal_lightness_gih124 or gradient_gray or (pipe['coloured'] and application!=0 and not stamp_images and not unequal_lightness_gih124):
                    raise ValueError('Unequal GIH material/colour combination is unsupported')
                if any(max(frame.size)>2048 for frame in frames):raise ValueError('Unequal GIH original dimensions exceed 2048; resizing is forbidden')

            assets=[tip_asset(frame,catalog,warnings) for frame in frames]
            mask=frames[0]
            d['tip']['mask'],d['tip']['maskBounds']=assets[0]
            # Private adapters rewrite paintopid to paintbrush; only genuine native Pixel origin may opt in.
            original_sensor_rgba119=bool(unequal and stamp_images and application==1 and len(stamp_images)==len(frames)and all(v.mode=='RGBA'for v in pipe['frames'])and _allow_texture_material and engine=='paintbrush'and not depth and not eraser)
            original_sensor_rgba121=bool(not unequal and len(frames)>=2 and stamp_images and application==1 and len(stamp_images)==len(frames)and all(v.mode=='RGBA'for v in pipe['frames'])and all(max(v.size)<=2048 for v in pipe['frames'])and _allow_texture_material and engine=='paintbrush'and not depth and not eraser)
            equal_lightness_gih123=bool(not unequal and len(frames)>=2 and material_gray and application==2 and all(v.mode=='RGBA'for v in pipe['frames'])and all(max(v.size)<=2048 for v in pipe['frames'])and _allow_texture_material and engine=='paintbrush'and not depth and not eraser)
            if pipe['mode']=='angular' and (not _allow_texture_material or engine!='paintbrush' or depth or((application!=0 or pipe['coloured'])and not(original_sensor_rgba119 or original_sensor_rgba121 or equal_lightness_gih123 or unequal_lightness_gih124))or not unequal and len({tuple(sorted(bounds.items()))for aid,bounds in assets})!=1):raise ValueError('GIH angular requires root equal alpha Pixel frames')
            if pipe['mode']in('xtilt','ytilt')and(not _allow_texture_material or engine!='paintbrush' or depth or((application!=0 or pipe['coloured'])and not(original_sensor_rgba119 or original_sensor_rgba121 or equal_lightness_gih123 or unequal_lightness_gih124))or not unequal and len({tuple(sorted(bounds.items()))for aid,bounds in assets})!=1):raise ValueError('GIH tilt requires root equal alpha Pixel frames')
            if pipe['mode']=='dimensions'and(not _allow_texture_material or engine!='paintbrush' or depth or((application!=0 or pipe['coloured'])and not(original_sensor_rgba119 or original_sensor_rgba121 or equal_lightness_gih123 or unequal_lightness_gih124))or not unequal and len({tuple(sorted(bounds.items()))for aid,bounds in assets})!=1):raise ValueError('GIH dimensions require native root equal alpha Pixel frames')
            if len(assets)>1 or pipe['mode']in('angular','dimensions'):
                d['tip']['animation']={'mode':pipe['mode'],'frames':[asset[0] for asset in assets]}
                if pipe['mode']in('pressure','velocity','angular','xtilt','ytilt'):d['tip']['animation']['rank']=pipe['declaredCount']
                if pipe['mode']=='angular':d['tip']['animation']['cursorPolicy']='first-request-v1'
                if pipe['mode']=='dimensions':
                    d['tip']['animation']['dimensions']=pipe['dimensions']
                    if gih_uses_mode(d['tip']['animation'],'random'):d['tip']['animation']['randomPolicy']='grafetto-dim-stream-v1'
                    if gih_uses_mode(d['tip']['animation'],'angular'):d['tip']['animation']['cursorPolicy']='first-request-v1'
                    if gih_uses_mode(d['tip']['animation'],'xtilt')or gih_uses_mode(d['tip']['animation'],'ytilt'):d['tip']['animation']['roundingPolicy']='qt5-half-up-v1'
                if pipe['mode']in('xtilt','ytilt'):d['tip']['animation']['roundingPolicy']='qt5-half-up-v1'
                if unequal:
                    variable_gih_bounds=[bounds for aid,bounds in assets]
                    d['tip']['animation']['geometry']={'version':1,'frames':[{'sourceWidth':frame.width,'sourceHeight':frame.height,'maskBounds':bounds}for frame,(aid,bounds)in zip(frames,assets)]}
                    d['version']=max(d['version'],118 if pipe['mode']in('angular','xtilt','ytilt','dimensions')else 86)
                    notes.append(compatibility('gihOriginalGeometry','Original per-frame dimensions/padding retained without resize; first-frame nominal size/spacing and selected-frame hotspot placement use browser functional filtering.','supported'))
            if pipe['mode'] in ('constant','pressure'):d['version']=max(d['version'],91)
            if pipe['mode']=='velocity':d['version']=max(d['version'],92)
            if pipe['declaredCount']!=len(frames):
                notes.append(compatibility('gihFrameCount',f"Header declares {pipe['declaredCount']} frames, but exactly {len(frames)} valid frames end at EOF; retained actual frames as Krita does."))
            selection_note=('Tilt selection collapses to the single actual EOF frame; no selector policy is emitted.'if pipe['mode']in('xtilt','ytilt')and len(frames)==1 else'Captured degree-axis F32 chooses Qt5 half-up round(tilt/2*rank)+integer(rank/2), uint32 then actual frame modulo; explicit qt5-half-up-v1, not normalized or native-device precision identity.'if pipe['mode']in('xtilt','ytilt')else'All pipe frames retained; random selection uses deterministic Grafetto per-dab randomness rather than Krita RNG.' if pipe['mode']=='random' else 'Incremental pipe selection uses dab sequence modulo actual frame count.' if pipe['mode']=='incremental' else 'Constant pipe selection retains the first frame.' if pipe['mode']=='constant' else 'Pressure pipe selection uses captured float32 pressure, native signed-int truncation and uint32 modulo actual frame count; declared rank is retained. Native input precision is not claimed.' if pipe['mode']=='pressure' else 'Angular pipe selection uses captured DrawingAngle and explicit first-request-v1 per-attempt movement policy; see gihAngular qualification.' if pipe['mode']=='angular' else 'Velocity pipe selection uses captured normalized float32 speed and round(log(1+speed)/3*(declared rank-.5)), modulo actual frames; declared rank<=256. Grafetto view-space EMA/max30 input differs from native smoothing; no native float-bit identity is claimed.')
            if pipe['mode']=='dimensions':selection_note='Versioned row-major GIH dimensions use signed raw sensor indices, uint32 sum and one final actual-EOF modulo; explicit angular first-request/Qt5 tilt policies retained. Incremental axes share the logical attempt ordinal (LCM correlation, not odometer); random axes use captured strokeSeed with dimension salts under grafetto-dim-stream-v1, not native RNG sequence identity. Native first-point/filter/input rounding remains qualified.'
            notes.append(compatibility('gihSelection',selection_note))
            if pipe['coloured'] and application!=0 and not material_gray and not gradient_gray and not stamp_images:
                notes.append(compatibility('gihColour','RGBA pipe colour is approximated as alpha coverage; coloured stamp pixels are not retained.','unsupported'))
        else:
            payload=resource(filename)
            captured_svg_source=kind=='svg_brush'and not payload.startswith(b'\x89PNG\r\n\x1a\n')
            image=gbr(payload,preserve_color=True) if filename.lower().endswith('.gbr') else raster(payload,filename,svg_policy='krita-mask-v1'if kind=='svg_brush'else None)
            adjustment_active=image.mode=='RGBA' if filename.lower().endswith('.gbr') else has_color(image) or image.convert('RGBA').getchannel('A').getextrema()[0]<255
            application=0 if captured_svg_source else brush_application(definition,[image])
            original_sampling_image=image
            if application==0 and adjustment_active:
                image=alpha_mask_image(image,definition)
            if application==1 and engine in('paintbrush','colorsmudge') and (not eraser or engine=='colorsmudge') and(engine=='colorsmudge'or image.mode in('RGB','RGBA')):stamp_images=[image.convert('RGBA')]
            if (application==2 and engine in ('paintbrush','colorsmudge') and adjustment_active) or (application==3 and engine in('paintbrush','colorsmudge')):
                gray,mask=lightness_planes(image,definition)
                if application==3:gradient_gray=[gray]
                else:material_gray=[gray]
            elif stamp_images:
                mask=stamp_images[0].getchannel('A')
            else:
                mask=image if filename.lower().endswith('.gbr') and image.mode=='L' else image_coverage(image,application)
            d['tip']['mask'],d['tip']['maskBounds']=tip_asset(mask,catalog,warnings)
            if kind in ('png_brush','gbr_brush') and filename.lower().endswith(('.png','.gbr')) and not material_gray and not gradient_gray and not stamp_images:
                sampling=integer_image_sampling(original_sampling_image,application,catalog.assets[d['tip']['mask']]['size'])
                if sampling:
                    d['tip']['imageSampling']=sampling
                    notes.append(compatibility('integerImagePyramid','Opaque grayscale source grid retained; native integer levels and bounded preparation replace padded trilinear masks. QPainter residual interpolation and transformed edge rounding still require comparison.'))
            if kind=='svg_brush':
                notes.append(compatibility('svgRasterizer','Captured SVG mask rasterized on white at1000px by bounded librsvg policy; Qt edge/indexed-gray rounding may differ. Unsupported external resources/fonts/filters are rejected.'if captured_svg_source else'Pinned official stock SVG rasterized on white at native1000px using librsvg; Qt SVG edge antialiasing may differ. General SVG uploads remain unsupported.'))
        # KisScalingSizeBrush::userEffectiveSize is longest native side * scale.
        source_size=max(mask.size)*numeric(definition.get('scale'),1)
        source_metric=mask.size
        d['tip']['aspect']=1/clamp(numeric(definition.get('ratio'),1),0.0625,1)
        if stamp_images:
            channels=[]
            for frame in stamp_images:
                planes=[tip_asset(frame.getchannel(channel),catalog,warnings) for channel in 'RGB']
                if any(bounds!=(variable_gih_bounds[len(channels)] if variable_gih_bounds is not None else d['tip']['maskBounds']) for asset,bounds in planes):raise ValueError('Colour/alpha bounds differ')
                channels.append([asset for asset,bounds in planes])
            d['tip']['color']={'planes':channels[0]}
            if len(channels)>1:d['tip']['color']['frames']=channels
            notes.append(compatibility('pixelOriginalRgba'if engine=='paintbrush'else'colorSmudgeStamp','Original RGB/alpha planes retained; one premultiplied RGBA texture per frame. Bounded source texture filtering differs from native.'))
        elif gradient_gray:
            gray_assets=[tip_asset(gray,catalog,warnings) for gray in gradient_gray]
            if any(bounds!=d['tip']['maskBounds'] for asset,bounds in gray_assets):raise ValueError('Gradient/alpha plane bounds mismatch')
            d['tip']['color']={'gradient':{'gray':gray_assets[0][0]}}
            if engine=='paintbrush' and (len(gray_assets)!=1 or catalog.assets[d['tip']['mask']]['size']>512):raise ValueError('Pixel gradient requires one bitmap frame with side<=512')
            if engine=='paintbrush':d['tip']['color']['gradient']['sampling']='filteredGray-v1'
            if len(gray_assets)>1:d['tip']['color']['gradient']['grayFrames']=[asset for asset,bounds in gray_assets]
            notes.append(compatibility('gradientTip','Independent adjusted gray and alpha are filtered before lookup in the captured 256-sample canvas palette; palette alpha is multiplied once by filtered source alpha. Native QImage filtering kernel, ICC and colour-space rounding may differ.' if engine=='paintbrush' else 'Adjusted gray and alpha retained;256-sample captured canvas palette is packed once per frame into premultiplied RGBA. Native maps the filtered gray dab, whereas Grafetto filters the mapped resource; nonlinear gradients and colour-space rounding may differ.'))
        elif material_gray:
            gray_assets=[tip_asset(gray,catalog,warnings) for gray in material_gray]
            if any(bounds!=(variable_gih_bounds[index]if variable_gih_bounds is not None else d['tip']['maskBounds'])for index,(asset,bounds)in enumerate(gray_assets)):
                raise ValueError('Lightness/alpha plane bounds mismatch')
            strength=clamp(numeric(params.get('LightnessStrengthValue'),1)) if engine!='colorsmudge' and enabled(params.get('PressureLightnessStrength')) else 1
            d['tip']['material']={'kind':'lightness','gray':gray_assets[0][0],'strength':strength}
            if len(gray_assets)>1: d['tip']['material']['grayFrames']=[asset for asset,bounds in gray_assets]
            if engine=='colorsmudge' and enabled(params.get('PressureLightnessStrength')):
                notes.append(compatibility('lightnessStrength','Native Color Smudge uses Paint Thickness and projects accumulated height with strength1; the saved Pixel Lightness Strength option is ignored.','supported'))
            elif enabled(params.get('PressureLightnessStrength')) and enabled(params.get('LightnessStrengthUseCurve','true')):
                local=[]
                controls=size_like_controls(params,'LightnessStrength',local,allow_time=timed_input)
                if controls and not any(n['status']=='unsupported' for n in local):
                    lightness_controls=controls
                    d['version']=max(d['version'],90)
                    notes.extend(local)
                    notes.append(compatibility('lightnessStrength','Checked native size-like response controls RGB lightness transfer per logical dab, independently of alpha/flow.','supported'))
                else:
                    notes.extend(local)
                    notes.append(compatibility('lightnessStrength','Unsupported active native lightness-strength sensors; constant strength retained.','unsupported'))
            notes.append(compatibility('lightnessMaterial','Adjusted straight gray and source alpha retained as paired planes; native premultiplied filtering, RGB lightness tone mapping and U8 rounding require renderer comparison.'))
        elif application!=0:
            application_name={1:'IMAGESTAMP',2:'LIGHTNESSMAP',3:'GRADIENTMAP'}[application]
            notes.append(compatibility('brushApplication',application_name+' resolved from native/legacy flags; its material is unsupported and retains the alpha-mask approximation.','unsupported'))
        elif adjustment_active and (any(numeric(definition.get(key),default)!=default for key,default in [('AdjustmentMidPoint',127),('BrightnessAdjustment',0),('ContrastAdjustment',0)]) or enabled(definition.get('AutoAdjustMidPoint'))):
            notes.append(compatibility('alphaMaskAdjustments','Native image-type gray adjustment is compiled once before inverse-gray times original alpha; MASK resources ignore these controls.','supported'))
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
    if lightness_controls:behavior.setdefault('modulations',{})['lightnessStrength']=lightness_controls
    if sharpness_controls: behavior.setdefault('modulations',{})['sharpness']=sharpness_controls
    if engine=='paintbrush' and d['tip'].get('profile',{}).get('kind')in('standard','radialCurveSoftness','curveRectangleSoftness') and enabled(params.get('PressureSoftness')):
        behavior['softness']=softness_value
        if softness_controls:behavior.setdefault('modulations',{})['softness']=softness_controls
        d['version']=max(d['version'],64)
        notes.append(compatibility('maskSoftness','Native mask generator responds per dab; no opacity substitution.','supported'))
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
    modes={'normal':'normal','multiply':'multiply','screen':'screen','overlay':'overlay','darken':'darken','lighten':'lighten','burn':'colorBurn','dodge':'colorDodge','linear_burn':'linearBurn','linear_dodge':'add','add':'add','subtract':'subtract','diff':'difference','exclusion':'exclusion','soft_light':'softLight','hard_light':'hardLight','divide':'divide','hue':'hue','saturation':'saturation','color':'color','luminosity':'luminosity','linear light':'linearLight','vivid_light':'vividLight','pin_light':'pinLight','hard mix':'kritaHardMix' if engine=='paintbrush' else 'hardMix','hard_mix_photoshop':'hardMixPhotoshop' if engine=='paintbrush' else 'hardMix','darker color':'darkerColor','lighter color':'lighterColor'}
    if eraser: behavior['erase']=True
    mode='normal' if eraser else params.get('CompositeOp','normal')
    if mode in modes:
        behavior['rendering']['blendMode']=modes[mode]
    else:
        notes.append(compatibility('blendMode','Unsupported Krita blend '+mode+'; normal used.','unsupported'))
    if mode=='hard_mix_photoshop' and engine!='paintbrush':notes.append(compatibility('hardMixPhotoshop','Photoshop Hard Mix requires a foreground-specific strategy; legacy Hard Mix fallback is not equivalent.','unsupported'))
    if mode=='hard_mix_photoshop' and engine=='paintbrush':
        d['version']=max(d['version'],102)
        notes.append(compatibility('hardMixPhotoshop','Strict source-plus-destination channel threshold (>1; equality black), composed through the existing premultiplied blend shell. Native colour-space and quantization differences remain.'))
    if mode=='hard mix' and engine=='paintbrush':
        d['version']=max(d['version'],104)
        notes.append(compatibility('kritaHardMix','Destination-selected Color Dodge/Color Burn (SDR clamped) through the existing premultiplied blend shell. Normalized float half and division may differ from native U8 half127 and staged integer rounding.'))
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
    rotation_static=False
    if enabled(params.get('PressureRotation'))and not enabled(params.get('RotationUseCurve','true')):
        # Native checked Rotation with UseCurve=false has no sensor components:
        # rotationLikeValue returns zero, apply maps it to a half-turn.
        d['tip']['angle']=math.remainder(d['tip']['angle']-math.pi,2*math.pi)
        rotation_decoded=True;rotation_static=True
        notes.append(compatibility('RotationConstant','Checked Rotation with a disabled sensor curve retains its native constant half-turn; saved sensor data is inactive.','supported'))
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
            and enabled(params.get('RotationUseCurve','true')) and numeric(params.get('RotationcurveMode'),0)in(0,1,2,3,4)
            and -1<=strength<=1 and 1<=len(rotation_sensors)<=16
            and all(node.get('id') in ('fuzzy','fuzzystroke','ascension','pressure','declination','xtilt','ytilt','speed','time','fade','distance') for node in rotation_sensors)):
        controls=sensor_controls(params,'Rotation',notes,allow_time=timed_input)
        if len(controls)==len(rotation_sensors):
            additive=[{**c,**({'control':'tiltDirection'}if node.get('id')=='ascension'else{})} for node,c in zip(rotation_sensors,controls) if node.get('id') in ('fuzzy','fuzzystroke','ascension')]
            scaling=[c for node,c in zip(rotation_sensors,controls) if node.get('id') not in ('fuzzy','fuzzystroke','ascension')]
            behavior['rotation']={'follow':0,'random':'none','composition':{'strength':strength,'additive':additive,**({'scaling':scaling} if scaling else {})}}
            curve_mode=int(numeric(params.get('RotationcurveMode'),0))
            if curve_mode:behavior['rotation']['composition']['scalingMode']={1:'sum',2:'max',3:'min',4:'difference'}[curve_mode]
            rotation_decoded=True
            notes.append(compatibility('RotationComposition','Native signed additive minus scaling rotation retained; per-stroke random is option-keyed, deterministic Grafetto random sequences differ from Krita.'))
    if (not rotation_decoded and depth==0 and enabled(params.get('PressureRotation'))and enabled(params.get('RotationUseCurve','true'))
            and -1<=strength<=1 and numeric(params.get('RotationcurveMode'),0)in(0,1,2,3,4)
            and 1<=len(rotation_sensors)<=16 and sum(node.get('id')=='drawingangle'for node in rotation_sensors)==1
            and all(node.get('id')in('drawingangle','fuzzy','fuzzystroke','ascension','pressure','declination','xtilt','ytilt','speed','time','fade','distance')for node in rotation_sensors)):
        local=[];controls=sensor_controls(params,'Rotation',local,allow_time=timed_input)
        if len(controls)==len(rotation_sensors)and not any(n['status']=='unsupported'for n in local):
            index=next(i for i,node in enumerate(rotation_sensors)if node.get('id')=='drawingangle');node=rotation_sensors[index]
            offset=numeric(node.get('angleOffset'),0);locked=enabled(node.get('lockedAngleMode'))
            if not -360<=offset<=360:raise ValueError('Invalid DrawingAngle offset')
            composition={'strength':strength,'additive':[],'scaling':[],'absolute':{'locked':locked,'angleOffset':offset,'curve':controls[index]['curve']}}
            for n,c in zip(rotation_sensors,controls):
                if n.get('id')=='drawingangle':continue
                additive=n.get('id')in('fuzzy','fuzzystroke','ascension')
                composition['additive'if additive else'scaling'].append({**c,**({'control':'tiltDirection'}if n.get('id')=='ascension'else{})})
            mode=int(numeric(params.get('RotationcurveMode'),0))
            if mode:composition['scalingMode']={1:'sum',2:'max',3:'min',4:'difference'}[mode]
            policy={'version':1,'initialDirection':'cursorHistory'}
            if enabled(node.get('fanCornersEnabled'))and not locked:
                raw=node.get('fanCornersStep','30').strip()
                if not re.fullmatch(r'[+-]?\d+',raw)or not 5<=int(raw)<=90:raise ValueError('Invalid DrawingAngle fan step')
                policy['fanCorners']={'stepDegrees':int(raw)}
            behavior['rotation']={'follow':0,'random':'none','composition':composition};behavior['strokeInput']=policy
            rotation_decoded=True;notes.extend(local)
            notes.append(compatibility('RotationAbsolute','Drawing-angle curve, offset and locked initial direction combine with additive/scaling groups. Author cursor history and optional raw-angle fan requests are recorded; replay never reads peer cursor/UI state.'))
    mirror_axes=[enabled(params.get(key))for key in ('HorizontalMirrorEnabled','VerticalMirrorEnabled')]
    if enabled(params.get('PressureMirror')) and any(mirror_axes):
        mirror_notes=[]
        controls=size_like_controls(params,'Mirror',mirror_notes,allow_time=timed_input)
        notes.extend(mirror_notes)
        value=numeric(params.get('MirrorValue'),1)
        if not math.isfinite(value)or not 0<=value<=1:raise ValueError('Invalid MirrorValue')
        if not enabled(params.get('MirrorUseCurve','true'))or controls and not any(n['status']=='unsupported'for n in mirror_notes):
            behavior['mirror']={'horizontal':mirror_axes[0],'vertical':mirror_axes[1],'value':value}
            if controls:behavior['mirror']['dynamics']=controls
            notes.append(compatibility('mirror','One size-like response controls enabled horizontal/vertical mask flips at threshold0.5, before texture. Original mask/material channels retained; subpixel hot-spot rounding can differ.'))
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
        # Native Color Smudge passes textureFlags=None. This substitution is
        # BEFORE preserveAlpha/tone/cutoff selection, not a colour-texture mode.
        if engine=='colorsmudge' and texture_mode in (2,3):
            captured_texture_mode=texture_mode
            texture_mode=1
            notes.append(compatibility('nativeTextureModeFallback','Native Color Smudge does not enable Lightness/Gradient texture flags; captured raw mode '+str(int(captured_texture_mode))+' uses SUBTRACT before scalar pattern preprocessing. No palette is read by this texture mode.','supported'))
        # KisStrengthOption is checkable: unchecked (also the missing-key
        # default) returns1 before reading strength or sensors. UseCurve is
        # independent: stale enabled curves must not revive an unchecked option.
        texture_strength_enabled=enabled(params.get('PressureTexture/Strength/'))
        texture_strength=clamp(numeric(params.get('Texture/Strength/Value'),1)) if texture_strength_enabled else 1
        texture_modes={0:'multiply',1:'subtract',4:'darken',5:'overlay',6:'colorDodge',7:'colorBurn',8:'linearDodge',9:'linearBurn',10:'hardMixPhotoshop',11:'hardMixSofterPhotoshop'}
        texture_supported=texture_mode in (0,1)or(engine=='paintbrush'and _allow_texture_material and texture_mode in(2,3))or(engine in('paintbrush','colorsmudge')and texture_mode in texture_modes)
        if texture_supported:
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
            authored_pattern=mask
            tone={'brightness':numeric(params.get(prefix+'Brightness'),0),
                  'contrast':numeric(params.get(prefix+'Contrast'),1),
                  'neutral_point':numeric(params.get(prefix+'NeutralPoint'),.5),
                  'invert':enabled(params.get(prefix+'Invert')),
                  'cutoff_policy':int(numeric(params.get(prefix+'CutoffPolicy'),0)),
                  'cutoff_left':int(numeric(params.get(prefix+'CutoffLeft'),0)),
                  'cutoff_right':int(numeric(params.get(prefix+'CutoffRight'),255))}
            compiled=preprocess_texture(authored_pattern,**tone,preserve_alpha=True) if texture_mode in(2,3) else preprocess_texture(authored_pattern,**tone)
            pattern_alpha=(compiled.getchannel('A') if compiled.mode=='RGBA'else Image.new('L',compiled.size,255)) if texture_mode in(2,3) else None
            mask=compiled.getchannel('R') if compiled.mode=='RGBA' else compiled
            erase_pattern=preprocess_texture(authored_pattern,**{**tone,'invert':not tone['invert']}) if engine=='paintbrush'and texture_mode not in(2,3) and enabled(params.get(prefix+'AutoInvertOnErase')) else None
            width,height=mask.size
            pot=max(2,1<<(max(width,height)-1).bit_length())
            padded=Image.new('L',(pot,pot));padded.paste(mask,(0,0))
            aid=catalog.asset(padded,warnings,grain=True)
            alpha_id=None
            if pattern_alpha is not None:
                alpha_padded=Image.new('L',(pot,pot));alpha_padded.paste(pattern_alpha,(0,0));alpha_id=catalog.asset(alpha_padded,warnings,grain=True)
            offset={axis:clamp(numeric(params.get(prefix+'Offset'+axis.upper()),0),-8192,8192) for axis in ('x','y')}
            offset.update(randomX=enabled(params.get(prefix+'isRandomOffsetX')),randomY=enabled(params.get(prefix+'isRandomOffsetY')))
            d['texture']={'id':aid,'strength':texture_strength,
                          'periodPx':native_width,'patternSize':{'width':width,'height':height},
                          **({'material':{'kind':'gradient'if texture_mode==3 else'lightness','alpha':alpha_id}}if texture_mode in(2,3) else{'application':{'mode':texture_modes[texture_mode],'soft':enabled(params.get(prefix+'UseSoftTexturing'))}}),'offset':offset}
            if erase_pattern is not None:
                erase_padded=Image.new('L',(pot,pot));erase_padded.paste(erase_pattern,(0,0))
                d['texture']['eraseId']=catalog.asset(erase_padded,warnings,grain=True);d['version']=max(d['version'],77)
                notes.append(compatibility('textureEraseInvert','Paired normal/erase pattern is compiled before neutral-point remap and cutoff; recorded effective erasing selects the resource.','supported'))
            if texture_mode not in (0,1):d['version']=max(d['version'],75)
            if any(abs(numeric(params.get(prefix+'Offset'+axis),0))>8192 for axis in ('X','Y')):
                notes.append(compatibility('textureOffset','Native offset exceeds bounded8192 and was clamped.','unsupported'))
            if offset['randomX'] or offset['randomY']:
                notes.append(compatibility('textureRandomOffset','Per-stroke pattern phase uses deterministic Grafetto RNG rather than Krita RNG.'))
            if enabled(params.get(prefix+'AutoInvertOnErase'))and erase_pattern is None:
                notes.append(compatibility('textureEraseInvert','Automatic texture inversion on erasing is not implemented.','unsupported'))
            controls=sensor_controls(params,'Texture/Strength/',notes,allow_time=timed_input) if texture_strength_enabled else []
            if controls: behavior.setdefault('modulations',{})['grainDepth']=controls
            if texture_mode in(2,3) and any('combine'in c for c in controls):d['texture']['strength']=1
            if texture_mode in(2,3) and any(n['status']=='unsupported'and n['feature'].startswith('Texture/Strength/') for n in notes):raise ValueError('Unsupported Texture Lightness108 strength sensors')
            notes.append(compatibility('texture','Native pattern grid, phase and strength retained; texture Lightness108 consumes independent gray/alpha planes.'if texture_mode==2 else'Native pattern grid, phase and strength retained; texture Gradient111 consumes independent gray/alpha with gesture-captured CurrentGradient.'if texture_mode==3 else'Native alpha-operation parameters and grid retained; GPU filtering/byte quantization require native comparison.'))
        else:
            aid=catalog.asset(mask,warnings,grain=True)
            d['texture']={'id':aid,'strength':texture_strength,'periodPx':clamp(mask.width*numeric(params.get('Texture/Pattern/Scale'),1),1,4096)}
            notes.append(compatibility('textureApplication','Unsupported native texturing mode '+str(texture_mode)+'; previous grain approximation retained.','unsupported'))
    gradient_decoded=False
    if engine=='colorsmudge':
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
        modern=enabled(params.get('SmudgeRateUseNewEngine','false')) or 'color' in d['tip'] or 'material' in d['tip']
        foreground_modes={'grain_merge':'grainMerge','grain_extract':'grainExtract','negation':'negation'}
        legacy_foreground=not modern and mode in('multiply','screen')
        previous_canvas=(numeric(params.get('SmudgeRateMode'),0) in (0,1)
                         and (application==0 or 'color' in d['tip'] or 'material' in d['tip'])
                         and (eraser or params.get('CompositeOp','normal')=='normal' or (modern and (mode in modes or mode in foreground_modes)) or legacy_foreground))
        if previous_canvas:
            d['mixer'].update(source='projectionCanvas' if enabled(params.get('MergedPaint','false')) and 'material' not in d['tip'] else 'previousCanvas',load=0,initialLoad=0)
            if d['mixer']['source']=='projectionCanvas':notes.append(compatibility('mergedPaint','Captured visible-layer order/opacity and historical source reads; bounded live projection is recomposited per dab rather than native cached image overlay.'))
            if modern: d['mixer']['algorithm']='krita-stamp' if 'color' in d['tip'] else 'krita-mask'
            if modern and mode=='hard_mix_photoshop':
                notes=[note for note in notes if note['feature']!='hardMixPhotoshop']
                d['mixer']['colorRateComposite']='hardMixPhotoshop'
                behavior['rendering']['blendMode']='normal'
                d['version']=max(d['version'],65)
                notes.append(compatibility('colorRateComposite','Native strict U8 Photoshop Hard Mix is applied only to foreground paint; canvas feedback and final transfer keep their own strategy.','supported'))
            if (modern and mode in foreground_modes) or legacy_foreground:
                notes=[note for note in notes if note['feature']!='blendMode']
                d['mixer']['colorRateComposite']=foreground_modes[mode] if modern else mode
                behavior['rendering']['blendMode']='normal'
                notes.append(compatibility('colorRateComposite','Foreground-only composition; feedback and final transfer retain the selected modern/legacy strategy. U8 colour-profile and native byte rounding differ.','supported'))
            if eraser:
                d['mixer']['colorRateComposite']='erase'
                behavior['rendering']['blendMode']='normal'
                notes.append(compatibility('colorRateComposite','Foreground erase preserves smear/dull feedback and final transfer; zero Color Rate remains a pure blender. Native byte/colour-profile differences remain.','supported'))
            if 'material' in d['tip']:
                checked=enabled(params.get('PressurePaintThickness'))
                thickness=numeric(params.get('PaintThicknessValue'),1) if checked else 1
                if not 0<=thickness<=1:raise ValueError('Native Paint Thickness outside0..1')
                d['mixer']['paintThickness']={'value':thickness,'mode':'overwrite' if not checked or numeric(params.get('PaintThicknessThicknessMode'),2)==1 else 'overlay'}
                if checked:
                    controls=size_like_controls(params,'PaintThickness',notes,allow_time=timed_input)
                    if controls:d['mixer']['paintThickness']['dynamics']=controls
                if enabled(params.get('MergedPaint','false')):notes.append(compatibility('materialMergedPaint','Native LIGHTNESSMAP ignores the MergedPaint option and reads its own unshaded layer.','supported'))
                notes.append(compatibility('colorSmudgeMaterial','Separate unshaded colour and height persist in tile state, checkpoints and network snapshots; native16-bit colour, height/mask byte rounding and colour profile differ.'))

            # Native has no FlowOption in Color Smudge. Opacity is already in
            # dab.opacity, and is used in two distinct native composition stages.
            d['flow']=1;d['flowByPressure']=[[0,1],[1,1]]
            behavior.get('modulations',{}).pop('flow',None)
            if color_rate>0:
                foreground={'rate':color_rate if modern else clamp(max(1-raw_smudge_rate,.2)*color_rate)}
                controls=size_like_controls(params,'ColorRate',notes,allow_time=timed_input)
                if controls: foreground['dynamics']=controls
                if enabled(params.get('PressureGradient')) and 'color' not in d['tip']:
                    position=numeric(params.get('GradientValue'),1)
                    if not 0<=position<=1:raise ValueError('Native gradient position outside0..1')
                    foreground.update(value=position)
                    position_controls=size_like_controls(params,'Gradient',notes,allow_time=timed_input)
                    if position_controls:foreground['positionDynamics']=position_controls
                    foreground={'gradient':foreground}
                    notes.append(compatibility('foregroundGradient','Gradient position and alpha use a gesture-captured256-sample canvas resource before HSV; default Grafetto resource is foreground-to-white, custom native selection is external to KPP.'))
                d['mixer']['foreground']=foreground
            if enabled(params.get('PressureGradient')):
                gradient_decoded=True
                if 'color' in d['tip']:notes.append(compatibility('foregroundGradient','Native RGB stamp pigment does not use the foreground paintColor gradient.','supported'))
            if numeric(params.get('SmudgeRateMode'),0)==1:
                radius=numeric(params.get('SmudgeRadiusValue'),3)
                if numeric(params.get('SmudgeRadiusVersion'),1)<2: radius/=100
                radius=clamp(radius,0,3) if enabled(params.get('PressureSmudgeRadius')) else 0
                d['mixer']['sampling']={'mode':'maskMean' if modern else 'adaptiveMean','radius':min(radius,1) if modern else radius}
                if enabled(params.get('PressureSmudgeRadius')):
                    controls=size_like_controls(params,'SmudgeRadius',notes,allow_time=timed_input)
                    if controls: d['mixer']['sampling']['radiusDynamics']=controls
                notes.append(compatibility('colorSmudge','Legacy normal ALPHAMASK dulling uses adaptive uniform Halton sampling and optional foreground:1024-tap cap, bounded512px gather and premultiplied RGBA8/convergence metric differ from native colours.'))
            else:
                notes.append(compatibility('colorSmudge','Legacy normal ALPHAMASK smearing samples previous canvas with optional foreground; native mask/byte quantization require calibration.'))
            if modern:
                notes=[note for note in notes if note.get('feature')!='colorSmudge']
                notes.append(compatibility('colorSmudge','New ALPHAMASK feedback composition, squared dynamic Color Rate, Smearing/Dulling and mask-weighted mean. Adaptive mask-weighted Halton sampling with64/2% initial batch,16-tap convergence and radius retries;1024 taps/attempt and512px gather cap plus RGBA8 colour-space differences remain.'))
        else:
            d['tip'].pop('color',None)
            d['tip'].pop('material',None)
            notes.append(compatibility('colorSmudge','Unsupported native non-ALPHAMASK, overlay, non-normal or unknown-mode strategy; carried-pigment approximation retained.','unsupported'))
        if enabled(params.get('PressureSmudgeRate')):
            controls=size_like_controls(params,'SmudgeRate',notes,allow_time=timed_input)
            if controls:
                d['mixer']['pickupDynamics']=controls
                notes.append(compatibility('SmudgeRateCurve','Native smudge-rate natural-cubic response compiled to256-sample transfer; sensor normalization remains subject to calibration.'))
    if engine=='colorsmudge' and enabled(params.get('PressureSoftness')):
        notes.append(compatibility('softnessDynamics','Native Color Smudge requests dab softness1.0; saved Pixel Softness controls do not modify its mask.','supported'))
    active=[k for k in params if k.startswith('Pressure') and enabled(params[k]) and k not in ('PressureSize','PressureOpacity','PressureFlow','PressureScatter','PressureSmudgeRate') and not (k=='PressureSmudgeRadius' and 'sampling' in d.get('mixer',{})) and not (k=='PressureColorRate' and d.get('mixer',{}).get('source') in ('previousCanvas','projectionCanvas')) and not (k=='PressureTexture/Strength/' and (not enabled(params.get('Texture/Pattern/Enabled')) or (d.get('texture',{}).get('application')or d.get('texture',{}).get('material')))) and not (k=='PressureSpacing' and 'spacing' in behavior) and not (k=='PressureRotation' and rotation_decoded) and not (k=='PressureRatio' and ratio_decoded) and not (k=='PressureMirror'and('mirror'in behavior or not any(mirror_axes))) and not (k=='PressureSharpness' and d['tip'].get('alphaThreshold')) and k not in color_decoded and not (k=='PressureGradient' and gradient_decoded) and not (k=='PressurePaintThickness' and (d.get('mixer',{}).get('paintThickness') or engine=='colorsmudge')) and not (k=='PressureLightnessStrength' and (d['tip'].get('material') or engine=='colorsmudge')) and not (k=='PressureSoftness' and (engine=='colorsmudge' or 'softness'in behavior or gaussian_softness_noop)) and not (k=='PressureSmudgeRadius' and engine=='colorsmudge' and numeric(params.get('SmudgeRateMode'),0)==0)]
    if active:
        notes.append(compatibility('activeDynamics',', '.join(sorted(active)),'unsupported'))
    if enabled(params.get('MaskingBrush/Enabled')):
        child_root=ET.Element('Preset',{'paintopid':'paintbrush','name':'Masking component'})
        prefix='MaskingBrush/Preset/'
        for key,value in params.items():
            if key.startswith(prefix): ET.SubElement(child_root,'param',{'name':key[len(prefix):]}).text=value
        child_png=io.BytesIO();meta=PngImagePlugin.PngInfo();meta.add_text('version','5.0');meta.add_text('preset',ET.tostring(child_root,encoding='unicode'),zip=True)
        Image.new('L',(1,1)).save(child_png,format='PNG',pnginfo=meta)
        child_result=preset(child_png.getvalue(),name,catalog,resources,depth+1,stroke_input=False,timed_input=timed_input,_allow_texture_material=False)
        notes.extend({**note,'feature':'masking.'+note['feature']} for note in child_result['compatibility'])
        if stroke_input:
            child_params={key[len(prefix):]:value for key,value in params.items() if key.startswith(prefix)}
            try:
                if stroke_input_policy(child_params,xml,native_transfer) is not None:
                    notes.append(compatibility('masking.strokeInput','Independent child input law is not executed; source policy not emitted.','unsupported'))
            except ValueError as error:
                notes.append(compatibility('masking.strokeInput',str(error),'unsupported'))
        child=child_result['descriptor']
        #120 default API opt-in only when BOTH native components use checked
        # identity/unlocked/no-fan DrawingAngle. Never invent a root carrier.
        child_params={key[len(prefix):]:value for key,value in params.items()if key.startswith(prefix)}
        try:
            root_policy=stroke_input_policy(params,xml,native_transfer)
            child_policy=stroke_input_policy(child_params,xml,native_transfer)
        except ValueError:
            root_policy=child_policy=None
        identity_policy={'version':1,'initialDirection':'cursorHistory'}
        if depth==0 and engine=='paintbrush'and _allow_texture_material and root_policy==identity_policy and child_policy==identity_policy and behavior.get('rotation')=={'follow':1,'random':'none'}and child.get('behavior',{}).get('rotation')=={'follow':1,'random':'none'}:
            child_drawing_angle=child_png.getvalue()
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
            functional_refresh=engine=='paintbrush'
            valid=(not refresh_random or functional_refresh)and math.isfinite(value) and 0<=value<=1 and len(controls)<=4 and math.isfinite(rate) and 0<=rate<=1000 and not any(n['status']=='unsupported'for n in rate_notes)
            valid=valid and (not enabled(params.get('PressureRate')) or not enabled(params.get('RateUseCurve','true')) or bool(controls))
            def refresh_control(c):
                combine=c.get('combine')
                return functional_refresh and any(leaf['control']=='random'for leaf in combine['scaling']+combine['additive'])and all(refresh_control(leaf)for leaf in combine['scaling']+combine['additive']) if combine else c['control']in(('pressure','off','random')if functional_refresh else('pressure','off'))and c.get('jitter',0)==0
            valid=valid and all(refresh_control(c)for c in controls)
            if valid:
                behavior['timing']={'version':1,'rate':rate,'ignoreDistanceSpacing':enabled(params.get('PaintOpSettings/ignoreSpacing'))}
                if controls:behavior['timing']['rateDynamics']=controls
                if functional_refresh:
                    source_time_random=[False]
                    def time_random(node,path):
                        if isinstance(node,dict):
                            if node.get('control')=='random':
                                node['randomSource']={'kind':'grafettoSourceTime-v1','key':path};source_time_random[0]=True
                            for key,value in node.items():
                                if key not in('brush','randomSource'):time_random(value,path+'/'+key)
                        elif isinstance(node,list):
                            for index,value in enumerate(node):time_random(value,path+'/'+str(index))
                    time_random(behavior,'behavior')
                    if source_time_random[0]:
                        d['version']=max(d['version'],81)
                        notes.append(compatibility('airbrushFuzzyRefresh','Stationary and emitted queries use captured F64 sourceTime, gesture seed and sensor role. No refresh-event network history is needed; native random order and sequence differ.','supported'))
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
    if gih_uses_mode(d['tip'].get('animation',{}),'angular'):
        # GIH selection uses DrawingAngle even without an active Rotation sensor.
        # Enable the existing author capture by default, never a test-only CLI opt-in.
        if enabled(params.get('PressureRotation')):
            policy=stroke_input_policy(params,xml,native_transfer)
            if policy is None or policy.get('fanCorners') or behavior.get('rotation')!={'follow':1,'random':'none'}:raise ValueError('Angular GIH active rotation requires identity unlocked DrawingAngle without fan')
        behavior['strokeInput']={'version':1,'initialDirection':'cursorHistory'}
        notes.append(compatibility('gihAngular','Captured DrawingAngle chooses floor(normalize(angle+135deg)/360deg*rank), modulo actual frames. Movement >=.5 is measured per logical attempt, including rejected attempts. Explicit first-request-v1 paints the first request; native first-point initialization and float-vector threshold rounding may differ.','supported'))
    warnings.extend(n['feature']+': '+n['detail'] for n in notes if n['status']!='supported')
    def native_keyed(value):
        if isinstance(value,dict):
            return value.get('control')=='strokeRandom' and 'randomSource' in value or any(native_keyed(v) for v in value.values())
        return isinstance(value,list) and any(native_keyed(v) for v in value)
    def has_absolute_combination(value):
        if isinstance(value,dict):return bool(value.get('combine',{}).get('absolute'))or any(has_absolute_combination(v)for v in value.values())
        return isinstance(value,list)and any(has_absolute_combination(v)for v in value)
    absolute_combination=has_absolute_combination(d)
    if absolute_combination:
        if depth>0:raise ValueError('Independent child absolute size-like input is unsupported')
        behavior.setdefault('strokeInput',{'version':1,'initialDirection':'cursorHistory'})
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
    if d.get('mixer',{}).get('algorithm') or d.get('mixer',{}).get('sampling',{}).get('mode')=='adaptiveMean': d['version']=max(d['version'],36)
    if d.get('mixer',{}).get('paintThickness'): d['version']=max(d['version'],37)
    if d.get('mixer',{}).get('source')=='projectionCanvas':d['version']=max(d['version'],38)
    if 'gradient' in d.get('mixer',{}).get('foreground',{}) or 'gradient' in d['tip'].get('color',{}):d['version']=max(d['version'],39)
    if d.get('mixer',{}).get('paintThickness') and enabled(params.get('PressureLightnessStrength')) and clamp(numeric(params.get('LightnessStrengthValue'),1))!=1:d['version']=max(d['version'],40)
    if engine=='colorsmudge' and enabled(params.get('PressureSoftness')):d['version']=max(d['version'],41)
    def has_combination(value):
        if isinstance(value,dict):return 'combine'in value or any(has_combination(v)for v in value.values())
        return isinstance(value,list)and any(has_combination(v)for v in value)
    if has_combination(d):d['version']=max(d['version'],57)
    if behavior.get('mirror'):d['version']=max(d['version'],58)
    if behavior.get('rotation',{}).get('composition',{}).get('scalingMode'):d['version']=max(d['version'],59)
    if rotation_static:d['version']=max(d['version'],60)
    if behavior.get('rotation',{}).get('composition',{}).get('absolute'):d['version']=max(d['version'],61)
    if absolute_combination:d['version']=max(d['version'],62)
    def has_distance_control(v):
        if isinstance(v,dict):return v.get('control')=='distance'or any(has_distance_control(x)for x in v.values())
        return isinstance(v,list)and any(has_distance_control(x)for x in v)
    if has_distance_control(d):d['version']=max(d['version'],63)
    # Keep newly admitted capabilities above historical input/timer revisions.
    if behavior.get('softness')is not None and d['tip'].get('profile',{}).get('kind')=='standard':d['version']=max(d['version'],64)
    if d.get('mixer',{}).get('colorRateComposite')=='erase':d['version']=max(d['version'],88)
    if d.get('mixer',{}).get('colorRateComposite')=='hardMixPhotoshop':d['version']=max(d['version'],65)
    if d.get('mixer',{}).get('colorRateComposite')in('grainMerge','grainExtract','negation'):d['version']=max(d['version'],82)
    if d.get('mixer',{}).get('colorRateComposite')in('multiply','screen'):d['version']=max(d['version'],85 if d['mixer'].get('source')=='projectionCanvas' else 83)
    if d['tip'].get('profile',{}).get('kind')=='radialCurveSoftness':d['version']=max(d['version'],68)
    foreground=d.get('mixer',{}).get('foreground',{})
    foreground=foreground.get('gradient',foreground)
    if any(c.get('combine',{}).get('constant',1)!=1 for c in foreground.get('dynamics',[])):d['version']=max(d['version'],69)
    def has_time_random(node):
        if isinstance(node,dict):return node.get('randomSource',{}).get('kind')=='grafettoSourceTime-v1'or any(has_time_random(value)for key,value in node.items()if key!='brush')
        return isinstance(node,list)and any(has_time_random(value)for value in node)
    if has_time_random(behavior):d['version']=max(d['version'],81)
    if engine=='paintbrush'and 'planes'in d['tip'].get('color',{}):
        if behavior.get('dual')or behavior.get('colorAdjustment')or behavior.get('edgeBleed')or any(behavior.get('dynamics',{}).get(k)or behavior.get('modulations',{}).get(k)for k in('hue','saturation','brightness')):raise ValueError('Pixel original RGBA active colour/dual adjustments are not implemented')
        d['version']=max(d['version'],84)
    if d.get('texture',{}).get('material'):
        tip=d['tip'];t=d['texture'];render=behavior.get('rendering',{})
        if (engine!='paintbrush'or d['model']!='stamp'or tip.get('kind')!='bitmap'or any(k in tip for k in('animation','color','material','imageSampling','profile','autoNoise','autoShape'))or any(k in d for k in('mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal','wet'))or d.get('paperInteraction')!=0 or behavior.get('dual')or behavior.get('erase')or 'edgeBleed'in behavior or 'grain'in behavior or behavior.get('wetMix')or render.get('blendMode')!='normal'or render.get('accumulation')!='directOver'or enabled(params.get('Texture/Pattern/AutoInvertOnErase'))):
            raise ValueError('Texture Lightness108 requires root static MASK Pixel, opaque RGB source and directOver normal')
        d['version']=max(d['version'],111 if t['material']['kind']=='gradient'else 108)
        if t['material']['kind']=='gradient':notes.append(compatibility('textureGradient','Pattern gray is filtered before captured256 palette lookup; alpha is clamped to already coloured dab and mixed with native byte-rounded strength using alpha-aware weighted colour. Functional RGB/alpha graph; ICC/native U8 identity is not claimed.','supported'))
        else:notes.append(compatibility('textureLightness','Pattern gray is compiled after white-compositing/tone while original alpha remains independent. Lightness changes current opaque-source RGB; alpha=min(patternAlpha,dabAlpha) before flow/opacity even at strength0. Functional HSL graph shares the existing material helper; native U8/ICC identity is not claimed.','supported'))
    if d.get('texture',{}).get('eraseId'):d['version']=max(d['version'],77)
    if d.get('texture',{}).get('application',{}).get('mode')in('darken','overlay','linearDodge','linearBurn','colorDodge','colorBurn','hardMixPhotoshop','hardMixSofterPhotoshop'):
        if engine=='colorsmudge':
            m=d.get('mixer',{});tip=d['tip']
            if (m.get('algorithm')!='krita-mask'or m.get('source')!='previousCanvas'or m.get('colorRateComposite')is not None or m.get('paintThickness')is not None or tip.get('kind')!='bitmap'or any(k in tip for k in('animation','color','material'))or behavior.get('dual')or behavior.get('erase')or behavior.get('rendering',{}).get('blendMode')!='normal'or d['texture'].get('eraseId')):
                raise ValueError('Modern texture103 requires root static MASK previousCanvas normal Color Smudge')
            d['version']=max(d['version'],103)
            if d['texture']['application']['mode']in('darken','overlay','linearDodge','linearBurn'):
                notes.append(compatibility('colorSmudgeTexture','Modern MASK applies native alpha-role darken/overlay/linearDodge/linearBurn through the shared Pixel75 functional graph; GPU/native U8 staging is not byte-identical.','supported'))
        else:d['version']=max(d['version'],75)
        if d['texture']['application']['mode']in('colorDodge','colorBurn','hardMixPhotoshop','hardMixSofterPhotoshop'):
            if engine not in('paintbrush','colorsmudge')or behavior.get('dual'):raise ValueError('Texture105 requires root Pixel or modern MASK')
            d['version']=max(d['version'],105)
            notes.append(compatibility('textureAlpha105','Native alpha-role Dodge/Burn/Photoshop Hard Mix/Softer strength laws retained, including no-resurrection and soft union factors; normalized functional math differs from staged native U8 rounding.'))
    if d['tip'].get('profile',{}).get('kind')in('gaussian2D','curveRectangle','curveRectangleSoftness'):d['version']=max(d['version'],{'gaussian2D':78,'curveRectangle':79,'curveRectangleSoftness':80}[d['tip']['profile']['kind']])
    if d['tip'].get('autoNoise'):d['version']=max(d['version'],74)
    if engine=='paintbrush' and 'gradient'in d['tip'].get('color',{}):
        if behavior.get('dual')or behavior.get('rendering',{}).get('accumulation')!='directOver'or behavior.get('rendering',{}).get('blendMode')!='normal':raise ValueError('Pixel gradient requires independent directOver normal rendering')
        d['version']=max(d['version'],100)
    if d['tip'].get('autoShape'):d['version']=max(d['version'],71)
    if behavior.get('dual',{}).get('sampling')!='independent'and behavior.get('dual',{}).get('brush',{}).get('behavior',{}).get('mirror'):d['version']=max(d['version'],73)
    if any(behavior.get('dual',{}).get('brush',{}).get('behavior',{}).get(key,{}).get('lightnessStrength') for key in ('dynamics','modulations')):d['version']=max(d['version'],90)
    if d['tip'].get('animation',{}).get('geometry') is not None:
        d['version']=max(d['version'],(119 if 'planes'in d['tip'].get('color',{})else 118)if d['tip']['animation']['mode']in('angular','xtilt','ytilt','dimensions')else 86)
        if 'planes'in d['tip'].get('color',{})and d['tip']['animation']['mode']in('angular','xtilt','ytilt','dimensions'):
            if not is_sensor_original_rgba119(d):raise ValueError('Original RGBA sensor geometry requires unequal119 scope')
            notes.append(compatibility('gihSensorOriginalRgba','Unequal original ImageStamp RGBA frames retain selected RGB/alpha planes and86 geometry under119 sensor policies. Foreground colour is not substituted; existing prepared RGBA cache/leases and finite admission are reused. Qt filtering, native ICC and byte projection differ.'))
    if d['tip'].get('animation',{}).get('mode')in('angular','xtilt','ytilt','dimensions')and'geometry'not in d['tip']['animation']and'planes'in d['tip'].get('color',{}):
        d['version']=max(d['version'],121)
        if not is_sensor_original_rgba121(d):raise ValueError('Equal original RGBA sensor requires121 closed scope')
        notes.append(compatibility('gihEqualSensorOriginalRgba','Equal original ImageStamp RGBA frames retain selected RGB and alpha under121 sensor policies, using the existing prepared RGBA cache and finite leases. Foreground colour is not substituted. Qt filtering, native ICC and byte projection differ.'))
    if d['tip'].get('animation',{}).get('mode')in('angular','xtilt','ytilt','dimensions')and'geometry'not in d['tip']['animation']and d['tip'].get('material',{}).get('kind')=='lightness':
        d['version']=max(d['version'],123)
        if not is_equal_lightness_gih123(d):raise ValueError('Equal Lightness sensor requires123 closed scope')
        notes.append(compatibility('gihEqualSensorLightness','Equal native LIGHTNESSMAP frames retain selected adjusted gray and alpha under123 sensor policies, using existing paired material packing and required finite bank readiness. Native ICC, subpixel filtering and byte projection differ.'))
    if d['tip'].get('animation',{}).get('mode')in('angular','xtilt','ytilt','dimensions')and'geometry'in d['tip']['animation']and d['tip'].get('material',{}).get('kind')=='lightness':
        d['version']=max(d['version'],124)
        if not is_unequal_lightness_gih124(d):raise ValueError('Unequal Lightness sensor requires124 closed scope')
        notes.append(compatibility('gihUnequalSensorLightness','Original selected LIGHTNESSMAP gray/alpha and118 physical geometry retained under124; existing per-size material groups and required finite readiness reused. Native ICC/filtering and byte projection differ.'))
    if behavior.get('dual',{}).get('brush',{}).get('tip',{}).get('animation',{}).get('mode')=='velocity':d['version']=max(d['version'],92)
    if d['tip'].get('animation',{}).get('mode')=='angular':
        if (engine!='paintbrush' or depth or eraser or any(k in d for k in('wet','texture','mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')) or behavior.get('dual') or behavior.get('timing') or behavior.get('sequentialRandom') or behavior.get('rendering',{}).get('blendMode')!='normal' or behavior.get('rendering',{}).get('accumulation')!='directOver' or behavior.get('rendering',{}).get('wetEdges',0)!=0 or behavior.get('rendering',{}).get('burntEdges',0)!=0):raise ValueError('Angular GIH requires root static normal directOver Pixel without timers/erase/dual')
        d['version']=max(d['version'],110)
    if d['tip'].get('animation',{}).get('mode')in('xtilt','ytilt'):
        if(engine!='paintbrush' or not _allow_texture_material or depth or eraser or any(k in d for k in('wet','texture','mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')) or behavior.get('dual') or behavior.get('timing') or behavior.get('sequentialRandom') or behavior.get('strokeInput',{}).get('fanCorners') or behavior.get('rendering',{}).get('blendMode')!='normal' or behavior.get('rendering',{}).get('accumulation')!='directOver' or behavior.get('rendering',{}).get('wetEdges',0)!=0 or behavior.get('rendering',{}).get('burntEdges',0)!=0):raise ValueError('GIH tilt requires root static normal directOver Pixel')
        d['version']=max(d['version'],112)
        notes.append(compatibility('gihTilt','Captured degree-axis F32, Qt5-half-up-v1 rounding and unsigned actual-EOF modulo retained; other Qt rounding/device calibration and native subpixel precision are not claimed. Tilt does not require Angular movement gating.','supported'))
    if d['tip'].get('animation',{}).get('mode')=='dimensions':
        d['version']=max(d['version'],115 if gih_uses_mode(d['tip']['animation'],'random')or gih_uses_mode(d['tip']['animation'],'incremental')else 113)
        validate_dimensions(d,depth,_allow_texture_material and engine=='paintbrush')
    if child_drawing_angle is not None:
        dual=behavior['dual'];child=dual['brush'];identity_policy={'version':1,'initialDirection':'cursorHistory'}
        pair_version=122 if 'imageSampling'in d['tip']or 'imageSampling'in child['tip']else 120
        candidate_child={**child,'version':max(child['version'],pair_version),'behavior':{**child['behavior'],'strokeInput':identity_policy.copy()}}
        candidate={**d,'version':max(d['version'],pair_version),'behavior':{**behavior,'strokeInput':identity_policy.copy(),'dual':{**dual,'brush':candidate_child}}}
        if independent_drawing_angle_pair(candidate):
            candidate['behavior']['dual']['brush']=finalize_identity(candidate_child,child_drawing_angle)
            d=candidate;behavior=d['behavior']
            notes[:]=[n for n in notes if n['feature']!='masking.strokeInput']
            notes.append(compatibility('masking.strokeInput','Independent mask identity DrawingAngle follows its own emitted canonical requests; first angle uses the captured root cursor-history channel. No fan/lock/native spline pixel identity is claimed.','supported'))
        else:
            notes.append(compatibility('masking.strokeInput','This root/child combination is outside the closed identity DrawingAngle120 scope; existing mask lowering retained.','unsupported'))
    validate_variable_gih_descriptor(d,{aid:asset['size']for aid,asset in catalog.assets.items()})
    if behavior['rendering'].get('blendMode') in('hardMixPhotoshop','kritaHardMix') and (d['model']!='stamp' or behavior.get('dual')is not None or behavior.get('wetMix')is not None or behavior.get('erase')is True):raise ValueError('Photoshop Hard Mix requires an unpaired Pixel stamp')
    result={'descriptor':finalize_identity(d,data),'name':root.get('name') or PurePosixPath(name).stem,'source':PurePosixPath(name).name,'warnings':warnings,'compatibility':notes}
    result['preview'] = author_preview
    if source_size is not None:
        result['sourceDefaults']={'sizePx':clamp(source_size,.01,10000),'opacity':d['opacity'],'flow':d['flow']}
    return result


def _native_preset_transaction(catalog, produce):
    """Only convert_krita owns rollback; direct preset() retains its old API.

    Snapshot before the entire preset, including recursive masking children.
    Never remove a pre-existing path, shared CAS or an unrelated non-CAS file.
    """
    assets_before={key:dict(value) for key,value in catalog.assets.items()}
    files_before={path.name for path in catalog.output.iterdir()}
    brush_count,skipped_count=len(catalog.brushes),len(catalog.skipped)
    try:
        return produce()
    except (ValueError, ET.ParseError, OSError):
        cleanup_error=None
        candidates={asset.get('file') for asset in catalog.assets.values()}
        try:
            for name in candidates:
                if not isinstance(name,str) or not re.fullmatch(r'[a-f0-9]{64}\.bin',name) or name in files_before:
                    continue
                path=catalog.output/name
                try:
                    if path.is_symlink():
                        raise OSError('Refusing native-preset rollback of a symlink')
                    path.unlink(missing_ok=True)
                except OSError as error:
                    cleanup_error=error
        finally:
            catalog.assets.clear();catalog.assets.update(assets_before)
            del catalog.brushes[brush_count:]
            del catalog.skipped[skipped_count:]
        if cleanup_error is not None:
            # Abort the whole CLI, rather than publishing a manifest after a
            # failed rollback. The API removes its owned work directory.
            raise RuntimeError('Native preset rollback failed') from cleanup_error
        raise


def convert_krita(path, catalog, external=None, *, sequential_xy=False, stroke_input=False, timed_input=False):
    if type(sequential_xy) is not bool: raise ValueError('Sequential XY opt-in must be an explicit boolean')
    if type(stroke_input) is not bool: raise ValueError('Stroke input opt-in must be an explicit boolean')
    if type(timed_input) is not bool: raise ValueError('Timed input opt-in must be an explicit boolean')
    if path.suffix.lower() == '.kpp':
        try:
            catalog.brushes.append(_native_preset_transaction(catalog,lambda:preset(path.read_bytes(), path.name, catalog, external or {}, sequential_xy=sequential_xy,stroke_input=stroke_input,timed_input=timed_input)))
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
        # Explicit prepared SVG bytes (the pinned stock adapter) keep their
        # previous resolver precedence. Raw bundle SVG is a fallback captured
        # member, never a URL/path opened by its filename.
        prepared_svg_names={PurePosixPath(n).name for n in resources if n.lower().endswith('.svg')}
        resources.update({n:(lambda entry=n: archive.read(entry)) for n in names if n.lower().endswith(('.gbr','.gih','.png','.pat','.jpg','.jpeg','.webp')) or (n.lower().endswith('.svg') and PurePosixPath(n).name not in prepared_svg_names)})
        for name in sorted(n for n in names if n.lower().endswith(('.kpp','.myb'))):
            try:
                if name.lower().endswith('.myb'):
                    from mypaint_import import mypaint_preset
                    preview=str(PurePosixPath(name).with_suffix(''))+'_prev.png'
                    catalog.brushes.append(_native_preset_transaction(catalog,lambda:mypaint_preset(archive.read(name),name,catalog,archive.read(preview)if preview in names else None)))
                else:
                    catalog.brushes.append(_native_preset_transaction(catalog,lambda:preset(archive.read(name),name,catalog,resources, sequential_xy=sequential_xy,stroke_input=stroke_input,timed_input=timed_input)))
            except (ValueError, ET.ParseError, OSError) as error:
                catalog.skipped.append({'name':PurePosixPath(name).stem,'reasons':[str(error)]})
