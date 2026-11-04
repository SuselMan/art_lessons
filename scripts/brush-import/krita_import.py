"""Bounded Krita resource reader; independent implementation of documented data.

KPP thumbnails are never used as brush tips. Missing resources and unsupported
paint operations fail explicitly rather than changing the meaning of a preset.
"""
import base64
import hashlib
import io
import json
import math
import re
from pathlib import PurePosixPath
import struct
import xml.etree.ElementTree as ET
import zipfile
from PIL import Image, ImageChops, PngImagePlugin
from brush_contract import MAX_PIXELS, clamp, compatibility, descriptor, finalize_identity
from curve_transfer import native_transfer,scaled_curve
from source_stamp_data import retain_source_stamp, compile_source_stamp, required_source_curves, soft_source_material_domain, seeded_default_auto_material_domain, SEEDED_DEFAULT_AUTO_PROFILE
from sequential_xy import compatible as sequential_xy_compatible
from stroke_input import source_policy as stroke_input_policy
from krita_texture import preprocess_texture
from krita_lightness import compile_lightness_planes

MAX_XML = 32 * 1024 * 1024


class VerifiedStockSvgMask(bytes):
    """Prepared opaque-gray raster of the single audited stock SVG.

    Provenance travels with the in-memory resource, not its filename. This is
    deliberately not a general SVG decoder or a new SOURCE paint authority.
    """
    def __new__(cls, png, original_svg):
        if (len(original_svg)!=20404 or hashlib.sha256(original_svg).hexdigest()!=
                '9ccd89dfbbd74096b858374700629b94413855276c8075db3f8cbef72e9baa5a'):
            raise ValueError('Unverified stock SVG source')
        if len(png)>4_000_000:
            raise ValueError('Prepared stock SVG raster exceeds limit')
        with Image.open(io.BytesIO(png)) as image:
            if image.format!='PNG' or image.size!=(1000,1000):
                raise ValueError('Prepared stock SVG grid differs')
            image.load()
            if has_color(image) or image.convert('RGBA').getchannel('A').getextrema()!=(255,255):
                raise ValueError('Prepared stock SVG is not opaque grayscale')
        return bytes.__new__(cls,png)


class CapturedGeneralSvgMask(bytes):
    """Only this constructor accepts original SVG and invokes the closed renderer."""
    def __new__(cls, original_svg, filename):
        from general_svg import rasterize_svg
        if not isinstance(filename,str) or not 1<=len(filename)<=1024 or '\x00' in filename:
            raise ValueError('Invalid original SVG filename')
        png, proof = rasterize_svg(original_svg)
        with Image.open(io.BytesIO(png)) as image:
            if image.format!='PNG' or image.mode!='L' or image.size!=(proof['width'],proof['height']):
                raise ValueError('General SVG raster/provenance mismatch')
            image.load()
        versions=proof['rendererVersions']
        provenance={'kind':'librsvg-gray-vector-subset-v1','originalFilename':filename,
            'originalSha256':proof['originalSha256'],'sanitizedSha256':proof['sanitizedSha256'],
            'rasterSha256':proof['rasterSha256'],'helperSha256':proof['helperSha256'],
            'width':proof['width'],'height':proof['height'],
            'sharpVersion':versions.get('sharp'),'rsvgVersion':versions.get('rsvg')}
        if any(not isinstance(provenance[k],str) or not 1<=len(provenance[k])<=128 for k in ('sharpVersion','rsvgVersion')):
            raise ValueError('Missing actual SVG renderer version')
        result=bytes.__new__(cls,png);result.provenance=provenance
        return result


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


def soft_circle(curve='0,1;1,0', diameter=60, size=256):
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
        dim=int(params.get('dim','1'));cells=int(params.get('ncells',str(count)))
        if not 1<=count<=256 or not 1<=dim<=4 or not 1<=cells<=256:
            raise ValueError('Unsupported GIH count/dimensions/cells')
        modes=('constant','incremental','random','pressure','angular','xtilt','ytilt','velocity')
        dimensions=[];product=1;stride=cells
        for axis in range(dim):
            rank=int(params.get('rank'+str(axis),str(count) if dim==1 else '0'))
            mode=params.get('sel'+str(axis),params.get('selection','incremental') if axis==0 else 'constant')
            if not 1<=rank<=256 or mode not in modes:
                raise ValueError('Unsupported GIH rank/selection')
            product*=rank;stride//=rank
            if product>256: raise ValueError('GIH rank product exceeds capacity')
            dimensions.append({'mode':mode,'rank':rank,'stride':stride})
        mode=dimensions[0]['mode'] if dim==1 and dimensions[0]['rank']==count and cells==count and dimensions[0]['mode'] in ('random','incremental') else 'native-dimensions-v1'
    except (IndexError,ValueError) as error:
        raise ValueError('Invalid or unsupported GIH parameters: '+str(error)) from error
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
    return {'mode':mode,'frames':frames,'coloured':coloured,'declaredCount':count,'declaredCells':cells,'dimensions':dimensions}


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


def integer_image_sampling(image, application, asset_size, *, max_side=512):
    """Only an unchanged opaque gray source can be recovered from coverage.

    A bounded source domain admits a complete native level bank before a stroke;
    colored/transparent/material and rescaled sources retain their old policy.
    The renderer performs the final whole-brush residency admission separately.
    """
    if application != 0 or max(image.size) > max_side or has_color(image):
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
    if application==1:
        return image.convert('RGBA').getchannel('A')
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


def adjusted_mask_image(image, definition):
    """KisColorfulBrush non-IMAGESTAMP gray transfer before coverage/levels.

    Uses the same bounded native midpoint/brightness/contrast law as lightness
    materials, retaining source alpha. The resulting CAS pixels are already
    adjusted; playback must never apply this transfer again.
    """
    gray,alpha=lightness_planes(image,definition)
    return Image.merge('RGBA',(gray,gray,gray,alpha))


def raster(data, name, brush=False):
    if name.lower().endswith('.gbr'):
        image=gbr(data,preserve_color=brush)
        return image_coverage(image) if brush and image.mode=='RGBA' else image
    if name.lower().endswith('.pat'):
        if len(data)<24: raise ValueError('Truncated PAT header')
        header, version, w, h, channels, magic = struct.unpack('>6I',data[:24])
        if version!=1 or magic!=0x47504154 or header<24 or header>len(data) or w*h>MAX_PIXELS or min(w,h)<1 or channels not in (1,2,3,4) or len(data)!=header+w*h*channels:
            raise ValueError('Unsupported PAT pattern')
        return Image.frombytes({1:'L',2:'LA',3:'RGB',4:'RGBA'}[channels],(w,h),data[header:])
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


def _new_mapped_soft_material_supported(d, engine, depth):
    """Eligibility only, after whole trusted mapped compilation/validation.

    Raw retention and portable dictionaries keep their historical frontiers.
    This is not a compiler/profile assertion or an editor execution grant.
    """
    behavior=d.get('behavior',{})
    return (engine=='paintbrush' and depth==0 and d.get('model')=='stamp'
            and 'dual' not in behavior and 'colorAdjustment' not in behavior
            and soft_source_material_domain(d['sourceStamp']))



def _texture_pressure_data_candidate(d):
    from source_stamp_data import texture_pressure_source_curve
    if texture_pressure_source_curve(d.get('sourceStamp')) is None: return False
    t=d.get('texture',{}); a=t.get('application',{}); offset=t.get('offset',{}); b=d.get('behavior',{})
    return (d.get('model')=='stamp' and t.get('strength')==1 and a.get('mode')=='subtract'
            and a.get('soft') is False and offset.get('randomX') is False and offset.get('randomY') is False
            and not any(d.get(k) for k in ('mixer','wet','screentonePx'))
            and not any(b.get(k) for k in ('dual','colorAdjustment','wetMix','edgeBleed','grain','taper')))

def _gaussian_texture_pressure_data_candidate(d):
    from source_stamp_data import gaussian_texture_pressure_source_curve
    if gaussian_texture_pressure_source_curve(d.get('sourceStamp')) is None: return False
    t=d.get('texture',{}); a=t.get('application',{}); offset=t.get('offset',{}); b=d.get('behavior',{})
    # Original random flags are DATA. No random phase, raster or author is minted.
    return (d.get('model')=='stamp' and t.get('strength')==1 and a.get('mode')=='subtract'
            and a.get('soft') is False and offset.get('randomX') is True and offset.get('randomY') is True
            and not any(d.get(k) for k in ('mixer','wet','screentonePx'))
            and not any(b.get(k) for k in ('dual','colorAdjustment','wetMix','edgeBleed','grain','taper')))


def _texture_native_default_data_candidate(d):
    from source_stamp_data import texture_native_default_source_curve
    if texture_native_default_source_curve(d.get('sourceStamp')) is None: return False
    t=d.get('texture',{}); a=t.get('application',{}); offset=t.get('offset',{}); b=d.get('behavior',{})
    return (d.get('model')=='stamp' and t.get('strength')==1 and a.get('mode')=='subtract'
            and a.get('soft') is False and offset.get('randomX') is False and offset.get('randomY') is False
            and not any(d.get(k) for k in ('mixer','wet','screentonePx'))
            and not any(b.get(k) for k in ('dual','colorAdjustment','wetMix','edgeBleed','grain','taper')))

def preset(data, name, catalog, external, depth=0, *, sequential_xy=False, stroke_input=False, timed_input=False, curve_compiler=None, mapped_curve_provider=None, source_material_profile=None, native_default_texture=False):
    if type(native_default_texture) is not bool or native_default_texture and mapped_curve_provider is None: raise ValueError('Native default texture requires explicit mapped provider')
    if curve_compiler is not None and mapped_curve_provider is not None: raise ValueError('Choose one explicit curve compiler profile')
    if source_material_profile is not None and (type(source_material_profile) is not str or source_material_profile!=SEEDED_DEFAULT_AUTO_PROFILE): raise ValueError('Unsupported explicit source material profile')
    if source_material_profile is not None and (mapped_curve_provider is None or curve_compiler is not None): raise ValueError('Seeded source material requires an explicit mapped provider')
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
    if source_material_profile is not None and (engine!='paintbrush' or depth!=0 or eraser or enabled(params.get('MaskingBrush/Enabled'))):
        raise ValueError('Seeded source material requires a primary plain paintbrush')
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
    source_tip_filename = definition.get('filename','')
    source_static_image = False
    seeded_source=None
    if source_material_profile is not None:
        # Compile original settings BEFORE any fallback asset is allocated. This
        # opt-in never converts a historical bitmap DTO into a procedural one.
        from source_stamp_mapped import compile_mapped_source_stamp, validate_mapped_source_stamp_shape
        seeded_source=retain_source_stamp(params,definition,1,1,xml,depth=depth)
        compiled=compile_mapped_source_stamp(seeded_source,mapped_curve_provider)
        validate_mapped_source_stamp_shape(seeded_source,compiled)
        if compiled['buildId']!=mapped_curve_provider.expected_build_id:
            raise ValueError('Mapped source profile/build binding differs')
        seeded_source['compiled']=compiled
        if not seeded_default_auto_material_domain(seeded_source):
            raise ValueError('Unsupported seeded default-auto source material')
    if kind == 'auto_brush':
        generator = definition.find('MaskGenerator')
        if generator is None:
            raise ValueError('Missing Krita auto-brush generator')
        source_size=numeric(generator.get('diameter'),1)
        shape = generator.get('type', 'circle')
        if shape not in ('circle', 'rect', 'rct'):
            raise ValueError('Unsupported Krita auto-brush shape: '+shape)
        if shape=='rct': shape='rect'
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
            curve=generator.get('softness_curve') or '0,1;1,0'
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
        if seeded_source is None and ((generator.get('id','default') != 'default' and not gaussian and not soft) or numeric(generator.get('spikes'),2) != 2 or numeric(definition.get('randomness')) or numeric(definition.get('density'),1) != 1):
            notes.append(compatibility('autoBrush','Gaussian/curve generator, spikes, randomness and density are not reproduced.','unsupported'))
        default_generator=generator.get('id','default')=='default'
        softness_checked=enabled(params.get('PressureSoftness'))
        constant_softness=(not softness_checked or
            (not enabled(params.get('SoftnessUseCurve','true')) and numeric(params.get('SoftnessValue'),1)==1))
        standard=(default_generator and shape in ('circle','rect') and 2<=numeric(generator.get('spikes'),2)<=64
            and numeric(definition.get('randomness'))==0 and (numeric(definition.get('density'),1)==1 or seeded_source is not None)
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
    elif kind=='kis_text_brush':
        if engine!='paintbrush':raise ValueError('Text SOURCE requires Pixel paintbrush')
        from krita_text import render_text_source
        images,provenance,sequence=render_text_source(definition)
        # All original glyph rasters finish under cumulative bounds BEFORE CAS writes.
        frames=[image_coverage(image,0) for image in images]
        assets=[tip_asset(frame,catalog,warnings) for frame in frames]
        image,mask=images[0],frames[0]
        d['tip']['mask'],d['tip']['maskBounds']=assets[0]
        d['tip']['textRasterization']=provenance
        d['tip']['imageSampling']=integer_image_sampling(image,0,catalog.assets[d['tip']['mask']]['size'],max_side=2048)
        if sequence is not None:
            frame_bounds=[]
            for frame,(aid,_) in zip(frames,assets):
                side=catalog.assets[aid]['size'];width,height=frame.size
                frame_bounds.append({'x':((side-width)//2)/side,'y':((side-height)//2)/side,'width':width/side,'height':height/side})
            d['tip']['animation']={'mode':'text-sequence-v1','frames':[aid for aid,_ in assets],'sequence':sequence,'frameBounds':frame_bounds}
            notes.append(compatibility('textPipe','Original UTF16 sequence selects captured per-glyph rectangles; isolated surrogate units use a captured replacement glyph in this functional raster profile.'))
        source_static_image=True;source_metric=mask.size;source_size=max(mask.size)
        notes.append(compatibility('textRasterization','Actual resolver-selected font bytes/face and functional Pillow mask retained; native Qt/font identity is not claimed.'+(' Requested family was substituted.' if provenance['substituted'] else '')))
    elif kind=='abr_brush':
        if engine!='paintbrush':raise ValueError('Declared ABR SOURCE requires Pixel paintbrush')
        from krita_abr import resolve_abr_tip
        image,proof=resolve_abr_tip(definition,resources)
        # Only original collection/sample decoding can reach this branch;
        # arbitrary PNG bytes under a native ABR sample name are not accepted.
        mask=image_coverage(image,0)
        d['tip']['mask'],d['tip']['maskBounds']=tip_asset(mask,catalog,warnings)
        d['tip']['abrSource']=proof
        d['tip']['imageSampling']=integer_image_sampling(image,0,catalog.assets[d['tip']['mask']]['size'],max_side=2048)
        source_static_image=True;source_metric=mask.size
        source_size=max(mask.size)*numeric(definition.get('scale'),1)
        notes.append(compatibility('abrSource','Original declared ABR collection and native sample selector captured; collection SHA and raw coverage SHA are distinct from Krita PNG-encoded brush MD5.'))
    elif kind in ('gbr_brush', 'png_brush', 'svg_brush'):
        filename = source_tip_filename
        material_gray=[]
        material_color=[]
        material_gradient=False
        if filename.lower().endswith('.gih'):
            pipe=gih(resource(filename),preserve_color=True)
            adjustment_active=any(frame.mode=='RGBA' for frame in pipe['frames'])
            application=brush_application(definition,pipe['frames'])
            if application==0 and adjustment_active:
                pipe['frames']=[adjusted_mask_image(frame,definition) if frame.mode=='RGBA' else frame for frame in pipe['frames']]
            if application==1 and engine=='paintbrush': material_color=[frame.convert('RGBA') for frame in pipe['frames']]
            if application in (2,3) and engine=='paintbrush' and all(frame.mode=='RGBA' for frame in pipe['frames']):
                material_gradient=application==3
                planes=[lightness_planes(frame,definition) for frame in pipe['frames']]
                material_gray=[gray for gray,alpha in planes]
                frames=[alpha for gray,alpha in planes]
            else:
                frames=[frame if frame.mode=='L' else image_coverage(frame,application) for frame in pipe['frames']]
            variable_frames=len({frame.size for frame in frames})!=1
            # Original child grids stay distinct; common parent size is frame0.
            # The GIH parser already bounded all decoded frames before CAS writes.
            assets=[tip_asset(frame,catalog,warnings) for frame in frames]
            mask=frames[0]
            d['tip']['mask'],d['tip']['maskBounds']=assets[0]
            if 1<=len(frames)<=256:
                source_static_image = True
                sampling=integer_image_sampling(frames[0],application,catalog.assets[d['tip']['mask']]['size'])
                if sampling: d['tip']['imageSampling']=sampling
            if len(assets)>1 or pipe['mode']=='native-dimensions-v1':
                d['tip']['animation']={'mode':pipe['mode'],'frames':[asset[0] for asset in assets]}
                if variable_frames:
                    bounds=[]
                    for frame,(aid,_) in zip(frames,assets):
                        side=catalog.assets[aid]['size'];width,height=frame.size
                        bounds.append({'x':((side-width)//2)/side,'y':((side-height)//2)/side,'width':width/side,'height':height/side})
                    d['tip']['animation']['frameBounds']=bounds
                if pipe['mode']=='native-dimensions-v1':
                    d['tip']['animation'].update(declaredCells=pipe['declaredCells'],dimensions=pipe['dimensions'])
            if pipe['declaredCount']!=len(frames):
                notes.append(compatibility('gihFrameCount',f"Header declares {pipe['declaredCount']} frames, but exactly {len(frames)} valid frames end at EOF; retained actual frames as Krita does."))
            notes.append(compatibility('gihSelection','All original pipe dimensions/ranks and actual EOF frames retained; author resolves selection with recorded frame identity, replay does not query sensors or RNG.'))
            if pipe['coloured'] and application!=0 and not material_gray and not material_color:
                notes.append(compatibility('gihColour','RGBA pipe colour is approximated as alpha coverage; coloured stamp pixels are not retained.','unsupported'))
        else:
            payload=resource(filename)
            if kind=='svg_brush' and not isinstance(payload,(VerifiedStockSvgMask,CapturedGeneralSvgMask)):
                payload=CapturedGeneralSvgMask(payload,filename)
            general_svg=kind=='svg_brush' and isinstance(payload,CapturedGeneralSvgMask)
            verified_svg=kind=='svg_brush' and isinstance(payload,(VerifiedStockSvgMask,CapturedGeneralSvgMask))
            if general_svg:d['tip']['svgRasterization']=dict(payload.provenance)
            if kind=='svg_brush' and not verified_svg:
                raise ValueError('SVG requires verified stock raster preparation; general SVG is unsupported')
            image=gbr(payload,preserve_color=True) if filename.lower().endswith('.gbr') else raster(payload,filename)
            source_static_image = kind in ('png_brush','gbr_brush') or verified_svg
            adjustment_active=image.mode=='RGBA' if filename.lower().endswith('.gbr') else has_color(image) or 'A' in image.getbands() or 'transparency' in image.info
            application=brush_application(definition,[image])
            if verified_svg and application!=0:
                raise ValueError('Prepared SVG SOURCE supports native grayscale mask application only')
            if application==0 and adjustment_active:
                image=adjusted_mask_image(image,definition)
            if application==1 and engine=='paintbrush': material_color=[image.convert('RGBA')]
            if application in (2,3) and engine=='paintbrush' and adjustment_active:
                material_gradient=application==3
                gray,mask=lightness_planes(image,definition)
                material_gray=[gray]
            else:
                mask=image if filename.lower().endswith('.gbr') and image.mode=='L' else image_coverage(image,application)
            d['tip']['mask'],d['tip']['maskBounds']=tip_asset(mask,catalog,warnings)
            assets=[(d['tip']['mask'],d['tip']['maskBounds'])]
            if (verified_svg or kind in ('png_brush','gbr_brush') and filename.lower().endswith(('.png','.gbr'))) and not material_gray:
                sampling=integer_image_sampling(image,application,catalog.assets[d['tip']['mask']]['size'],max_side=2048 if verified_svg else 512)
                if sampling:
                    d['tip']['imageSampling']=sampling
                    notes.append(compatibility('integerImagePyramid','Opaque grayscale source grid retained; native integer levels and bounded preparation replace padded trilinear masks. QPainter residual interpolation and transformed edge rounding still require comparison.'))
            if kind=='svg_brush':
                notes.append(compatibility('svgRasterizer','Bounded vector subset rasterized at native1000px width on white using captured sharp/librsvg versions; functional grayscale profile, not Qt pixel identity.' if general_svg else 'Pinned official stock SVG rasterized on white at native1000px using librsvg; Qt SVG edge antialiasing may differ.'))
        # KisScalingSizeBrush::userEffectiveSize is longest native side * scale.
        source_size=max(mask.size)*numeric(definition.get('scale'),1)
        source_metric=mask.size
        d['tip']['aspect']=1/clamp(numeric(definition.get('ratio'),1),0.0625,1)
        if material_gray:
            gray_assets=[tip_asset(gray,catalog,warnings) for gray in material_gray]
            if len(gray_assets)!=len(assets) or any(bounds!=assets[i][1] or catalog.assets[asset]['size']!=catalog.assets[assets[i][0]]['size'] for i,(asset,bounds) in enumerate(gray_assets)):
                raise ValueError('Lightness/alpha selected-frame grid mismatch')
            strength=clamp(numeric(params.get('LightnessStrengthValue'),1)) if enabled(params.get('PressureLightnessStrength')) else 1
            d['tip']['material']=({'kind':'gradient','gray':gray_assets[0][0]} if material_gradient else {'kind':'lightness','gray':gray_assets[0][0],'strength':strength})
            if len(gray_assets)>1: d['tip']['material']['grayFrames']=[asset for asset,bounds in gray_assets]
            if not material_gradient and enabled(params.get('PressureLightnessStrength')) and enabled(params.get('LightnessStrengthUseCurve','true')):
                notes.append(compatibility('lightnessStrength','Active native lightness-strength sensors are not applied; constant strength retained.','unsupported'))
            notes.append(compatibility('gradientMapMaterial' if material_gradient else 'lightnessMaterial','Adjusted original gray and alpha captured; GradientMap requires the selected START tip-gradient after geometry transformation.' if material_gradient else 'Adjusted straight gray and source alpha retained as paired planes; native premultiplied filtering, RGB lightness tone mapping and U8 rounding require renderer comparison.'))
        elif material_color:
            channels=[]
            for frame_index,frame in enumerate(material_color):
                ids=[]
                for channel in frame.convert('RGB').split():
                    aid,bounds=tip_asset(channel,catalog,warnings)
                    if frame_index>=len(assets) or bounds!=assets[frame_index][1] or catalog.assets[aid]['size']!=catalog.assets[assets[frame_index][0]]['size']:raise ValueError('Color/alpha selected-frame grid mismatch')
                    ids.append(aid)
                channels.append(ids)
            d['tip']['material']={'kind':'color','channels':channels[0]}
            if len(channels)>1: d['tip']['material']['frames']=channels
            notes.append(compatibility('colorMaterial','Original straight RGB and alpha retained as paired CAS planes; material renderer must consume color rather than tint an alpha approximation.'))
        elif application!=0:
            application_name={1:'IMAGESTAMP',2:'LIGHTNESSMAP',3:'GRADIENTMAP'}[application]
            notes.append(compatibility('brushApplication',application_name+' resolved from native/legacy flags; its material is unsupported and retains the alpha-mask approximation.','unsupported'))
        elif adjustment_active and (any(numeric(definition.get(key),default)!=default for key,default in [('AdjustmentMidPoint',127),('BrightnessAdjustment',0),('ContrastAdjustment',0)]) or enabled(definition.get('AutoAdjustMidPoint'))):
            notes.append(compatibility('alphaMaskAdjustments','Native midpoint migration and brightness/contrast gray transfer are baked once into alpha coverage before pyramid preparation; source alpha is retained.'))
    else:
        raise ValueError('Unsupported Krita brush definition: '+str(kind))
    d['spacing']=clamp(numeric(definition.get('spacing'),1 if kind=='kis_text_brush' else 0.1),0.000001,2)
    # Native brush angles are counterclockwise: pyramid negates the sum,
    # and auto brushes rotate destination coordinates back into the mask.
    d['tip']['angle']=0 if kind=='kis_text_brush' else math.remainder(-numeric(definition.get('angle')),2*math.pi)
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
    modes={'normal':'normal','multiply':'multiply','screen':'screen','overlay':'overlay','darken':'darken','lighten':'lighten','burn':'colorBurn','dodge':'colorDodge','linear_burn':'linearBurn','linear_dodge':'add','add':'add','subtract':'subtract','diff':'difference','exclusion':'exclusion','soft_light':'softLight','soft_light_svg':'softLightSvg','hard_light':'hardLight','divide':'divide','hue':'hue','saturation':'saturation','color':'color','luminosity':'luminosity','luminize':'luminosity','equivalence':'equivalence','additive_subtractive':'additiveSubtractive','arc_tangent':'arcTangent','negation':'negation','inverse_subtract':'inverseSubtract','grain_merge':'grainMerge','grain_extract':'grainExtract','allanon':'allanon','geometric_mean':'geometricMean','parallel':'parallel','reflect':'reflect','glow':'glow','freeze':'freeze','heat':'heat','glow_heat':'glowHeat','heat_glow':'heatGlow','reflect_freeze':'reflectFreeze','freeze_reflect':'freezeReflect','heat_glow_freeze_reflect_hybrid':'heatGlowFreezeReflectHybrid','hard_mix_softer_photoshop':'hardMixSofterPhotoshop','penumbra a':'penumbraA','penumbra b':'penumbraB','penumbra c':'penumbraC','penumbra d':'penumbraD','flat_light':'flatLight','xor':'binaryXor','or':'binaryOr','and':'binaryAnd','nand':'binaryNand','nor':'binaryNor','xnor':'binaryXnor','implication':'binaryImplication','not_implication':'binaryNotImplication','converse':'binaryConverse','not_converse':'binaryNotConverse','tint':'tint','inc_saturation':'increaseSaturation','dec_saturation':'decreaseSaturation','inc_luminosity':'increaseLuminosity','dec_luminosity':'decreaseLuminosity','color_hsl':'colorHsl','hue_hsl':'hueHsl','saturation_hsl':'saturationHsl','inc_saturation_hsl':'increaseSaturationHsl','dec_saturation_hsl':'decreaseSaturationHsl','lightness':'lightnessHsl','inc_lightness':'increaseLightnessHsl','dec_lightness':'decreaseLightnessHsl','color_hsv':'colorHsv','hue_hsv':'hueHsv','saturation_hsv':'saturationHsv','inc_saturation_hsv':'increaseSaturationHsv','dec_saturation_hsv':'decreaseSaturationHsv','value':'valueHsv','inc_value':'increaseValueHsv','dec_value':'decreaseValueHsv','color_hsi':'colorHsi','hue_hsi':'hueHsi','saturation_hsi':'saturationHsi','inc_saturation_hsi':'increaseSaturationHsi','dec_saturation_hsi':'decreaseSaturationHsi','intensity':'intensityHsi','inc_intensity':'increaseIntensityHsi','dec_intensity':'decreaseIntensityHsi','gamma_dark':'gammaDark','gamma_light':'gammaLight','gamma_illumination':'gammaIllumination','easy dodge':'easyDodge','easy burn':'easyBurn','pnorm_a':'pNormA','pnorm_b':'pNormB','super_light':'superLight','soft_light_ifs_illusions':'softLightIfs','soft_light_pegtop_delphi':'softLightPegtop','tint_ifs_illusions':'tintIfs','shade_ifs_illusions':'shadeIfs','fog_lighten_ifs_illusions':'fogLightenIfs','fog_darken_ifs_illusions':'fogDarkenIfs','modulo':'modulo','modulo_continuous':'moduloContinuous','divisive_modulo':'divisiveModulo','divisive_modulo_continuous':'divisiveModuloContinuous','modulo_shift':'moduloShift','modulo_shift_continuous':'moduloShiftContinuous','hard overlay':'hardOverlay','interpolation':'interpolation','interpolation 2x':'interpolation2x','lambert_lighting':'lambertLighting','lambert_lighting_gamma2.2':'lambertLightingGamma22','combine_normal':'combineNormal','tangent_normalmap':'tangentNormalmap','copy_red':'copyRed','copy_green':'copyGreen','copy_blue':'copyBlue','behind':'behind','luminosity_sai':'luminositySai','greater':'greater','copy':'copy','destination-in':'destinationIn','destination-atop':'destinationAtop','alphadarken':'rawAlphaDarken','marker':'marker','dissolve':'dissolve','linear light':'linearLight','vivid_light':'vividLight','pin_light':'pinLight','hard mix':'hardMix','hard_mix_photoshop':'hardMixPhotoshop','darker color':'darkerColor','lighter color':'lighterColor'}
    if eraser: behavior['erase']=True
    mode='normal' if eraser else params.get('CompositeOp','normal')
    if mode in modes:
        behavior['rendering']['blendMode']=modes[mode]
        if mode in ('copy','destination-in','destination-atop','alphadarken','marker','dissolve'):
            notes.append(compatibility('finalCompositeFunctional','defined-final-rgba-u8-v1: native RGBA operation order and full-DAB destructive domain retained; Dissolve uses canonical world-coordinate avalanche hash, not native global entropy or portable native ISA identity.','approximate'))
        if mode in ('copy_red', 'copy_green', 'copy_blue', 'behind', 'luminosity_sai', 'greater'):
            notes.append(compatibility('customCompositeFunctional','defined-custom-rgba-u8-v1: native RGBA shell order retained; Greater uses explicit Q65535 logistic-weight table, not portable native float/ICC/ISA identity.','approximate'))
        if mode in ('lambert_lighting','lambert_lighting_gamma2.2','combine_normal','tangent_normalmap'):
            notes.append(compatibility('normalCompositeFunctional','defined-q65535-normal-lighting-v1: staged Q65535 vector math and bounded exact integer normalization; functional RGB/U8, not native float/ICC/ISA byte identity.','approximate'))
        if mode in ('pnorm_b', 'tint_ifs_illusions', 'interpolation', 'interpolation 2x'):
            notes.append(compatibility('scalarRootCosFunctional','defined-scalar23-root-cos-q65535-v1: exact integer fourth-root and staged Q65535 sqrt/cos byte graph; preserves inner interpolation byte, functional RGB/U8, not native libm/Float32-LUT/ICC/ISA byte identity.','approximate'))
        if mode in ('modulo', 'modulo_continuous', 'divisive_modulo', 'divisive_modulo_continuous', 'modulo_shift', 'modulo_shift_continuous'):
            notes.append(compatibility('moduloCompositeFunctional','defined-rational-u8-modulo-v1: modulo D%(S+1) matches the native U8 integer graph; the five real-epsilon modes use explicit rational endpoint/parity rules, not native double-epsilon/Float32-LUT/ISA byte identity.','approximate'))
        if mode in ('xor', 'or', 'and', 'nand', 'nor', 'xnor', 'implication', 'not_implication', 'converse', 'not_converse'):
            notes.append(compatibility('binaryCompositeFunctional','defined-uint32-wrap-u8-v1: explicit functional byte-bitwise interpretation; pinned native integer expression has signed-overflow ambiguity. Portable native compiler/ISA pixel identity is not claimed.','approximate'))
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
                behavior.setdefault('colorAdjustment',{'model':'hsvChromaRgba8'})[target]=controls[0]
                color_decoded.append('Pressure'+option)
                notes.append(compatibility('hsvAdjustment.'+option,'Per-dab signed HSV adjustment retained for single pressure/random sensor and unit strength; native HSV/chroma RGBA8 quantization precedes blending; sensor evaluation and vendor random sequence remain approximate.'))
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
        texture_modes={0:'multiply',1:'subtract',2:'lightness',3:'gradient',4:'darken',5:'overlay',6:'colorDodge',7:'colorBurn',8:'add',9:'linearBurn',10:'hardMix',11:'hardMixSofter',12:'height',13:'linearHeight',14:'heightPhotoshop',15:'linearHeightPhotoshop'}
        if texture_mode in texture_modes:
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
            texture_input=mask
            adjustment=dict(
                brightness=numeric(params.get(prefix+'Brightness'),0),
                contrast=numeric(params.get(prefix+'Contrast'),1),
                neutral_point=numeric(params.get(prefix+'NeutralPoint'),.5),
                invert=enabled(params.get(prefix+'Invert')),
                cutoff_policy=int(numeric(params.get(prefix+'CutoffPolicy'),0)),
                cutoff_left=int(numeric(params.get(prefix+'CutoffLeft'),0)),
                cutoff_right=int(numeric(params.get(prefix+'CutoffRight'),255)),
                preserve_alpha=texture_mode in (2,3))
            mask=preprocess_texture(texture_input,**adjustment)
            width,height=mask.size
            pot=max(2,1<<(max(width,height)-1).bit_length())
            def retain_texture_variant(prepared):
                if prepared.size!=(width,height): raise ValueError('Texture variant grid differs')
                if texture_mode in (2,3):
                    gray=prepared.getchannel('R') if prepared.mode=='RGBA' else prepared.convert('L')
                    # L output here means an originally opaque source, not a
                    # missing pattern/alpha resource substituted at runtime.
                    alpha=prepared.getchannel('A') if prepared.mode=='RGBA' else Image.new('L',prepared.size,255)
                    padded=Image.new('L',(pot,pot));padded.paste(gray,(0,0))
                    alpha_padded=Image.new('L',(pot,pot));alpha_padded.paste(alpha,(0,0))
                    asset_id=catalog.asset(padded,warnings,grain=True)
                    alpha_id=catalog.asset(alpha_padded,warnings,grain=True)
                    return asset_id,{'gray':asset_id,'alpha':alpha_id}
                padded=Image.new('L',(pot,pot));padded.paste(prepared,(0,0))
                return catalog.asset(padded,warnings,grain=True),None
            aid,color_source=retain_texture_variant(mask)
            erase_variant=None
            if enabled(params.get(prefix+'AutoInvertOnErase')):
                # XOR inversion must precede neutral-point/cutoff mapping.
                # Reprocessing the SAME resized original is not255-finalGray.
                erased=preprocess_texture(texture_input,**{**adjustment,'invert':not adjustment['invert']})
                erase_id,erase_color=retain_texture_variant(erased)
                erase_variant={'id':erase_id}
                if erase_color is not None: erase_variant['colorSource']=erase_color
            offset={axis:clamp(numeric(params.get(prefix+'Offset'+axis.upper()),0),-8192,8192) for axis in ('x','y')}
            offset.update(randomX=enabled(params.get(prefix+'isRandomOffsetX')),randomY=enabled(params.get(prefix+'isRandomOffsetY')))
            d['texture']={'id':aid,'strength':texture_strength,
                          'periodPx':native_width,'patternSize':{'width':width,'height':height},
                          'application':{'mode':texture_modes[texture_mode],'soft':enabled(params.get(prefix+'UseSoftTexturing'))},'offset':offset}
            if color_source is not None: d['texture']['colorSource']=color_source
            if erase_variant is not None: d['texture']['eraseVariant']=erase_variant
            if any(abs(numeric(params.get(prefix+'Offset'+axis),0))>8192 for axis in ('X','Y')):
                notes.append(compatibility('textureOffset','Native offset exceeds bounded8192 and was clamped.','unsupported'))
            if offset['randomX'] or offset['randomY']:
                notes.append(compatibility('textureRandomOffset','Per-stroke pattern phase uses deterministic Grafetto RNG rather than Krita RNG.'))
            if enabled(params.get(prefix+'AutoInvertOnErase')):
                notes.append(compatibility('textureEraseInvert','Both original and XOR-inverted-before-neutral/cutoff variants retained; named Pixel source selects the captured effective composition. UI eraser override is separate.'))
            controls=sensor_controls(params,'Texture/Strength/',notes,allow_time=timed_input) if texture_strength_enabled else []
            if controls: behavior.setdefault('modulations',{})['grainDepth']=controls
            notes.append(compatibility('texture','Native adjusted-gray and preserved-alpha planes retained for color texture; selected gradient is captured by the application at stroke START.' if color_source is not None else 'Native alpha-operation parameters and grid retained; GPU filtering/byte quantization require native comparison.'))
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
        # legacy ALPHAMASK strategy. New/lightness/stamp/overlay stay fallback.
        previous_canvas=(not enabled(params.get('SmudgeRateUseNewEngine','false'))
                         and numeric(params.get('SmudgeRateMode'),0) in (0,1)
                         and application==0 and not enabled(params.get('MergedPaint','false'))
                         and params.get('CompositeOp','normal')=='normal')
        if previous_canvas:
            d['mixer'].update(source='previousCanvas',load=0,initialLoad=0)
            # Native has no FlowOption in Color Smudge. Opacity is already in
            # dab.opacity, and is used in two distinct native composition stages.
            d['flow']=1;d['flowByPressure']=[[0,1],[1,1]]
            behavior.get('modulations',{}).pop('flow',None)
            if color_rate>0:
                foreground={'rate':clamp(max(1-raw_smudge_rate,.2)*color_rate)}
                controls=size_like_controls(params,'ColorRate',notes,allow_time=timed_input)
                if controls: foreground['dynamics']=controls
                d['mixer']['foreground']=foreground
            if numeric(params.get('SmudgeRateMode'),0)==1:
                radius=numeric(params.get('SmudgeRadiusValue'),3)
                if numeric(params.get('SmudgeRadiusVersion'),1)<2: radius/=100
                radius=clamp(radius,0,3) if enabled(params.get('PressureSmudgeRadius')) else 0
                d['mixer']['sampling']={'mode':'uniformMean','radius':radius}
                if enabled(params.get('PressureSmudgeRadius')):
                    controls=size_like_controls(params,'SmudgeRadius',notes,allow_time=timed_input)
                    if controls: d['mixer']['sampling']['radiusDynamics']=controls
                notes.append(compatibility('colorSmudge','Legacy normal ALPHAMASK dulling uses previous-canvas uniform mean and optional foreground: fixed64 Halton samples, bounded512px gather and premultiplied RGBA8 differ from native adaptive/colorspace rounding.'))
            else:
                notes.append(compatibility('colorSmudge','Legacy normal ALPHAMASK smearing samples previous canvas with optional foreground; native mask/byte quantization require calibration.'))
        else:
            notes.append(compatibility('colorSmudge','Unsupported native new-engine, non-ALPHAMASK, overlay, non-normal or unknown-mode strategy; carried-pigment approximation retained.','unsupported'))
        if enabled(params.get('PressureSmudgeRate')):
            controls=size_like_controls(params,'SmudgeRate',notes,allow_time=timed_input)
            if controls:
                d['mixer']['pickupDynamics']=controls
                notes.append(compatibility('SmudgeRateCurve','Native smudge-rate natural-cubic response compiled to256-sample transfer; sensor normalization remains subject to calibration.'))
    active=[k for k in params if k.startswith('Pressure') and enabled(params[k]) and k not in ('PressureSize','PressureOpacity','PressureFlow','PressureScatter','PressureSmudgeRate') and not (k=='PressureSmudgeRadius' and 'sampling' in d.get('mixer',{})) and not (k=='PressureColorRate' and d.get('mixer',{}).get('source')=='previousCanvas') and not (k=='PressureTexture/Strength/' and (d.get('texture',{}).get('application') or seeded_source is not None and not enabled(params.get('Texture/Pattern/Enabled')))) and not (k=='PressureSpacing' and 'spacing' in behavior) and not (k=='PressureRotation' and rotation_decoded) and not (k=='PressureRatio' and ratio_decoded) and not (k=='PressureSharpness' and d['tip'].get('alphaThreshold')) and k not in color_decoded and not (k=='PressureLightnessStrength' and d['tip'].get('material'))]
    if seeded_source is not None and enabled(params.get('PressureTexture/Strength/')):
        notes.append(compatibility('inactiveTextureStrength','Pattern is disabled in original settings; texture strength is not evaluated.'))
    if active:
        notes.append(compatibility('activeDynamics',', '.join(sorted(active)),'unsupported'))
    if enabled(params.get('MaskingBrush/Enabled')):
        child_root=ET.Element('Preset',{'paintopid':'paintbrush','name':'Masking component'})
        prefix='MaskingBrush/Preset/'
        for key,value in params.items():
            if key.startswith(prefix): ET.SubElement(child_root,'param',{'name':key[len(prefix):]}).text=value
        child_png=io.BytesIO();meta=PngImagePlugin.PngInfo();meta.add_text('version','5.0');meta.add_text('preset',ET.tostring(child_root,encoding='unicode'),zip=True)
        Image.new('L',(1,1)).save(child_png,format='PNG',pnginfo=meta)
        child_result=preset(child_png.getvalue(),name,catalog,resources,depth+1,stroke_input=False,timed_input=timed_input,curve_compiler=curve_compiler,mapped_curve_provider=mapped_curve_provider)
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
    # Capability comes from the decoded tip branch, never the later texture filename.
    if seeded_source is not None:
        d['sourceStamp']=seeded_source
        behavior=d.get('behavior',{})
        rendering=behavior.get('rendering',{})
        source=seeded_source['source'];tip=d['tip'];profile=tip.get('profile',{})
        if (tip.get('kind')!='procedural' or profile.get('kind')!='standard'
                or profile.get('shape')!=('ellipse' if source['shape']=='circle' else 'rectangle')
                or profile.get('horizontalFade')!=source['horizontalFade']
                or profile.get('verticalFade')!=source['verticalFade']
                or profile.get('antialias')!=source['antialias']
                or tip.get('aspect')!=1/source['ratio'] or source_size!=source['diameter']):
            raise ValueError('Inconsistent seeded default-auto material lowering')
        if (d.get('model')!='stamp' or 'dual' in behavior or 'colorAdjustment' in behavior
                or 'texture' in d or eraser or rendering.get('blendMode')!='normal'
                or rendering.get('wetEdges',0)!=0 or rendering.get('burntEdges',0)!=0
                or any(n['status']=='unsupported' for n in notes)
                or not seeded_default_auto_material_domain(seeded_source)):
            raise ValueError('Unsupported seeded default-auto descriptor consumer')
        notes.append(compatibility('seededDensity','Explicit deterministic per-dab density behavior; native random-stream identity is not claimed.'))
    elif engine=='paintbrush' and (source_static_image or kind=='auto_brush' and definition.find('MaskGenerator') is not None and definition.find('MaskGenerator').get('id','default') in ('default','gauss','soft')):
        try:
            d['sourceStamp']=retain_source_stamp(params,definition,*(source_metric or (1,1)),xml,depth=depth)
            if mapped_curve_provider is not None:
                from source_stamp_mapped import compile_mapped_source_stamp, validate_mapped_source_stamp_shape
                try:
                    # A partial/invalid result never becomes a published dictionary.
                    # Fresh Pixel DATA uses the common sensor/radial dictionary2.
                    # Historical dictionaries3/4 are still verified/replayed as
                    # recorded; only the explicit legacy native-default import
                    # option may create dictionary4. No old coefficients mutate.
                    compiled=(compile_mapped_source_stamp(d['sourceStamp'],mapped_curve_provider,native_default_texture=True) if native_default_texture and _texture_native_default_data_candidate(d) else compile_mapped_source_stamp(d['sourceStamp'],mapped_curve_provider))
                    validate_mapped_source_stamp_shape(d['sourceStamp'],compiled)
                    if compiled['buildId']!=mapped_curve_provider.expected_build_id:
                        raise ValueError('Mapped source profile/build binding differs')
                    d['sourceStamp']['compiled']=compiled
                    if _new_mapped_soft_material_supported(d,engine,depth):
                        d['sourceStamp']['unsupported']=[reason for reason in d['sourceStamp']['unsupported']
                                                       if reason!='soft-auto-raster-author-unavailable']
                except ValueError as error: notes.append(compatibility('sourceStampCompiler',str(error),'unsupported'))
            elif curve_compiler is not None:
                try: d['sourceStamp']['compiled']=compile_source_stamp(d['sourceStamp'],curve_compiler)
                except ValueError as error: notes.append(compatibility('sourceStampCompiler',str(error),'unsupported'))
            elif required_source_curves(d['sourceStamp']):
                notes.append(compatibility('sourceStampCompiler','Native nonlinear source curves retained; explicit compiler is not configured, native author candidate unavailable.','unsupported'))
        except (ValueError,OverflowError) as error:
            notes.append(compatibility('sourceStampData',str(error),'unsupported'))
    if engine=='paintbrush' and kind=='auto_brush' and 'sourceStamp' not in d:
        notes.append(compatibility('sourceStampData','Native auto source generator/data unsupported; no image source identity or author capability was created.','unsupported'))
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
        if isinstance(value,dict):return value.get('control')=='time' or 'timing'in value or any(source_clock(v)for k,v in value.items() if k!='sourceStamp')
        return isinstance(value,list) and any(source_clock(v)for v in value)
    if source_clock(behavior):d['version']=35
    def native_color(b):
        if not b:return False
        return b.get('colorAdjustment',{}).get('model')=='hsvChromaRgba8' or native_color(b.get('dual',{}).get('brush',{}).get('behavior',{}))
    if native_color(behavior):d['version']=36
    # New immutable descriptor revision only for successful material-option DATA.
    if d.get('sourceStamp',{}).get('compiled',{}).get('version')==3:d['version']=37
    # Only new raw composites or an affected child get immutable revision38.
    # Existing stock revisions27..37 remain unchanged.
    if engine=='paintbrush' and ((not eraser and params.get('CompositeOp') in ('equivalence', 'additive_subtractive', 'arc_tangent', 'negation', 'inverse_subtract', 'grain_merge', 'grain_extract', 'allanon', 'geometric_mean', 'parallel', 'luminize')) or behavior.get('dual',{}).get('brush',{}).get('version')==38):d['version']=38
    # New Quadratic source identities are revision39; old unaffected rows keep their revision.
    if engine=='paintbrush' and ((not eraser and params.get('CompositeOp') in ('reflect', 'glow', 'freeze', 'heat', 'glow_heat', 'heat_glow', 'reflect_freeze', 'freeze_reflect', 'heat_glow_freeze_reflect_hybrid')) or behavior.get('dual',{}).get('brush',{}).get('version')==39):d['version']=39
    # Selective immutable revision40 for exact native Penumbra/mix registrations only.
    if engine=='paintbrush' and ((not eraser and params.get('CompositeOp') in ('hard_mix_softer_photoshop', 'penumbra a', 'penumbra b', 'penumbra c', 'penumbra d', 'flat_light')) or behavior.get('dual',{}).get('brush',{}).get('version')==40):d['version']=40
    # Immutable defined-wrapping functional Binary10 identity, not native overflow behavior.
    if engine=='paintbrush' and ((not eraser and params.get('CompositeOp') in ('xor', 'or', 'and', 'nand', 'nor', 'xnor', 'implication', 'not_implication', 'converse', 'not_converse')) or behavior.get('dual',{}).get('brush',{}).get('version')==41):d['version']=41
    # New HSY vector family identities use selective immutable revision42.
    if engine=='paintbrush' and ((not eraser and params.get('CompositeOp') in ('tint', 'inc_saturation', 'dec_saturation', 'inc_luminosity', 'dec_luminosity', 'color_hsl', 'hue_hsl', 'saturation_hsl', 'inc_saturation_hsl', 'dec_saturation_hsl', 'lightness', 'inc_lightness', 'dec_lightness', 'color_hsv', 'hue_hsv', 'saturation_hsv', 'inc_saturation_hsv', 'dec_saturation_hsv', 'value', 'inc_value', 'dec_value', 'color_hsi', 'hue_hsi', 'saturation_hsi', 'inc_saturation_hsi', 'dec_saturation_hsi', 'intensity', 'inc_intensity', 'dec_intensity')) or behavior.get('dual',{}).get('brush',{}).get('version')==42):d['version']=42
    # Selective scalar23 browser-functional identities, including defined rational modulo.
    if engine=='paintbrush' and ((not eraser and params.get('CompositeOp') in ('gamma_dark', 'gamma_light', 'gamma_illumination', 'easy dodge', 'easy burn', 'pnorm_a', 'pnorm_b', 'super_light', 'soft_light_ifs_illusions', 'soft_light_pegtop_delphi', 'tint_ifs_illusions', 'shade_ifs_illusions', 'fog_lighten_ifs_illusions', 'fog_darken_ifs_illusions', 'modulo', 'modulo_continuous', 'divisive_modulo', 'divisive_modulo_continuous', 'modulo_shift', 'modulo_shift_continuous', 'hard overlay', 'interpolation', 'interpolation 2x')) or behavior.get('dual',{}).get('brush',{}).get('version')==43):d['version']=43
    # Selective functional Q65535 normal/lighting graph, original inputs remain captured.
    if engine=='paintbrush' and ((not eraser and params.get('CompositeOp') in ('lambert_lighting', 'lambert_lighting_gamma2.2', 'combine_normal', 'tangent_normalmap')) or behavior.get('dual',{}).get('brush',{}).get('version')==44):d['version']=44
    # Selective nondestructive RGBA shells; never scalar CF aliases.
    if engine=='paintbrush' and ((not eraser and params.get('CompositeOp') in ('copy_red', 'copy_green', 'copy_blue', 'behind', 'luminosity_sai', 'greater')) or behavior.get('dual',{}).get('brush',{}).get('version')==45):d['version']=45
    # Selective final RGBA shell identity, propagated from an affected original child.
    if engine=='paintbrush' and ((not eraser and params.get('CompositeOp') in ('copy','destination-in','destination-atop','alphadarken','marker','dissolve')) or behavior.get('dual',{}).get('brush',{}).get('version')==46):d['version']=46
    if seeded_source is not None and any(n['status']=='unsupported' for n in notes):
        raise ValueError('Unsupported seeded default-auto final lowering')
    result={'descriptor':finalize_identity(d,data),'name':root.get('name') or PurePosixPath(name).stem,'source':PurePosixPath(name).name,'warnings':warnings,'compatibility':notes}
    if source_size is not None:
        result['sourceDefaults']={'sizePx':clamp(source_size,.01,10000),'opacity':d['opacity'],'flow':d['flow']}
    return result


def retain_declared_patterns(archive,names,catalog):
    """Only manifest-declared original PAT resources, never arbitrary PNG/tips.

    Pinned KoResourceBundleManifest and KoXmlNS use the ODF manifest namespace.
    The four stored L8 planes preserve straight original RGBA independently.
    """
    manifest='META-INF/manifest.xml'
    if manifest not in names: return
    namespace='{urn:oasis:names:tc:opendocument:xmlns:manifest:1.0}'
    if archive.getinfo(manifest).file_size>MAX_XML:raise ValueError('Krita resource manifest exceeds XML limit')
    raw_manifest=archive.read(manifest)
    if len(raw_manifest)>MAX_XML:raise ValueError('Krita resource manifest exceeds XML limit')
    document=xml(raw_manifest.decode('utf-8',errors='strict'))
    if document.tag!=namespace+'manifest': raise ValueError('Invalid Krita resource manifest namespace')
    declared=[];seen=set()
    for entry in document:
        if entry.tag!=namespace+'file-entry' or entry.get(namespace+'media-type')!='patterns': continue
        name=entry.get(namespace+'full-path')
        if not isinstance(name,str) or not name.startswith('patterns/') or not name.lower().endswith('.pat'): continue
        if name not in names or name in seen: raise ValueError('Missing or duplicate declared Krita pattern')
        digest=entry.get(namespace+'md5sum')
        if not isinstance(digest,str) or not re.fullmatch(r'[a-fA-F0-9]{32}',digest): raise ValueError('Invalid declared Krita pattern checksum')
        seen.add(name);declared.append((name,digest.lower()))
    if len(declared)>128: raise ValueError('Declared Krita pattern count exceeds128')
    existing={p['id']:p for p in catalog.patterns}
    for name,expected_md5 in declared:
        try:
            payload=archive.read(name)
            if hashlib.md5(payload).hexdigest()!=expected_md5: raise ValueError('Declared Krita pattern checksum differs')
            original=raster(payload,name)
            if original.width>2048 or original.height>2048 or original.width*original.height>1048576: raise ValueError('Original pattern exceeds bounded2048/1M domain')
            width,height=original.size;size=max(2,1<<(max(width,height)-1).bit_length())
            rgba=original.convert('RGBA')
            planes=[];pending={}
            for channel in ('R','G','B','A'):
                plane=Image.new('L',(size,size));plane.paste(rgba.getchannel(channel),(0,0))
                raw=plane.tobytes();digest=hashlib.sha256(raw).hexdigest();aid='asset:'+digest
                planes.append((aid,plane));pending[aid]=size*size
            additional=sum(length for aid,length in pending.items() if aid not in catalog.assets)
            if sum(a['size']**2 for a in catalog.assets.values())+additional>256*1024*1024: raise ValueError('Catalog patterns exceed existing256MiB asset budget')
            resource={'kind':'source-pattern-rgba8-v1','channels':[p[0] for p in planes[:3]],'alphaAsset':planes[3][0],
                      'size':size,'x':0,'y':0,'width':width,'height':height,'periodX':width,'periodY':height}
            pattern_id='pattern:'+hashlib.sha256(json.dumps(resource,sort_keys=True,separators=(',',':')).encode('utf-8')).hexdigest()
            if pattern_id in existing: continue
            if len(existing)>=128: raise ValueError('Catalog pattern count exceeds128')
            # L/POT input makes Catalog.asset an identity CAS writer: no RGB
            # luminance conversion, alpha multiplication, resizing or inversion.
            for aid,plane in planes:
                if aid not in catalog.assets and catalog.asset(plane,[],grain=True)!=aid: raise ValueError('Original pattern plane changed during CAS storage')
            label=''.join(c for c in PurePosixPath(name).stem if ord(c)>=32 and ord(c)!=127)
            label=label.encode('utf-16-le')[:256].decode('utf-16-le',errors='ignore') or 'Pattern'
            entry={'id':pattern_id,'name':label,'resource':resource}
            existing[pattern_id]=entry;catalog.patterns.append(entry)
        except (ValueError,OSError) as error:
            catalog.skipped.append({'name':PurePosixPath(name).stem[:128],'reasons':['Pattern: '+str(error)]})


def convert_krita(path, catalog, external=None, *, sequential_xy=False, stroke_input=False, timed_input=False, curve_compiler=None, mapped_curve_provider=None, source_material_profile=None, native_default_texture=False):
    if type(native_default_texture) is not bool or native_default_texture and mapped_curve_provider is None: raise ValueError('Native default texture requires explicit mapped provider')
    if curve_compiler is not None and mapped_curve_provider is not None: raise ValueError('Choose one explicit curve compiler profile')
    if source_material_profile is not None and (type(source_material_profile) is not str or source_material_profile!=SEEDED_DEFAULT_AUTO_PROFILE): raise ValueError('Unsupported explicit source material profile')
    if source_material_profile is not None and (mapped_curve_provider is None or curve_compiler is not None): raise ValueError('Seeded source material requires an explicit mapped provider')
    if type(sequential_xy) is not bool: raise ValueError('Sequential XY opt-in must be an explicit boolean')
    if type(stroke_input) is not bool: raise ValueError('Stroke input opt-in must be an explicit boolean')
    if type(timed_input) is not bool: raise ValueError('Timed input opt-in must be an explicit boolean')
    if path.suffix.lower() == '.kpp':
        try:
            catalog.brushes.append(preset(path.read_bytes(), path.name, catalog, external or {}, sequential_xy=sequential_xy,stroke_input=stroke_input,timed_input=timed_input,curve_compiler=curve_compiler,mapped_curve_provider=mapped_curve_provider,source_material_profile=source_material_profile,native_default_texture=native_default_texture))
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
        retain_declared_patterns(archive,names,catalog)
        resources=dict(external or {})
        resources.update({n:(lambda entry=n: archive.read(entry)) for n in names if n.lower().endswith(('.gbr','.gih','.png','.pat','.jpg','.jpeg','.webp'))})
        for name in sorted(n for n in names if n.lower().endswith('.kpp')):
            try:
                catalog.brushes.append(preset(archive.read(name),name,catalog,resources, sequential_xy=sequential_xy,stroke_input=stroke_input,timed_input=timed_input,curve_compiler=curve_compiler,mapped_curve_provider=mapped_curve_provider,source_material_profile=source_material_profile,native_default_texture=native_default_texture))
            except (ValueError, ET.ParseError, OSError) as error:
                catalog.skipped.append({'name':PurePosixPath(name).stem,'reasons':[str(error)]})
