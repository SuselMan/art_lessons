from legacy_color_smudge_dodge_burn176 import legacy_color_smudge_dodge_burn176_scope, validate_legacy_color_smudge_dodge_burn176
from legacy_color_smudge_arithmetic175 import legacy_color_smudge_arithmetic175_scope, validate_legacy_color_smudge_arithmetic175
from legacy_color_smudge_minmax172 import legacy_color_smudge_minmax172_scope, validate_legacy_color_smudge_minmax172
#!/usr/bin/env python3
"""Offline, bounded brush archive reader. Pillow is used only for raster conversion."""
from legacy_color_smudge_overlay154 import legacy_color_smudge_overlay154_scope, validate_legacy_color_smudge_overlay154
from clone_healing152 import validate_clone_healing152
from pixel_original_dual151 import pixel_original_dual151_scope, validate_pixel_original_dual151
from pixel_original_hsv150 import pixel_original_hsv150_scope, validate_pixel_original_hsv150
from pixel_gradient_wash138 import pixel_gradient_wash138_scope
from smudge_texture_erase131 import smudge_texture_erase131_scope
from legacy_smudge_timing import legacy_smudge_timing_scope
from deform_timer160 import deform_timer160_scope
from variable_gih import validate_variable_gih_descriptor,is_sensor_original_rgba119,is_sensor_original_rgba121,is_equal_lightness_gih123,is_equal_gradient_gih125,is_unequal_gradient_gih126,is_unequal_lightness_gih124
from gih_dimensions import validate_dimensions
import argparse
import base64
import hashlib
import io
import json
import math
from pathlib import Path
import plistlib
import re
import struct
import zipfile
from sequential_xy import validate_policy as validate_sequential_xy_policy
from stroke_input import validate_policy as validate_stroke_input_policy,independent_drawing_angle_pair,validate_independent_pair_assets
from PIL import Image, ImageOps
from brush_contract import Catalog, MAX_PIXELS, IMPORTER_SCHEMA_VERSION, IMPORTER_RENDERING_VERSION, number, clamp, descriptor, finalize_identity, compatibility


class Reader:
    def __init__(self, data): self.data, self.pos = data, 0
    def take(self, n):
        if n < 0 or self.pos + n > len(self.data): raise ValueError('Truncated binary record')
        out = self.data[self.pos:self.pos+n]; self.pos += n; return out
    def num(self, fmt): return struct.unpack('>'+fmt, self.take(struct.calcsize(fmt)))[0]
    def u32(self): return self.num('I')
    def text(self): return self.take(self.u32()*2).decode('utf-16-be').rstrip('\0')
    def key(self):
        n = self.u32(); return self.take(n or 4).decode('ascii')
    def descriptor(self):
        name, cls = self.text(), self.key()
        count = self.u32()
        if count > 10000: raise ValueError('Descriptor item limit')
        result = {'_class': cls, '_name': name}
        for _ in range(count):
            key = self.key(); result[key] = self.value(self.take(4))
        return result
    def value(self, kind):
        if kind in (b'Objc', b'GlbO'): return self.descriptor()
        if kind == b'VlLs':
            count = self.u32()
            if count > 10000: raise ValueError('Descriptor list limit')
            return [self.value(self.take(4)) for _ in range(count)]
        if kind == b'TEXT': return self.text()
        if kind == b'long': return self.num('i')
        if kind == b'bool': return bool(self.num('B'))
        if kind == b'doub': return self.num('d')
        if kind == b'UntF': return {'unit': self.take(4).decode('ascii'), 'value': self.num('d')}
        if kind == b'enum': return {'enum': self.key(), 'value': self.key()}
        if kind in (b'type', b'GlbC'): return {'name': self.text(), 'class': self.key()}
        if kind in (b'tdta', b'alis'): return self.take(self.u32()).hex()
        raise ValueError('Unsupported descriptor type '+repr(kind))


def packbits(data, expected):
    r, out = Reader(data), bytearray()
    while r.pos < len(data):
        n = r.num('b')
        if n >= 0: out.extend(r.take(n+1))
        elif n != -128: out.extend(r.take(1) * (1-n))
        if len(out) > expected: raise ValueError('RLE row exceeds width')
    if len(out) != expected: raise ValueError('RLE row width mismatch')
    return bytes(out)


def read_pixels(r, width, height, depth, compression):
    if not (0 < width <= 10000 and 0 < height <= 10000 and width*height <= MAX_PIXELS):
        raise ValueError('Image dimensions exceed limit')
    if depth not in (8,16): raise ValueError('Only 8/16-bit sampled ABR is supported')
    stride = width * (depth//8)
    if compression == 0:
        raw = r.take(stride*height)
        return raw if depth == 8 else raw[::2]
    if compression != 1: raise ValueError('Unsupported ABR compression')
    sizes = [r.num('H') for _ in range(height)]
    raw = b''.join(packbits(r.take(n), stride) for n in sizes)
    return raw if depth == 8 else raw[::2]


def abr_sample(data, minor):
    r = Reader(data); key = r.take(r.num('B')).decode('ascii')
    if minor == 1:
        r.take(10); bounds = [r.num('i') for _ in range(4)]
        depth, compression = r.num('H'), r.num('B')
        w,h = bounds[3]-bounds[1],bounds[2]-bounds[0]
        return key, Image.frombytes('L',(w,h), read_pixels(r,w,h,depth,compression))
    if len(data) >= r.pos+283 and data[r.pos+4:r.pos+8] != b'\0\0\0\3':
        r.take(264); bounds = [r.num('i') for _ in range(4)]
        depth, compression = r.num('H'), r.num('B')
        w,h = bounds[3]-bounds[1],bounds[2]-bounds[0]
        return key, Image.frombytes('L',(w,h),read_pixels(r,w,h,depth,compression))
    r.take(4)
    if r.u32() != 3: raise ValueError('Unsupported VMAL version')
    length = r.u32(); end = r.pos + length
    if end != len(data): raise ValueError('VMAL length mismatch')
    r.take(16); channels = r.u32()
    if channels > 256: raise ValueError('VMAL channel limit')
    image = None
    for _ in range(channels+2):
        if not r.u32(): continue
        size = r.u32(); channel = Reader(r.take(size))
        if not size: continue
        depth = channel.u32(); b = [channel.u32() for _ in range(4)]
        if channel.num('H') != depth: raise ValueError('VMAL pixel depth mismatch')
        compression = channel.num('B'); w,h = b[3]-b[1],b[2]-b[0]
        pixels = read_pixels(channel,w,h,depth,compression)
        if channel.pos != len(channel.data): raise ValueError('VMAL channel has trailing bytes')
        if image is not None: raise ValueError('Multiple written sample channels unsupported')
        image = Image.frombytes('L',(w,h),pixels)
    if r.pos != end or image is None: raise ValueError('Invalid VMAL sample')
    return key,image


def read_pattern(data):
    r=Reader(data)
    if r.u32()!=1: raise ValueError('Unsupported pattern version')
    mode=r.u32();r.take(4);name=r.text();pid=r.take(r.num('B')).decode('ascii')
    if mode not in (1,2,3): raise ValueError('Only grayscale, indexed and RGB patterns supported')
    palette=r.take(768) if mode==2 else None
    if mode==2: r.take(4)
    if r.u32()!=3: raise ValueError('Invalid pattern VMAL version')
    length=r.u32();end=r.pos+length
    top,left,bottom,right=[r.num('i') for _ in range(4)];w,h=right-left,bottom-top
    if not (0<w<=10000 and 0<h<=10000 and w*h<=MAX_PIXELS): raise ValueError('Pattern dimensions exceed limit')
    count=r.u32()
    if count>256: raise ValueError('Pattern channel limit')
    channels=[]
    for _ in range(count+2):
        if not r.u32(): continue
        size=r.u32()
        if not size: continue
        c=Reader(r.take(size));depth=c.u32();ct,cl,cb,cr=[c.num('i') for _ in range(4)]
        if c.num('H')!=depth: raise ValueError('Pattern depth mismatch')
        compression=c.num('B');cw,ch=cr-cl,cb-ct
        if cl<left or ct<top or cr>right or cb>bottom: raise ValueError('Pattern channel outside bounds')
        pixels=read_pixels(c,cw,ch,depth,compression)
        if c.pos!=len(c.data): raise ValueError('Pattern channel trailing bytes')
        canvas=Image.new('L',(w,h));canvas.paste(Image.frombytes('L',(cw,ch),pixels),(cl-left,ct-top));channels.append(canvas)
    if r.pos!=end or end!=len(data): raise ValueError('Pattern VMAL length mismatch')
    required=1 if mode in (1,2) else 3
    if len(channels)<required: raise ValueError('Missing pattern channels')
    if mode==2:
        indexed=Image.frombytes('P',(w,h),channels[0].tobytes());indexed.putpalette(palette);image=indexed.convert('L')
    else: image=channels[0] if mode==1 else Image.merge('RGB',channels[:3]).convert('L')
    return pid,image


def read_legacy_abr(r,version,count):
    samples,presets,errors={ },[],[]
    for index in range(count):
        kind=r.num('H');size=r.u32();record=Reader(r.take(size))
        name='Legacy brush '+str(index+1)
        if kind!=2:
            errors.append({'name':name,'reasons':['Legacy computed/unknown record type '+str(kind)+' has undocumented shape metadata']});continue
        try:
            record.take(4);spacing=record.num('H')
            if version==2: name=record.text() or name
            record.take(9);top,left,bottom,right=[record.num('i') for _ in range(4)]
            depth,compression=record.num('H'),record.num('B')
            pixels=read_pixels(record,right-left,bottom-top,depth,compression)
            if record.pos!=len(record.data): raise ValueError('Legacy record trailing bytes')
            sid='legacy-'+str(index);samples[sid]=Image.frombytes('L',(right-left,bottom-top),pixels)
            presets.append({'Nm  ':name,'Brsh':{'_class':'sampledBrush','sampledData':sid,'Spcn':spacing},'_legacyVersion':version})
        except ValueError as e: errors.append({'name':name,'reasons':[str(e)]})
    if r.pos!=len(r.data): raise ValueError('Legacy file trailing records')
    return samples,presets,errors


def read_abr(path, include_patterns=False):
    r = Reader(path.read_bytes()); major,minor = r.num('H'),r.num('H')
    if major in (1,2):
        result=read_legacy_abr(r,major,minor)
        return (*result,{}) if include_patterns else result
    if major not in (6,7,9,10) or minor not in (1,2): raise ValueError('Supported ABR versions: 6/7/9/10, minor 1 or 2; legacy 1/2 are not descriptor-based')
    samples, presets, errors, patterns = {}, [], [], {}
    while r.pos < len(r.data):
        if r.take(4) != b'8BIM': raise ValueError('Invalid ABR section signature')
        key, size = r.take(4),r.u32(); body = r.take(size)
        if key == b'samp':
            s = Reader(body)
            while s.pos < len(body):
                n = s.u32(); item = s.take(n)
                try:
                    sample_id,image = abr_sample(item,minor); samples[sample_id] = image
                except ValueError as e: errors.append({'name': 'sample '+str(len(samples)), 'reasons':[str(e)]})
                s.take((-n)%4)
        elif key == b'patt':
            pattern_reader=Reader(body)
            while pattern_reader.pos<len(body):
                n=pattern_reader.u32();item=pattern_reader.take(n)
                try:
                    pid,image=read_pattern(item);patterns[pid]=image
                except ValueError as e: errors.append({'name':'pattern','reasons':[str(e)]})
                pattern_reader.take((-n)%4)
        elif key == b'desc':
            d = Reader(body)
            if d.u32() != 16: raise ValueError('Unsupported ABR descriptor version')
            presets.extend(d.descriptor().get('Brsh',[]))
            if d.pos != len(body): raise ValueError('ABR descriptor trailing bytes')
        if r.pos < len(r.data): r.take((-size)%4)
    return (samples,presets,errors,patterns) if include_patterns else (samples,presets,errors)


def resolve_archive(data):
    archive = plistlib.loads(data); objects = archive.get('$objects')
    if objects is None: return archive
    def resolve(value, depth=0):
        if depth > 64: raise ValueError('Keyed archive nesting limit')
        if isinstance(value,plistlib.UID): return resolve(objects[value.data],depth+1) if value.data else None
        if isinstance(value,list): return [resolve(x,depth+1) for x in value]
        if isinstance(value,dict):
            if 'NS.objects' in value: return resolve(value['NS.objects'],depth+1)
            return {k:resolve(v,depth+1) for k,v in value.items() if k != '$class'}
        return value
    return resolve(archive['$top']['root'])


def pressure_curve(settings,key):
    amount=clamp(settings.get(key),-1,1)
    curve=settings.get(key+'Curve',{}).get('points',[])
    points=[list(map(float,re.findall(r'-?\d+(?:\.\d+)?',p))) for p in curve if isinstance(p,str)]
    points=[p for p in points if len(p)==2]
    if len(points)<2: points=[[0,0],[1,1]]
    return [[clamp(x),clamp(1-amount+amount*clamp(y) if amount>=0 else 1+amount*clamp(y))] for x,y in points]


# Numeric file-format identifiers, independently decoded into our blend contract.
# Cross-reference: Freya Lupen's published Procreate format research (see README).
PROCREATE_BLEND_IDS={0:'normal',1:'multiply',2:'screen',3:'add',4:'lighten',5:'exclusion',6:'difference',7:'subtract',8:'linearBurn',9:'colorDodge',10:'colorBurn',11:'overlay',12:'hardLight',13:'luminosity',14:'color',15:'hue',16:'saturation',17:'softLight',19:'darken',20:'hardMix',21:'vividLight',23:'pinLight',24:'lighterColor',25:'darkerColor',26:'divide'}
def procreate_blend(value,notes,feature,default='normal'):
    code=int(number(value))
    if code not in PROCREATE_BLEND_IDS:
        notes.append(compatibility(feature,'Unknown Procreate blend identifier '+str(code)+'; '+default+' used.','unsupported'))
    return PROCREATE_BLEND_IDS.get(code,default)


def procreate_component(z,names,prefix,catalog,notes):
    raw=z.read(prefix+'Brush.archive'); settings=resolve_archive(raw)
    if prefix+'Shape.png' not in names: raise ValueError('Missing embedded Shape.png; bundled resource: '+str(settings.get('bundledShapePath')))
    if settings.get('bundledGrainPath') and prefix+'Grain.png' not in names: raise ValueError('Missing embedded grain: '+str(settings['bundledGrainPath']))
    warnings=[]
    mask=catalog.asset(Image.open(io.BytesIO(z.read(prefix+'Shape.png'))),warnings,bool(settings.get('shapeInverted')))
    d=descriptor(raw,mask)
    d['version']=5
    d['spacing']=clamp(settings.get('plotSpacing',0.1),0.000001,2)
    d['opacity']=clamp(settings.get('maxOpacity',1));d['flow']=clamp(settings.get('dynamicsGlazedFlow',1))
    d['tip']['angle']=clamp(settings.get('shapeAngle'),-1,1)*math.pi
    d['tip']['aspect']=1/clamp(settings.get('shapeRoundness',1),0.0625,1)
    # Shape Rotation follows stroke direction. Azimuth is pencil orientation, not path rotation.
    behavior={'version':2,'rotation':{'follow':clamp(settings.get('shapeRotation'),-1,1),'random':'stroke' if settings.get('shapeRandomise') else 'none','flipX':bool(settings.get('shapeFlipXJitter')),'flipY':bool(settings.get('shapeFlipYJitter')),'azimuth':bool(settings.get('shapeAzimuth'))},
        'scatter':{'countJitter':clamp(settings.get('shapeCountJitter')),'bothAxes':True}}
    count=1+round(clamp(settings.get('shapeCount'))*15)
    d['scatter']={'count':count,'radius':clamp(settings.get('plotJitter')),'scale':1,'sizeJitter':clamp(settings.get('dynamicsJitterSize')),'angleJitter':clamp(settings.get('shapeScatter')),'flowJitter':clamp(settings.get('dynamicsJitterOpacity'))}
    if settings.get('shapeCount'):
        notes.append(compatibility('shapeCount','Normalized archive count mapped linearly to 1–16; private archive transfer function is undocumented.'))
    for field,key in [('sizeByPressure','dynamicsPressureSize'),('opacityByPressure','dynamicsPressureOpacity')]: d[field]=pressure_curve(settings,key)
    if prefix+'Grain.png' in names:
        aid=catalog.asset(Image.open(io.BytesIO(z.read(prefix+'Grain.png'))),warnings,bool(settings.get('textureInverted')),grain=True)
        d['texture']={'id':aid,'strength':clamp(settings.get('grainDepth',1)),'periodPx':clamp(256*number(settings.get('textureScale'),1),1,4096)}
        behavior['grain']={'mode':'moving' if number(settings.get('textureMovement')) else 'canvas','movement':clamp(settings.get('textureMovement')),'zoom':clamp(settings.get('textureZoom',1)),'rotation':clamp(settings.get('textureRotation'),-1,1),'offsetJitter':bool(settings.get('textureOffsetJitter')),'brightness':clamp(settings.get('textureBrightness'),-1,1),'contrast':clamp(settings.get('textureContrast'),-1,1),'depthMinimum':clamp(settings.get('grainDepthMinimum')),'depthJitter':clamp(settings.get('grainDepthJitter')),'blendMode':procreate_blend(settings.get('grainBlendMode',1),notes,'grainBlend','multiply')}
        notes.append(compatibility('grain','Published blend identifiers retained; movement/zoom/depth transfer functions remain approximate.'))
    behavior['rendering']={'mode':'intenseBlend' if settings.get('renderingRecursiveMixing') else 'uniformBlend' if settings.get('renderingMaxTransfer') else 'lightGlaze','blendMode':procreate_blend(settings.get('extendedBlend',settings.get('blendMode',0)),notes,'blendMode'),'wetEdges':clamp(settings.get('wetEdgesAmount')),'burntEdges':clamp(settings.get('burntEdgesAmount')),'burntEdgesMode':procreate_blend(settings.get('burntEdgesBlendMode',1),notes,'burntEdgesBlend','multiply'), 'luminance':bool(settings.get('blendLuminance')),'gammaCorrect':bool(settings.get('blendGammaCorrect'))}
    wet={'dilution':'dynamicsMix','charge':'dynamicsLoad','attack':'dynamicsAttack','pull':'dynamicsWetAccumulation','grade':'dynamicsGradation','blur':'dynamicsBlur','blurJitter':'dynamicsBlurJitter','wetnessJitter':'dynamicsWetnessJitter'}
    if any(number(settings.get(k)) for k in wet.values()) or settings.get('renderingRecursiveMixing'):
        behavior['wetMix']={k:clamp(settings.get(v),-1 if k=='grade' else 0,1) for k,v in wet.items()}
        wet_dynamics={}
        for target,key,control in [('dilution','dynamicsPressureMix','pressure')]:
            if number(settings.get(key)) and number(settings.get('dynamicsMix'))>0:
                wet_dynamics[target]=[{'control':control,'strength':clamp(settings[key],-1,1),'minimum':0,'jitter':0}]
        if wet_dynamics: behavior['wetMix']['dynamics']=wet_dynamics
        # Wet parameters execute only in the mixer path. Even dilution/charge-only
        # presets need that path; retaining inert wetMix on stamp loses behavior.
        d['model']='mixer'
        d['mixer']={'load':clamp(settings.get('dynamicsLoad',1)),
            'pickup':clamp(settings.get('dynamicsWetAccumulation')),
            'strength':clamp(settings.get('dynamicsAttack',1))}
        notes.append(compatibility('wetMixGrade','Grade adjusts grain contrast, independently of pigment exhaustion; source texture response remains approximate.'))
        notes.append(compatibility('wetMix','Active wet mix or recursive blending selects Grafetto mixer. Charge/pull/attack are approximated as load/pickup/strength; pigment formulas and rendering-mode transfer require reference strokes.'))
    if number(settings.get('dynamicsPressureMix')) and not number(settings.get('dynamicsMix')):
        notes.append(compatibility('dynamicsPressureMix','Pressure-only dilution transfer is unknown without base dilution; not silently enabled as an inert control.','unsupported'))
    if number(settings.get('dynamicsTiltBleed')) and number(settings.get('bleedTiltAngle')):
        notes.append(compatibility('bleedTiltAngle','Saved tilt activation threshold requires calibration; current edge model uses normalized recorded tilt.','unsupported'))
    if number(settings.get('dynamicsPressureBleed')) or number(settings.get('dynamicsTiltBleed')):
        behavior['edgeBleed']={'pressure':clamp(settings.get('dynamicsPressureBleed'),-1,1),'tilt':clamp(settings.get('dynamicsTiltBleed'),-1,1)}
        curve=pressure_curve({**settings,'dynamicsPressureBleed':1},'dynamicsPressureBleed')
        behavior['edgeBleed']['pressureCurve']=curve
        notes.append(compatibility('edgeBleed','Pressure/tilt Bleed softens shape coverage independently of Pull, Blur and Wet Edges. Bounded 9-tap edge diffusion is a Grafetto approximation; Procreate kernel and tilt threshold require reference calibration.'))
    behavior['taper']={'start':clamp(settings.get('pencilTaperStartLength')),'end':clamp(settings.get('pencilTaperEndLength')),'size':clamp(settings.get('pencilTaperSize')),'opacity':clamp(settings.get('pencilTaperOpacity')),'pressure':True}
    notes.append(compatibility('spacing','Small source spacing retained; runtime enforces a pixel budget and archive spacing scale is not fully documented.'))
    notes.append(compatibility('rendering','Rendering modes, edge effects and taper use Grafetto algorithms, not Procreate formulas.'))
    if settings.get('shapeAzimuth'): notes.append(compatibility('shapeAzimuth','Azimuth uses recorded pen tilt; falls back to path for upright/no-tilt input.'))
    modulations={};mod_mapped=set()
    for target, suffix in [('size','Size'),('opacity','Opacity'),('flow','Flow'),('roundness','ShapeRoundness'),('grainDepth','TextureDepth')]:
        for control,prefix_name in [('tilt','dynamicsTilt'),('speed','dynamicsSpeed'),('pressure','dynamicsPressure')]:
            key=prefix_name+('OpacityTransfer' if target=='flow' and control=='pressure' else suffix)
            if number(settings.get(key)) and key not in ('dynamicsPressureSize','dynamicsPressureOpacity'):
                modulations.setdefault(target,[]).append({'control':control,'strength':clamp(settings[key],-1,1),'jitter':0,'minimum':clamp(settings.get(key+'Minimum'))})
                mod_mapped.add(key)
    if modulations:
        behavior['modulations']=modulations
        notes.append(compatibility('penDynamics','Signed tilt/speed size, opacity, flow, roundness and grain depth execute together. Normalized input curves and angle thresholds require reference calibration.'))
    active=[k for k,v in settings.items() if k.startswith('dynamicsTilt') and number(v) and not k.endswith(('Minimum','Angle')) and k not in mod_mapped and k != 'dynamicsTiltBleed']
    if active: notes.append(compatibility('tilt',', '.join(sorted(active)),'unsupported'))
    if settings.get('blendGammaCorrect'): notes.append(compatibility('blendGammaCorrect','sRGB linear-light compositing enabled; Procreate working colour-profile differences require reference calibration.'))
    if settings.get('dynamicsFalloff'): behavior['falloff']=clamp(settings['dynamicsFalloff'])
    if settings.get('dynamicsPressureSmoothing'): d['pressureSmoothingPx']=clamp(settings['dynamicsPressureSmoothing'])*32
    if settings.get('dynamicsMixSoftening'): notes.append(compatibility('dynamicsMixSoftening','Source transfer function is unknown; not substituted for Blur.','unsupported'))
    if settings.get('renderingModulatedTransfer'): notes.append(compatibility('renderingModulatedTransfer','Modulated rendering transfer is not yet calibrated.','unsupported'))
    if settings.get('dynamicsFalloff') or settings.get('dynamicsPressureSmoothing'):
        notes.append(compatibility('strokeResponse','Falloff is distance-driven; pressure smoothing uses the common spatial filter. Source transfer scales require reference calibration.'))
    mapped={'dynamicsMixSoftening','dynamicsFalloff','dynamicsPressureSmoothing','dynamicsPressureMix','dynamicsPressureBleed','dynamicsTiltBleed','dynamicsJitterSize','dynamicsJitterOpacity','dynamicsPressureSize','dynamicsPressureOpacity','dynamicsGlazedFlow',*wet.values(),*mod_mapped}
    unknown=[k for k,v in settings.items() if (k.startswith('dynamics') or k in ('jitterSecondary','jitterStrokeSecondary','plotJitterLinear','plotSpacingJitter','dynamicsFalloff')) and k not in mapped and not k.endswith(('Minimum','Angle','Curve')) and number(v)!=0 and not k.startswith('dynamicsTilt')]
    if unknown: notes.append(compatibility('activeUnmapped',', '.join(sorted(unknown)),'unsupported'))
    d['behavior']=behavior
    return d,raw,settings,warnings


def procreate(path,catalog):
    with zipfile.ZipFile(path) as z:
        if sum(x.file_size for x in z.infolist()) > 1024*1024*1024: raise ValueError('Archive expands beyond 1 GiB')
        names=set(z.namelist())
        for entry in sorted(n for n in names if n.endswith('Brush.archive') and '/Sub' not in n):
            prefix=entry[:-len('Brush.archive')];notes=[]
            try:
                d,raw,settings,warnings=procreate_component(z,names,prefix,catalog,notes)
                children=sorted(n for n in names if n.startswith(prefix+'Sub') and n.endswith('Brush.archive'))
                if children:
                    try:
                        child,childraw,_,cw=procreate_component(z,names,children[0][:-len('Brush.archive')],catalog,notes)
                        d['behavior']['dual']={'brush':finalize_identity(child,childraw),'blendMode':procreate_blend(settings.get('dualBlendMode',1),notes,'dualBlend','multiply'),'sampling':'independent'};warnings.extend(cw)
                        notes.append(compatibility('dual','Secondary has independent spacing, scatter/count, dynamics, grain and rendering on the recorded centreline. Separate secondary pigment pickup and final mixer tail recomposition remain approximate; combine mode decoded where known.'))
                    except ValueError as e: notes.append(compatibility('dual',str(e),'unsupported'))
                    if len(children)>1: notes.append(compatibility('dualDepth','Only one secondary component supported.','unsupported'))
                warnings.extend(n['feature']+': '+n['detail'] for n in notes if n['status']!='supported')
                catalog.brushes.append({'descriptor':finalize_identity(d,raw),'name':settings.get('name') or path.stem,'source':path.name,'warnings':warnings,'compatibility':notes})
            except ValueError as e: catalog.skipped.append({'name':prefix.rstrip('/') or path.stem,'reasons':[str(e)]})


BLENDS={'Nrml':'normal','Mltp':'multiply','Scrn':'screen','Ovrl':'overlay','Drkn':'darken','Lghn':'lighten','CBrn':'colorBurn','linearBurn':'linearBurn','CDdg':'colorDodge','linearDodge':'add','Sbtr':'subtract','Dfrn':'difference','Xclu':'exclusion','SftL':'softLight','HrdL':'hardLight','div ':'divide','linearLight':'linearLight','vividLight':'vividLight','pinLight':'pinLight','hardMix':'hardMix','darkerColor':'darkerColor','lighterColor':'lighterColor','H   ':'hue','Strt':'saturation','Clr ':'color','Lmns':'luminosity'}
def blend(value,notes,feature):
    if isinstance(value,dict): value=value.get('value')
    value=str(value or 'Nrml').split('.')[-1]
    if value not in BLENDS: notes.append(compatibility(feature,'Unsupported blend '+value+'; normal used.','unsupported'))
    return BLENDS.get(value,'normal')


def abr_dynamic(value,notes,feature,minimum=None):
    value=value or {};control=int(number(value.get('bVTy')))
    controls={0:'off',1:'fade',2:'pressure',3:'tilt',5:'initialDirection',6:'direction'}
    if control not in controls: notes.append(compatibility(feature,'Unsupported Photoshop control '+str(control),'unsupported'))
    result={'control':controls.get(control,'off'),'jitter':clamp(number(value.get('jitter'))/100),'minimum':clamp(number(value.get('Mnm '))/100 if minimum is None else minimum)}
    if control==1: result['fade']=clamp(value.get('fStp',1),0.001,100000)
    return result


def photoshop_component(p,samples,catalog,notes,seed,secondary=False,patterns=None):
    shape=p.get('Brsh',{});sid=shape.get('sampledData');warnings=[]
    if sid in samples:
        image=samples[sid]
        if shape.get('flipX'): image=ImageOps.mirror(image)
        if shape.get('flipY'): image=ImageOps.flip(image)
        mask=catalog.asset(image,warnings)
        d=descriptor(seed,mask)
    elif shape.get('_class')=='computedBrush':
        d=descriptor(seed,'');d['tip']={'kind':'round','hardness':clamp(number(shape.get('Hrdn'),100)/100),'aspect':1,'rotation':'fixed','angle':0}
    else: raise ValueError('Unsupported '+str(shape.get('_class'))+' tip or missing sampledData '+str(sid))
    d['version']=4
    d['spacing']=clamp(number(shape.get('Spcn'),10)/100,0.000001,2)
    d['tip']['angle']=math.remainder(number(shape.get('Angl'))*math.pi/180,2*math.pi)
    d['tip']['aspect']=1/clamp(number(shape.get('Rndn'),100)/100,0.0625,1)
    b={'version':2};dynamics={}
    if p.get('useTipDynamics'):
        for target,key,minkey in [('size','szVr','minimumDiameter'),('angle','angleDynamics',None),('roundness','roundnessDynamics','minimumRoundness')]:
            dynamics[target]=abr_dynamic(p.get(key),notes,target,number(p.get(minkey))/100 if minkey else None)
        b['rotation']={'follow':0,'random':'none','flipX':bool(p.get('flipX')),'flipY':bool(p.get('flipY'))}
        if p.get('brushProjection'):
            b['rotation']['projection']=True
            notes.append(compatibility('brushProjection','Tip aspect projects using recorded tilt; vendor projection transfer remains approximate.'))
    if p.get('useScatter'):
        sd=abr_dynamic(p.get('scatterDynamics'),notes,'scatter');cd=abr_dynamic(p.get('countDynamics'),notes,'count');dynamics.update(scatter=sd,count=cd)
        d['scatter']={'count':int(clamp(p.get('Cnt ',1),1,16)),'radius':clamp(number(p.get('scatterDynamics',{}).get('jitter'))/100,0,4),'scale':1}
        b['scatter']={'countJitter':cd['jitter'],'bothAxes':bool(p.get('bothAxes'))}
    tool=p.get('toolOptions',{})
    d['flow']=clamp(number(tool.get('flow'),100)/100);d['opacity']=clamp(number(tool.get('Opct'),100)/100)
    if p.get('usePaintDynamics'):
        for target,key in [('flow','prVr'),('opacity','opVr')]: dynamics[target]=abr_dynamic(p.get(key),notes,target)
    for target,key in [('size','szVr'),('flow','prVr'),('opacity','opVr')]:
        if key in tool: dynamics[target]=abr_dynamic(tool[key],notes,'tool '+target)
    if p.get('useColorDynamics'):
        for target,key in [('hue','H   '),('saturation','Strt'),('brightness','Brgh')]: dynamics[target]={'control':'off','jitter':clamp(number(p.get(key))/100),'minimum':0}
        if not p.get('colorDynamicsPerTip'): notes.append(compatibility('colorDynamics','Whole-stroke color randomness approximated per tip.'))
        if number(p.get('purity')) or p.get('clVr',{}).get('bVTy'): notes.append(compatibility('foregroundBackground','Background-color mixing and purity not retained.','unsupported'))
    if dynamics: b['dynamics']=dynamics
    b['rendering']={'mode':'buildUp','blendMode':blend(tool.get('Md  '),notes,'toolBlend'),'wetEdges':1 if p.get('Wtdg') else 0,'burntEdges':0,'burntEdgesMode':'multiply'}
    if p.get('Wtdg'): notes.append(compatibility('wetEdges','Grafetto edge algorithm approximates Photoshop wet edges.'))
    if p.get('useTexture'):
        pid=p.get('Txtr',{}).get('Idnt')
        if pid in (patterns or {}):
            aid=catalog.asset(patterns[pid],warnings,bool(p.get('InvT')),grain=True)
            d['texture']={'id':aid,'strength':clamp(number(p.get('textureDepth'),100)/100),'periodPx':clamp(256*number(p.get('textureScale'),100)/100,1,4096)}
            gd=abr_dynamic(p.get('textureDepthDynamics'),notes,'grainDepth');dynamics['grainDepth']=gd;b['dynamics']=dynamics
            b['grain']={'mode':'moving' if p.get('TxtC') else 'canvas','movement':1 if p.get('TxtC') else 0,'zoom':1,'rotation':0,'offsetJitter':False,'brightness':clamp(number(p.get('textureBrightness'))/100,-1,1),'contrast':clamp(number(p.get('textureContrast'))/100,-1,1),'depthMinimum':clamp(number(p.get('minimumDepth'))/100),'depthJitter':gd['jitter'],'blendMode':blend(p.get('textureBlendMode'),notes,'textureBlend')}
            notes.append(compatibility('texture','Embedded pattern retained; Photoshop per-tip texture coordinates approximated.'))
        else: notes.append(compatibility('texture','Missing or unsupported pattern '+str(pid),'unsupported'))
    for key in ['Nose','useBrushPose']:
        if p.get(key): notes.append(compatibility(key,'Active Photoshop feature not implemented.','unsupported'))
    dual=p.get('dualBrush',{})
    if dual.get('useDualBrush') and not secondary:
        try:
            child=photoshop_component(dual,samples,catalog,notes,seed+b'dual',True,patterns)[0]
            b['dual']={'brush':finalize_identity(child,seed+b'dual'),'blendMode':blend(dual.get('BlnM'),notes,'dualBlend'),'sampling':'independent'}
            notes.append(compatibility('dual','Independent secondary spacing, scatter/count, dynamics, grain and taper operate on the recorded centreline. Vendor masks/combine transfer remains approximate.'))
        except ValueError as e: notes.append(compatibility('dual',str(e),'unsupported'))
    if tool.get('_class') in ('MixB','SmTl'):
        d['model']='mixer'
        # Published ABR descriptor keys are wetness and 'Prs ' (strength).
        # Preserve aliases accepted by earlier synthetic/private descriptors;
        # canonical fields take precedence, including an explicit zero.
        wetness=tool.get('wetness',tool.get('wet',50))
        strength=tool.get('Prs ',tool.get('strength',50))
        d['mixer']={'load':0 if tool.get('_class')=='SmTl' else 0.5,'pickup':clamp(number(wetness,50)/100),'strength':clamp(number(strength,50)/100)}
        b['wetMix']={'dilution':0,'charge':d['mixer']['load'],'attack':d['mixer']['strength'],'pull':d['mixer']['pickup'],'grade':0,'blur':0,'blurJitter':0,'wetnessJitter':0}
        notes.append(compatibility('toolType','Photoshop Mixer/Smudge selects carried-pigment rendering. Unknown tool-specific load/mix flags use explicit defaults; Photoshop reservoir formulas differ.'))
    d['behavior']=b
    return d,warnings


def photoshop(path,catalog):
    samples,presets,errors,patterns=read_abr(path,True);catalog.skipped.extend(errors)
    for index,p in enumerate(presets):
        name=p.get('Nm  ',f'Brush {index+1}');notes=[]
        if p.get('_legacyVersion'): notes.append(compatibility('legacyABR','Legacy sampled records validated with synthetic fixtures; no owner-supplied legacy reference yet.'))
        seed=json.dumps(p,sort_keys=True).encode()
        try:
            d,warnings=photoshop_component(p,samples,catalog,notes,seed,patterns=patterns)
            warnings.extend(n['feature']+': '+n['detail'] for n in notes if n['status']!='supported')
            catalog.brushes.append({'descriptor':finalize_identity(d,seed),'name':name,'source':path.name,'warnings':warnings,'compatibility':notes})
        except ValueError as e: catalog.skipped.append({'name':name,'reasons':[str(e)]})


def validate_portable_dynamics(controls):
    def finite(value,low=0,high=1):
        return type(value) in (int,float) and math.isfinite(value) and low<=value<=high
    if not isinstance(controls,list) or len(controls)>4: raise ValueError('Invalid portable dynamic count')
    def keyed(source,kind="qt5Taus88"):
        return (isinstance(source,dict) and set(source)=={'kind','key'} and source.get('kind')==kind
                and isinstance(source.get('key'),str) and '\0' not in source['key']
                and 1<=len(source['key'].encode('utf-16-le','surrogatepass'))//2<=128)
    for control in controls:
        if isinstance(control,dict) and 'combine'in control:
            c=control['combine']
            if (set(control)!={'control','minimum','jitter','combine'} or control.get('control')!='off' or not finite(control.get('minimum'),0,0) or not finite(control.get('jitter'),0,0)
                    or not isinstance(c,dict) or set(c)-{'mode','scaling','additive','constant','absolute','policy'} or c.get('mode')not in('product','sum','max','min','difference')
                    or not isinstance(c.get('scaling'),list) or not isinstance(c.get('additive'),list)):
                raise ValueError('Invalid portable combined dynamic')
            if 'policy'in c and c['policy']!='native-scatter-v1':raise ValueError('Invalid combined dynamic policy')
            if 'constant'in c and not finite(c['constant'],0,4 if c.get('policy')=='native-scatter-v1'else 1):raise ValueError('Invalid combined dynamic constant')
            children=c['scaling']+c['additive']
            absolute=c.get('absolute')
            if absolute is not None:
                if (not isinstance(absolute,dict)or set(absolute)!={'locked','angleOffset','curve'}or type(absolute.get('locked'))is not bool or not finite(absolute.get('angleOffset'),-360,360)):raise ValueError('Invalid combined absolute angle')
                validate_portable_dynamics([{'control':'off','minimum':0,'jitter':0,'curve':absolute['curve']}])
            if not (1<=len(children)<=16 or len(children)==0 and absolute is not None) or any(not isinstance(child,dict)or'combine'in child for child in children):raise ValueError('Invalid portable combined dynamic leaves')
            for child in children:validate_portable_dynamics([child])
            continue
        if (not isinstance(control,dict) or set(control)-{'control','minimum','jitter','strength','fade','curve','randomStream','randomSource','period','periodic'}
                or control.get('control') not in ('off','pressure','tilt','speed','fade','direction','initialDirection','tiltElevation','tiltX','tiltY','azimuth','tiltDirection','random','strokeRandom','dabProgress','time','distance')
                or (control.get('control')=='strokeRandom' and not (
                    ('randomSource' not in control and type(control.get('randomStream')) is int and 0<=control['randomStream']<=4294967295)
                    or ('randomStream' not in control and keyed(control.get('randomSource')))))
                or (control.get('control')=='random' and ('randomStream' in control or 'randomSource' in control and not keyed(control['randomSource'],'grafettoSourceTime-v1')))
                or (control.get('control')not in('strokeRandom','random') and ('randomStream' in control or 'randomSource' in control))
                or (control.get('control')in('dabProgress','time','distance') and (type(control.get('period')) is not int or not 1<=control['period']<=(2147483647 if control['control']!='dabProgress'else 1000000) or type(control.get('periodic')) is not bool))
                or (control.get('control')not in('dabProgress','time','distance') and ('period' in control or 'periodic' in control))
                or not finite(control.get('minimum')) or not finite(control.get('jitter'))
                or ('strength' in control and not finite(control['strength'],-1,1))
                or ('fade' in control and not finite(control['fade'],.001,100000))):
            raise ValueError('Invalid portable dynamic')
        if 'curve' not in control: continue
        curve=control['curve']
        if isinstance(curve,dict):
            if (set(curve)-{'kind','samples','endpointEpsilon','preserveInputSign'} or curve.get('kind')!='uniform'
                    or not isinstance(curve.get('samples'),list) or not 2<=len(curve['samples'])<=256
                    or any(not finite(v) for v in curve['samples'])
                    or ('endpointEpsilon' in curve and not finite(curve['endpointEpsilon'],0,.001))
                    or ('preserveInputSign' in curve and type(curve['preserveInputSign']) is not bool)):
                raise ValueError('Invalid portable dynamic transfer')
        elif isinstance(curve,list) and 2<=len(curve)<=256:
            previous=-1
            for point in curve:
                if not isinstance(point,list) or len(point)!=2 or not all(finite(v) for v in point) or point[0]<=previous:
                    raise ValueError('Invalid portable dynamic knots')
                previous=point[0]
        else: raise ValueError('Invalid portable dynamic curve')


def validate_portable_mixer(descriptor):
    mixer=descriptor.get('mixer')
    if mixer is None:
        if descriptor['model']=='mixer': raise ValueError('Missing portable mixer')
        return
    behavior=descriptor.get('behavior',{})
    if not isinstance(behavior,dict)or not isinstance(behavior.get('rendering',{}),dict):
        raise ValueError('Invalid portable mixer behavior/rendering')
    def finite(value,low=0,high=1):
        return type(value) in (int,float) and math.isfinite(value) and low<=value<=high
    if (descriptor['model']!='mixer' or not isinstance(mixer,dict)
            or set(mixer)-{'load','pickup','strength','initialLoad','smearAlpha','source','pickupDynamics','sampling','foreground','algorithm','paintThickness','colorRateComposite'}
            or any(not finite(mixer.get(key)) for key in ('load','pickup','strength'))
            or ('initialLoad' in mixer and not finite(mixer['initialLoad']))
            or ('smearAlpha' in mixer and type(mixer['smearAlpha']) is not bool)
            or ('source' in mixer and mixer['source'] not in ('previousCanvas','projectionCanvas'))):
        raise ValueError('Invalid portable mixer')
    if 'colorRateComposite'in mixer:
        mode=mixer['colorRateComposite'];version=descriptor.get('version',0)
        modern=mixer.get('algorithm')in('krita-mask','krita-stamp')
        valid=(legacy_color_smudge_dodge_burn176_scope(descriptor)if mode in('dodge','burn')else legacy_color_smudge_arithmetic175_scope(descriptor)if mode in('add','subtract')else legacy_color_smudge_minmax172_scope(descriptor)if mode in('darken','lighten')else legacy_color_smudge_overlay154_scope(descriptor)if mode=='overlay'else version>=88 and descriptor.get('behavior',{}).get('erase')is True and mixer.get('source')in('previousCanvas','projectionCanvas') if mode=='erase' else modern if mode=='hardMixPhotoshop' else modern and version>=82 if mode in('grainMerge','grainExtract','negation') else version>=83 and 'algorithm'not in mixer and (mixer.get('source')=='previousCanvas' or version>=85 and mixer.get('source')=='projectionCanvas') if mode in('multiply','screen') else False)
        if not valid or descriptor.get('behavior',{}).get('rendering',{}).get('blendMode')!='normal':raise ValueError('Invalid Color Smudge foreground composition')
    if 'algorithm' in mixer and (mixer['algorithm'] not in ('krita-mask','krita-stamp') or mixer.get('source') not in ('previousCanvas','projectionCanvas')): raise ValueError('Invalid Color Smudge algorithm')
    if not isinstance(descriptor.get('behavior',{}),dict): raise ValueError('Invalid portable mixer behavior')
    if mixer.get('source') in ('previousCanvas','projectionCanvas') and (mixer['load']!=0 or mixer.get('initialLoad')!=0 or descriptor.get('behavior',{}).get('wetMix') is not None):
        raise ValueError('Invalid portable previous-canvas source')
    if 'paintThickness' in mixer:
        t=mixer['paintThickness']
        if (mixer.get('source')!='previousCanvas' or mixer.get('algorithm')!='krita-mask' or not descriptor.get('tip',{}).get('material') or not isinstance(t,dict)
                or set(t)-{'value','mode','dynamics'} or not finite(t.get('value')) or t.get('mode') not in ('overlay','overwrite')):
            raise ValueError('Invalid portable paint thickness')
        if 'dynamics' in t: validate_portable_dynamics(t['dynamics'])
    if 'pickupDynamics' in mixer: validate_portable_dynamics(mixer['pickupDynamics'])
    if 'sampling' in mixer:
        sampling=mixer['sampling']
        if (not isinstance(sampling,dict) or set(sampling)-{'mode','radius','radiusDynamics'}
                or mixer.get('source') not in ('previousCanvas','projectionCanvas') or sampling.get('mode') not in ('uniformMean','adaptiveMean','maskMean') or not finite(sampling.get('radius'),0,3)):
            raise ValueError('Invalid portable mixer sampling')
        if sampling.get('mode')=='maskMean' and mixer.get('algorithm') not in ('krita-mask','krita-stamp'): raise ValueError('Mask-weighted sampling requires Color Smudge')
        if 'radiusDynamics' in sampling: validate_portable_dynamics(sampling['radiusDynamics'])
    if 'foreground' in mixer:
        foreground=mixer['foreground']
        if not isinstance(foreground,dict):raise ValueError('Invalid portable mixer foreground')
        gradient='gradient' in foreground
        if gradient:
            if set(foreground)!={'gradient'} or not isinstance(foreground['gradient'],dict):raise ValueError('Invalid portable foreground gradient')
            foreground=foreground['gradient']
        allowed={'rate','dynamics','value','positionDynamics'} if gradient else {'rate','dynamics'}
        if (set(foreground)-allowed or mixer.get('source') not in ('previousCanvas','projectionCanvas')
                or not finite(foreground.get('rate')) or gradient and not finite(foreground.get('value'))):
            raise ValueError('Invalid portable mixer foreground')
        if 'dynamics' in foreground: validate_portable_dynamics(foreground['dynamics'])
        if gradient and 'positionDynamics' in foreground:validate_portable_dynamics(foreground['positionDynamics'])


def validate_portable_profile(descriptor, *, parent=None):
    """Bound the portable Python boundary; shared isBrushLibrary remains the
    authoritative whole-library validator before installation."""
    from mypaint_legacy156 import validate_mypaint_legacy156
    validate_mypaint_legacy156(descriptor,parent)
    from bristle_soak139 import validate_bristle_soak139,validate_bristle_initialization141
    validate_bristle_soak139(descriptor,parent)
    validate_bristle_initialization141(descriptor,parent)
    from grid_wash137 import validate_grid_wash137
    validate_grid_wash137(descriptor,parent)
    from tangent_wash136 import validate_tangent_wash136
    validate_tangent_wash136(descriptor,parent)
    from bristle_wash135 import validate_bristle_wash135
    validate_bristle_wash135(descriptor,parent)
    from particle_wash134 import validate_particle_wash134
    validate_particle_wash134(descriptor,parent)
    from sketch_image_alpha162 import validate_sketch_image_alpha162
    validate_sketch_image_alpha162(descriptor,parent)
    from sketch_procedural173 import validate_sketch_procedural173,sketch_procedural173_scope
    validate_sketch_procedural173(descriptor,parent)
    from sketch_gih174 import validate_sketch_gih174,sketch_gih174_scope
    from sketch_gih181 import validate_sketch_pressure_gih181,sketch_pressure_gih181_scope
    validate_sketch_pressure_gih181(descriptor,parent)
    if not sketch_pressure_gih181_scope(descriptor):validate_sketch_gih174(descriptor,parent)
    from curve_timer167 import validate_curve_timer167
    validate_curve_timer167(descriptor,parent)
    from texture_lightness_wash171 import validate_texture_lightness_wash171
    validate_texture_lightness_wash171(descriptor,parent)
    from texture_gradient_wash180 import validate_texture_gradient_wash180
    validate_texture_gradient_wash180(descriptor,parent)
    from dual_mask170 import validate_pixel_alpha_dual170
    validate_pixel_alpha_dual170(descriptor,parent)
    from dual_mask168 import validate_pixel_alpha_dual168
    validate_pixel_alpha_dual168(descriptor,parent)
    from sketch_timer161 import validate_sketch_timer161
    validate_sketch_timer161(descriptor,parent)
    from particle_timer157 import validate_particle_timer157
    validate_particle_timer157(descriptor,parent)
    from clone_projection149 import validate_clone_projection149
    validate_clone_projection149(descriptor,1 if parent is not None else 0)
    validate_clone_healing152(descriptor,1 if parent is not None else 0)
    validate_legacy_color_smudge_overlay154(descriptor,1 if parent is not None else 0)
    validate_legacy_color_smudge_minmax172(descriptor,1 if parent is not None else 0)
    validate_legacy_color_smudge_dodge_burn176(descriptor,1 if parent is not None else 0)
    validate_legacy_color_smudge_arithmetic175(descriptor,1 if parent is not None else 0)
    from canonical_effect_scopes import validate_canonical_effect_scopes
    validate_canonical_effect_scopes(descriptor,1 if parent is not None else 0)
    validate_pixel_original_hsv150(descriptor,1 if parent is not None else 0)
    validate_pixel_original_dual151(descriptor,1 if parent is not None else 0)
    from spray_wash133 import validate_spray_wash133
    validate_spray_wash133(descriptor)
    from krita_spray import validate_spray_source146
    validate_spray_source146(descriptor)
    from spray_rectangle_noise155 import validate_spray_rectangle_noise155,spray_rectangle_noise155_scope
    validate_spray_rectangle_noise155(descriptor,1 if parent is not None else 0)
    from child_clock132 import validate_child_clock132_profile
    validate_child_clock132_profile(descriptor,parent)
    tip=descriptor['tip']
    profile=tip.get('profile')
    behavior=descriptor.get('behavior',{})
    if isinstance(behavior,dict):
        rendering=behavior.get('rendering',{})
        if any(isinstance(behavior.get(k),dict) and any(mode in('hardMixPhotoshop','kritaHardMix') for mode in behavior[k].values()) for k in ('grain','dual','wetMix')) or isinstance(rendering,dict) and rendering.get('burntEdgesMode')in('hardMixPhotoshop','kritaHardMix'):raise ValueError('Extended composite is rendering-only')
        if isinstance(rendering,dict) and rendering.get('blendMode')=='hardMixPhotoshop' and (descriptor['version']<102 or descriptor.get('model')!='stamp' or behavior.get('dual')is not None or behavior.get('wetMix')is not None or behavior.get('erase')is True or any(k in descriptor for k in ('mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'))):raise ValueError('Photoshop Hard Mix requires root Pixel102')
        if isinstance(rendering,dict) and rendering.get('blendMode')=='kritaHardMix' and (descriptor['version']<104 or descriptor.get('model')!='stamp' or behavior.get('dual')is not None or behavior.get('wetMix')is not None or behavior.get('erase')is True or any(k in descriptor for k in ('mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'))):raise ValueError('Krita Hard Mix requires root Pixel104')
    filter_config=descriptor.get('filter')
    if isinstance(filter_config,dict)and filter_config.get('smudgeMode')is True:
        # The complete new147 scope was validated above. Reuse unchanged
        # legacy pointwise config checks after stripping ONLY its two markers.
        filter_config={k:v for k,v in filter_config.items()if k not in('smudgeMode','sourcePolicy','spatialPolicy','maskPolicy')}
    if isinstance(filter_config,dict) and (filter_config.get('kind')in('invert','desaturate','posterize') or filter_config.get('version')==2):
        mixer=descriptor.get('mixer');rendering=behavior.get('rendering') if isinstance(behavior,dict) else None
        desaturate=filter_config.get('kind')=='desaturate';posterize=filter_config.get('kind')=='posterize'
        shape=(set(filter_config)=={'version','kind','steps'}and type(filter_config.get('steps'))is int and 2<=filter_config['steps']<=128)if posterize else(set(filter_config)=={'version','kind','type'}and type(filter_config.get('type'))is int and 0<=filter_config['type']<=5)if desaturate else(set(filter_config)=={'version','kind'}and filter_config.get('kind')=='invert')
        if (not shape or type(filter_config.get('version'))is not int or filter_config['version']!=2
                or descriptor['version']<(117 if posterize else 99 if desaturate else 95) or descriptor.get('model')!='mixer' or not isinstance(mixer,dict) or mixer.get('source')!='previousCanvas'
                or any(k in mixer for k in ('algorithm','foreground','sampling','paintThickness'))
                or any(k in descriptor for k in ('deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet'))
                or descriptor.get('paperInteraction')!=0 or not isinstance(behavior,dict) or behavior.get('version')!=2
                or any(k in behavior for k in ('dual','timing','wetMix','taper')) or(posterize and(behavior.get('erase')is True or any(k in descriptor for k in('clone','mypaint','tangentNormal'))))or not isinstance(rendering,dict)
                or rendering.get('accumulation')!='directOver' or rendering.get('blendMode')!='normal' or rendering.get('wetEdges')!=0 or rendering.get('burntEdges')!=0):
            raise ValueError('Invalid portable Posterize filter; requires revision117 and ordinary canvas-filter strategy'if posterize else'Invalid portable Desaturate filter; requires revision99 and ordinary canvas-filter strategy'if desaturate else'Invalid portable Invert filter; requires revision95 and ordinary canvas-filter strategy')
    sketch=descriptor.get('sketch')
    if isinstance(sketch,dict):
        active=sketch.get('mode')=='mask'and sketch.get('distanceOpacity')is True
        if(active and(descriptor['version']<114 or sketch.get('distanceOpacityPolicy')!='generic-clamp-v1'))or(not active and 'distanceOpacityPolicy'in sketch):raise ValueError('Invalid portable Sketch114 distance opacity policy')
        # Only the new114 opt-in: mirror shared Sketch/root scope before any
        # portable assets are published. Presence rejects empty/null dual too.
        if active and(descriptor.get('model')!='stamp' or descriptor.get('paperInteraction')!=0
                or any(k in descriptor for k in('spray','bristle','curveTrace','scatter','mixer','texture','wet','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'))
                or not isinstance(behavior,dict) or behavior.get('version')!=2
                or any(k in behavior for k in('dual','timing','wetMix','taper','mirror'))
                or not isinstance(rendering,dict) or rendering.get('accumulation')!='directOver' or rendering.get('blendMode')!='normal'):
            raise ValueError('Invalid portable Sketch114 root scope')
    if isinstance(sketch,dict)and sketch.get('mode')=='mask'and not sketch_procedural173_scope(descriptor):
        dims=sketch.get('maskSize');bounds=tip.get('maskBounds')
        if descriptor['version']<101 or descriptor.get('model')!='stamp' or tip.get('kind')!='bitmap' or tip.get('aspect')!=1 or not isinstance(dims,list)or len(dims)!=2 or any(type(n)is not int or not 1<=n<=256 for n in dims)or type(sketch.get('distanceOpacity'))is not bool or any(k in tip and(k!='animation'or not (sketch_gih174_scope(descriptor)or sketch_pressure_gih181_scope(descriptor)))for k in('color','animation','material','imageSampling','profile','autoNoise','autoShape'))or not isinstance(bounds,dict):raise ValueError('Invalid portable Sketch101 mask')
    noise=tip.get('autoNoise')
    if noise is not None and(not isinstance(noise,dict)or set(noise)!={'version','density','randomness'}or type(noise.get('version'))is not int or noise['version']!=1
            or not all(type(noise.get(k))in(int,float)and math.isfinite(noise[k])and 0<=noise[k]<=1 for k in('density','randomness'))
            or descriptor.get('model')!='stamp'or tip.get('kind')!='procedural'or not isinstance(profile,dict)or profile.get('kind')not in('standard','gaussian','radialCurve','radialCurveSoftness','gaussian2D','curveRectangle','curveRectangleSoftness')):raise ValueError('Invalid portable auto mask noise')
    if noise is not None and 'spray'in descriptor:
        spray=descriptor['spray']
        if not isinstance(spray,dict) or not isinstance(spray.get('particle'),dict) or not isinstance(spray.get('color'),dict) or not isinstance(behavior,dict):raise ValueError('Invalid portable Spray Auto-mask noise records')
        particle=spray['particle'];color=spray['color']
        if descriptor.get('version',0)<96 or particle.get('shape')!='tip' or particle.get('image') or any(color.get(k) for k in ('sampleInput','mixBackground','fillBackground')) or 'dual'in behavior:raise ValueError('Invalid portable Spray Auto-mask noise combination')
    if noise is not None and profile.get('kind')in('gaussian2D','curveRectangle','curveRectangleSoftness') and(descriptor['version']<98 or 'autoShape'in tip):raise ValueError('Rectangle Auto-mask noise requires revision98 without spikes')
    auto=tip.get('autoShape')
    if auto is not None and (not isinstance(auto,dict)or set(auto)!={'version','spikes'}or type(auto.get('version'))is not int or auto['version']!=1
            or type(auto.get('spikes'))is not int or not 3<=auto['spikes']<=20 or descriptor.get('model')!='stamp'or tip.get('kind')!='procedural'
            or not isinstance(profile,dict)or profile.get('kind')not in('standard','gaussian','radialCurve','radialCurveSoftness','gaussian2D','curveRectangle','curveRectangleSoftness')):raise ValueError('Invalid native auto shape')
    maximum=(isinstance(behavior,dict) and isinstance(behavior.get('rendering'),dict)
             and behavior['rendering'].get('accumulation')=='maxAlpha')
    circle=isinstance(profile,dict) and profile.get('kind')=='circleBand'
    if maximum != circle:
        raise ValueError('Portable circle-band requires paired max-alpha rendering')
    if profile is None:
        if tip.get('kind')=='procedural': raise ValueError('Procedural tip requires profile')
        return
    behavior=descriptor.get('behavior',{})
    if (not isinstance(profile,dict) or type(profile.get('antialias')) is not bool
            or tip.get('kind') not in ('round','procedural')
            or any(key in tip for key in ('mask','maskBounds','animation','material'))
            or not isinstance(behavior,dict) or behavior.get('version')!=2
            or any(key in behavior for key in ('wetMix','edgeBleed')) or 'wet' in descriptor
            or behavior.get('rendering',{}).get('wetEdges',0)!=0):
        raise ValueError('Invalid portable procedural profile combination')
    finite=lambda value,lo,hi:type(value) in (int,float) and math.isfinite(value) and lo<=value<=hi
    if profile.get('kind') in ('gaussian2D','curveRectangle','curveRectangleSoftness'):
        kind=profile['kind']
        minimum_version={'gaussian2D':78,'curveRectangle':79,'curveRectangleSoftness':80}[kind]
        if (descriptor.get('model')!='stamp' or tip.get('kind')!='procedural'
                or type(descriptor.get('version'))is not int or descriptor['version']<minimum_version
                or 'spray'in descriptor and not spray_rectangle_noise155_scope(descriptor)
                or any(k in descriptor for k in ('mixer','grid','hatching','bristle','sketch','deform','clone','filter','experiment','particle','tangentNormal','mypaint'))
                or 'dual'in behavior or 'autoNoise'in tip and descriptor['version']<98):raise ValueError('Invalid portable rectangle profile combination')
        if kind=='gaussian2D':
            if (set(profile)!={'kind','shape','horizontalFade','verticalFade','antialias'} or profile.get('shape')not in('ellipse','rectangle')
                    or any(not finite(profile.get(k),0,1)for k in('horizontalFade','verticalFade'))):raise ValueError('Invalid portable 2D Gaussian profile')
        else:
            dynamic=kind=='curveRectangleSoftness'
            fields={'kind','lookup','resolution','encoding','antialias'}|({'minimum','span'}if dynamic else set())
            if (set(profile)!=fields or profile.get('encoding')!=('softness-affine-unorm32be-v1'if dynamic else'unorm32be')
                    or not isinstance(profile.get('lookup'),str)or not re.fullmatch(r'asset:[a-f0-9]{64}',profile['lookup'])
                    or type(profile.get('resolution'))is not int or not 1<=profile['resolution']<=40000
                    or any(k in tip for k in('imageSampling','alphaThreshold'))
                    or dynamic and(not finite(profile.get('minimum'),-65536,65536)or not finite(profile.get('span'),1,131072))):raise ValueError('Invalid portable rectangle curve profile')
    elif profile.get('kind')=='gaussian':
        if (set(profile)!={'kind','fade','antialias'} or descriptor['model']!='stamp'
                or tip.get('aspect')!=1 and tip.get('autoShape')is None or not finite(profile.get('fade'),.000001,.999999)):
            raise ValueError('Invalid portable Gaussian profile')
    elif profile.get('kind')=='standard':
        if (set(profile)!={'kind','shape','horizontalFade','verticalFade','antialias'}
                or tip.get('kind')!='procedural' or profile['shape'] not in ('ellipse','rectangle')
                or any(not finite(profile.get(key),0,1) for key in ('horizontalFade','verticalFade'))):
            raise ValueError('Invalid portable standard profile')
    elif profile.get('kind')=='radialCurveSoftness':
        if (set(profile)!={'kind','lookup','resolution','encoding','minimum','span','antialias'}
                or descriptor.get('model')!='stamp' or tip.get('kind')!='procedural'or profile.get('antialias')is not False
                or profile.get('encoding')!='softness-affine-unorm32be-v1'
                or not isinstance(profile.get('lookup'),str)or not re.fullmatch(r'asset:[a-f0-9]{64}',profile['lookup'])
                or type(profile.get('resolution'))is not int or not 1<=profile['resolution']<=40000
                or not finite(profile.get('minimum'),-65536,65536)or not finite(profile.get('span'),1,131072)
                or any(key in tip for key in ('imageSampling','alphaThreshold'))):raise ValueError('Invalid portable radial softness profile')
    elif profile.get('kind')=='radialCurve':
        if (set(profile)!={'kind','lookup','resolution','encoding','antialias'}
                or tip.get('kind')!='procedural' or profile['antialias'] is not False
                or profile.get('encoding')!='unorm32be'
                or not isinstance(profile.get('lookup'),str) or not re.fullmatch(r'asset:[a-f0-9]{64}',profile['lookup'])
                or type(profile.get('resolution')) is not int or not 1<=profile['resolution']<=40000
                or any(key in tip for key in ('imageSampling','alphaThreshold'))):
            raise ValueError('Invalid portable radial curve profile')
    elif circle:
        def flat(curve):
            return (isinstance(curve,list) and len(curve)>=2
                    and all(isinstance(point,list) and len(point)==2 and type(point[0]) in (int,float) and math.isfinite(point[0]) and 0<=point[0]<=1
                            and type(point[1]) in (int,float) and point[1]==1 for point in curve))
        dynamics=behavior.get('dynamics',{})
        modulations=behavior.get('modulations',{})
        rotation=behavior.get('rotation',{})
        scatter=behavior.get('scatter',{})
        if (set(profile)!={'kind','antialias'} or profile['antialias'] is not True
                or tip.get('kind')!='procedural' or type(tip.get('aspect')) not in (int,float) or tip.get('aspect')!=1
                or descriptor.get('model')!='stamp' or type(descriptor.get('paperInteraction')) not in (int,float) or descriptor.get('paperInteraction')!=0
                or any(key in tip for key in ('imageSampling','alphaThreshold'))
                or type(descriptor.get('flow')) not in (int,float) or descriptor.get('flow')!=1 or descriptor.get('flowPer')!='stamp' or 'flowSpan' in descriptor
                or not flat(descriptor.get('flowByPressure')) or not flat(descriptor.get('opacityByPressure'))
                or any(key in descriptor for key in ('texture','scatter','wet','mixer'))
                or any(key in behavior for key in ('dual','taper'))
                or not all(isinstance(value,dict) for value in (dynamics,modulations,rotation,scatter))
                or any(key in dynamics or key in modulations for key in ('flow','opacity','roundness'))
                or rotation.get('projection') is True or scatter.get('roundnessJitter',0)!=0
                or behavior.get('rendering',{}).get('mode')!='buildUp'):
            raise ValueError('Invalid portable circle-band/max-alpha combination')
    else: raise ValueError('Unknown portable procedural profile')


def portable_bundle(path,catalog):
    # The runtime shared guard remains authoritative for descriptor semantics.
    if path.stat().st_size>360*1024*1024: raise ValueError('Portable bundle exceeds 360 MiB')
    data=json.loads(path.read_text(),parse_constant=lambda v: (_ for _ in ()).throw(ValueError('Nonfinite JSON number '+v)))
    if not isinstance(data,dict) or set(data)!={'library','assets'}: raise ValueError('Invalid portable bundle envelope')
    library=data['library'];payloads=data['assets']
    if not isinstance(library,dict) or library.get('schemaVersion')!=1 or not isinstance(payloads,dict): raise ValueError('Invalid portable library')
    assets=library.get('assets');brushes=library.get('brushes');skipped=library.get('skipped')
    if not isinstance(assets,list) or len(assets)>1024 or not isinstance(brushes,list) or len(brushes)>512 or not isinstance(skipped,list) or len(skipped)>1024: raise ValueError('Portable library item limit')
    total=0;validated=[];ids=set()
    for asset in assets:
        if not isinstance(asset,dict): raise ValueError('Invalid portable asset')
        aid=asset.get('id');size=asset.get('size')
        if not isinstance(aid,str) or not re.fullmatch(r'asset:[a-f0-9]{64}',aid) or aid in ids: raise ValueError('Invalid or duplicate portable asset ID')
        if type(size)!=int or not 2<=size<=2048 or size&(size-1) or asset.get('file')!=aid[6:]+'.bin': raise ValueError('Invalid portable asset dimensions/path')
        ids.add(aid);total+=size*size
        if total>256*1024*1024: raise ValueError('Portable raw assets exceed 256 MiB')
        encoded=payloads.get(aid)
        if not isinstance(encoded,str) or len(encoded)>((size*size+2)//3)*4: raise ValueError('Invalid portable asset payload')
        raw=base64.b64decode(encoded,validate=True)
        if len(raw)!=size*size or hashlib.sha256(raw).hexdigest()!=aid[6:]: raise ValueError('Portable asset integrity mismatch')
        validated.append((asset,raw))
    if set(payloads)!=ids: raise ValueError('Portable payload keys differ from manifest')
    seen=set()
    trusted_raw_assets={asset['id']:raw for asset,raw in validated}
    asset_sizes={asset['id']:asset['size'] for asset,_ in validated}
    def validate_descriptor(d,depth=0,parent=None):
        if not isinstance(d,dict) or depth>1 or not isinstance(d.get('id'),str) or not re.fullmatch(r'imported-[a-f0-9]{24}',d['id']): raise ValueError('Invalid portable descriptor')
        if type(d.get('version'))!=int or not 1<=d['version']<=1024 or d.get('model') not in ('stamp','mixer') or not isinstance(d.get('tip'),dict): raise ValueError('Unsupported portable descriptor')
        ex=d.get('experiment')
        if isinstance(ex,dict)and ('fill'in ex or 'patternPolicy'in ex):
            bh=d.get('behavior',{});tip=d.get('tip',{});render=bh.get('rendering',{})
            if depth or d['version']<158 or ex.get('fill')!='canvasPattern'or ex.get('patternPolicy')!='captured-world-repeat-v1'or set(ex)!={'version','displaceEnabled','displace','speedEnabled','speed','smoothingEnabled','smoothing','winding','hardEdge','fill','patternPolicy'}or ex.get('version')!=1 or any(type(ex[k])is not bool for k in('displaceEnabled','speedEnabled','smoothingEnabled','winding','hardEdge'))or any(type(ex[k])not in(int,float)or not math.isfinite(ex[k])or not 0<=ex[k]<=hi for k,hi in [('displace',100),('speed',100),('smoothing',1000)])or d.get('model')!='stamp'or d.get('paperInteraction')!=0 or tip.get('kind')!='round'or tip.get('aspect')!=1 or 'profile'in tip or any(k not in('version','rendering')for k in bh)or bh.get('version')!=2 or render.get('accumulation')!='directOver'or render.get('blendMode')!='normal'or render.get('wetEdges',0)!=0 or render.get('burntEdges',0)!=0 or any(k in d for k in('mixer','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet','deform','filter','clone','mypaint','tangentNormal')):raise ValueError('Invalid portable CurrentPattern158 scope')

        from captured_bristle import validate_portable_bristle
        validate_portable_bristle(d,trusted_raw_assets)
        h=d.get('bristle');initial=h.get('initialization')if isinstance(h,dict)else None
        if isinstance(initial,dict)and initial.get('resizePolicy')=='source-area143-v1'and asset_sizes.get(initial.get('sourceMask'))!=initial.get('sourceSide'):raise ValueError('Bristle143 source asset dimensions missing/mismatched')
        validate_portable_mixer(d)
        if depth and d.get('behavior',{}).get('rendering',{}).get('blendMode')in('hardMixPhotoshop','kritaHardMix'):raise ValueError('Photoshop Hard Mix is root-only')
        tip=d['tip']
        validate_portable_profile(d,parent=parent)
        from clone_projection149 import validate_clone_projection149
        validate_clone_projection149(d,depth)
        validate_clone_healing152(d,depth)
        validate_legacy_color_smudge_overlay154(d,depth)
        validate_legacy_color_smudge_minmax172(d,depth)
        validate_legacy_color_smudge_dodge_burn176(d,depth)
        validate_legacy_color_smudge_arithmetic175(d,depth)
        from canonical_effect_scopes import validate_canonical_effect_scopes
        validate_canonical_effect_scopes(d,depth)
        validate_pixel_original_hsv150(d,depth)
        validate_pixel_original_dual151(d,depth)
        def policy_controls(v):
            if isinstance(v,dict):return ([v]if isinstance(v.get('combine'),dict)and v['combine'].get('policy')=='native-scatter-v1'else[])+[c for child in v.values()for c in policy_controls(child)]
            return [c for child in v for c in policy_controls(child)]if isinstance(v,list)else[]
        native_scatter=policy_controls(d)
        if native_scatter:
            behavior=d.get('behavior',{})
            if not isinstance(behavior,dict)or not isinstance(behavior.get('modulations'),dict):raise ValueError('Native scatter expression requires one scatter target')
            allowed=behavior['modulations'].get('scatter',[]);scatter=d.get('scatter',{})
            if len(native_scatter)!=1 or not isinstance(allowed,list)or len(allowed)!=1 or depth or type(d.get('version'))not in(int,float)or d['version']<148 or d.get('model')!='stamp'or not isinstance(scatter,dict)or not isinstance(scatter.get('radius'),(int,float))or not 0<=scatter['radius']<=4 or any(not any(c is a for a in allowed)or c['combine'].get('constant')!=scatter['radius']for c in native_scatter)or behavior.get('dual')or any(k in d for k in('mixer','spray','bristle','sketch','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')):raise ValueError('Native scatter expression requires root Pixel148')

        from spray_wash133 import validate_spray_wash133
        validate_spray_wash133(d,depth)
        from krita_spray import validate_spray_source146
        validate_spray_source146(d,depth)
        if depth and isinstance(d.get('filter'),dict) and d['filter'].get('kind')in('invert','desaturate','posterize'):raise ValueError('Portable Posterize filter is root-only'if d['filter'].get('kind')=='posterize'else'Portable Desaturate filter is root-only'if d['filter'].get('kind')=='desaturate'else'Portable Invert filter is root-only')
        if d.get('sketch',{}).get('mode')=='mask'and d.get('sketch',{}).get('maskSignal')!='procedural-standard-v1':
            dims=d['sketch']['maskSize'];w,h=dims;longest=max(dims);side=2**math.ceil(math.log2(max(2,longest)))
            if longest==side and((side-w)%2 or(side-h)%2):side*=2
            bounds={'x':((side-w)//2+(w-longest)/2)/side,'y':((side-h)//2+(h-longest)/2)/side,'width':longest/side,'height':longest/side}
            if depth or side>256 or asset_sizes.get(tip.get('mask'))!=side or tip.get('maskBounds')!=bounds:raise ValueError('Portable Sketch101 root mask geometry differs')
            masks=tip.get('animation',{}).get('frames',[tip['mask']])if d['sketch'].get('maskSignal')=='gih-alpha-v1'else[tip['mask']]
            for mask in masks:
                if asset_sizes.get(mask)!=side:raise ValueError('Sketch174 frame size differs')
                raw=trusted_raw_assets[mask];ox=(side-w)//2;oy=(side-h)//2
                if any(raw[y*side+x]for y in range(side)for x in range(side)if x<ox or x>=ox+w or y<oy or y>=oy+h):raise ValueError('Nonzero portable Sketch101 padding')
        validate_sequential_xy_policy(d,depth)
        validate_stroke_input_policy(d,depth,parent)
        validate_independent_pair_assets(d,asset_sizes)
        profile=tip.get('profile',{})
        if depth and tip.get('autoNoise') is not None and profile.get('kind')in('gaussian2D','curveRectangle','curveRectangleSoftness'):raise ValueError('Rectangle Auto-mask noise is root-only')
        if profile.get('kind')in('radialCurve','radialCurveSoftness','curveRectangle','curveRectangleSoftness'):
            size=asset_sizes.get(profile['lookup'],0)
            if size<4 or size*size<(8 if profile['kind']in('radialCurveSoftness','curveRectangleSoftness')else 4)*(profile['resolution']+2):
                raise ValueError('Missing or undersized portable radial lookup asset')
        behavior=d.get('behavior',{})
        if not isinstance(behavior,dict):raise ValueError('Invalid portable behavior')
        # A valid standalone child does not ensure the selected ROOT captures speed.
        child=behavior.get('dual',{}).get('brush',{}) if isinstance(behavior.get('dual',{}),dict) else {}
        child_tip=child.get('tip',{}) if isinstance(child,dict) else {}
        own_animation=tip.get('animation',{});child_animation=child_tip.get('animation',{}) if isinstance(child_tip,dict) else {}
        if isinstance(child_animation,dict)and child_animation.get('mode')=='dimensions':raise ValueError('Multidimensional GIH secondary is unsupported')
        validate_dimensions(d,depth)
        if isinstance(child_animation,dict)and child_animation.get('mode')=='angular':raise ValueError('Angular GIH secondary is unsupported')
        if (isinstance(own_animation,dict)and own_animation.get('mode')=='velocity')or(isinstance(child_animation,dict)and child_animation.get('mode')=='velocity'):
            speed=behavior.get('speedInput')
            if d['version']<92 or not isinstance(speed,dict) or speed!={'version':1,'space':'view','maximum':30,'estimator':'grafettoEMA30ms'} or type(speed.get('version'))is not int or type(speed.get('maximum'))not in(int,float):raise ValueError('GIH velocity requires root captured speedInput30')
        validate_variable_gih_descriptor(d,asset_sizes)
        if is_sensor_original_rgba119(d):
            for index,row in enumerate(d['tip']['animation']['geometry']['frames']):
                padding_ids=[d['tip']['animation']['frames'][index],*d['tip']['color']['frames'][index]];w=row['sourceWidth'];h=row['sourceHeight'];side=asset_sizes[padding_ids[0]];ox=(side-w)//2;oy=(side-h)//2
                for aid in padding_ids:
                    raw=trusted_raw_assets[aid]
                    # Inspect padding only: no Python per-pixel loop over the source interior.
                    outside=bool((oy and any(raw[:oy*side])) or (oy+h<side and any(raw[(oy+h)*side:])))
                    if not outside and (ox or ox+w<side):
                        outside=any(any(raw[y*side:y*side+ox]) or any(raw[y*side+ox+w:(y+1)*side]) for y in range(oy,oy+h))
                    if outside:raise ValueError('Nonzero portable119 original RGBA padding')
        if any('lightnessStrength' in behavior.get(key,{}) for key in ('dynamics','modulations')):
            if d['version']<90 or d['model']!='stamp' or tip.get('material',{}).get('kind')!='lightness' or any(k in d for k in ['spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal']):raise ValueError('Invalid portable Lightness Strength target')
            for section in ('dynamics','modulations'):
                controls=behavior.get(section,{})
                if 'lightnessStrength' in controls:validate_portable_dynamics([controls['lightnessStrength']] if section=='dynamics' else controls['lightnessStrength'])
        def has_absolute_response(v):
            if isinstance(v,dict):return isinstance(v.get('combine'),dict)and bool(v['combine'].get('absolute'))or any(has_absolute_response(x)for x in v.values())
            return isinstance(v,list)and any(has_absolute_response(x)for x in v)
        if has_absolute_response(d)and 'strokeInput'not in behavior:raise ValueError('Absolute response requires recorded source input')
        mirror=behavior.get('mirror')
        if mirror is not None:
            if depth and d.get('hatching') is not None:raise ValueError('Portable Hatching Mirror is root-only')
            if d.get('hatching') is not None and d['version']<94:raise ValueError('Portable Hatching Mirror requires revision94')
            if (not isinstance(mirror,dict)or set(mirror)-{'horizontal','vertical','value','dynamics'}
                    or type(mirror.get('horizontal'))is not bool or type(mirror.get('vertical'))is not bool
                    or not(mirror['horizontal']or mirror['vertical'])or type(mirror.get('value'))not in(int,float)
                    or not math.isfinite(mirror['value'])or not 0<=mirror['value']<=1):raise ValueError('Invalid portable mirror')
            if 'dynamics'in mirror:validate_portable_dynamics(mirror['dynamics'])
        if d.get('model')=='mixer'and d['version']>=129 and 'timing'in behavior and not legacy_smudge_timing_scope(d) and not deform_timer160_scope(d):raise ValueError('Invalid portable legacy Color Smudge129 timing scope')
        timing=behavior.get('timing')
        if timing is not None:
            if (depth>0 or not isinstance(timing,dict) or set(timing)-{'version','rate','ignoreDistanceSpacing','rateDynamics'}
                    or type(timing.get('version'))is not int or timing['version']!=1
                    or type(timing.get('rate'))not in(int,float) or not math.isfinite(timing['rate'])or not 0<=timing['rate']<=1000
                    or type(timing.get('ignoreDistanceSpacing'))is not bool):raise ValueError('Invalid portable timing policy')
            if 'rateDynamics'in timing:
                validate_portable_dynamics(timing['rateDynamics'])
                def refresh_control(c):
                    if c.get('combine'):
                        group=c['combine'];leaves=group['scaling']+group['additive'];return group.get('absolute')is None and d['version']>=81 and all(refresh_control(v)for v in leaves)and any(v.get('randomSource',{}).get('kind')=='grafettoSourceTime-v1'for v in leaves)
                    return c['jitter']==0 and(c['control']in('pressure','off')or d['version']>=81 and c['control']=='random'and c.get('randomSource',{}).get('kind')=='grafettoSourceTime-v1')
                if not 1<=len(timing['rateDynamics'])<=4 or not all(refresh_control(c)for c in timing['rateDynamics']):raise ValueError('Unsupported portable Rate controls')
        def validate_times(value):
            if isinstance(value,dict):
                if value.get('control')=='time'or value.get('randomSource',{}).get('kind')=='grafettoSourceTime-v1':
                    validate_portable_dynamics([value])
                    if value.get('randomSource',{}).get('kind')=='grafettoSourceTime-v1'and(d['version']<81 or(d['model']!='stamp'and not legacy_smudge_timing_scope(d))):raise ValueError('Invalid source-time random revision')
                for child in value.values():validate_times(child)
            elif isinstance(value,list):
                for child in value:validate_times(child)
        validate_times(behavior)
        if 'softness' in behavior:
            value=behavior['softness']
            if (type(value)not in(int,float)or not math.isfinite(value)or not 0<=value<=1
                    or d.get('model')!='stamp'or tip.get('profile',{}).get('kind')not in('standard','radialCurveSoftness','curveRectangleSoftness')):
                raise ValueError('Invalid standard-mask softness')
        for section in ('dynamics','modulations'):
            controls=behavior.get(section,{}) if isinstance(behavior,dict) else {}
            if isinstance(controls,dict) and 'softness' in controls:
                if d.get('model')!='stamp'or tip.get('profile',{}).get('kind')not in('standard','radialCurveSoftness','curveRectangleSoftness'):raise ValueError('Softness response requires standard mask')
                validate_portable_dynamics([controls['softness']]if section=='dynamics'else controls['softness'])
            if isinstance(controls,dict) and 'sharpness' in controls:
                if 'alphaThreshold' not in tip: raise ValueError('Sharpness response requires alpha threshold')
                validate_portable_dynamics([controls['sharpness']] if section=='dynamics' else controls['sharpness'])
        if tip.get('kind') not in ('bitmap','round','procedural') or (tip.get('kind')=='bitmap' and tip.get('mask') not in ids): raise ValueError('Missing portable tip asset')
        if 'alphaThreshold' in tip:
            threshold=tip['alphaThreshold']
            if (not isinstance(threshold,dict) or set(threshold)!={'value','softness'}
                    or any(type(threshold.get(key)) not in (int,float) or not math.isfinite(threshold[key]) or not 0<=threshold[key]<=1 for key in ('value','softness'))):
                raise ValueError('Invalid portable mask threshold')
        if 'animation' in tip:
            animation=tip['animation']
            if not isinstance(animation,dict) or set(animation)-{'mode','frames','geometry','rank','cursorPolicy','roundingPolicy','dimensions','randomPolicy'} or not {'mode','frames'}<=set(animation) or animation['mode'] not in ('random','incremental','constant','pressure','velocity','angular','xtilt','ytilt','dimensions'): raise ValueError('Invalid portable tip animation')
            if animation['mode']!='dimensions'and 'randomPolicy'in animation:raise ValueError('Unexpected portable GIH random policy')
            if animation['mode']!='dimensions'and 'dimensions'in animation:raise ValueError('Unexpected portable dimensions')
            if animation['mode'] in ('constant','pressure') and d['version']<91:raise ValueError('GIH sensor selection requires revision91')
            if animation['mode']=='velocity' and d['version']<92:raise ValueError('GIH velocity requires revision92')
            if animation['mode']in('xtilt','ytilt'):
                if(depth or d['version']<112 or animation.get('roundingPolicy')!='qt5-half-up-v1' or type(animation.get('rank'))is not int or not 2<=animation['rank']<=256 or 'cursorPolicy'in animation or 'geometry'in animation and d['version']<118 or d.get('model')!='stamp' or('color'in tip and not(is_sensor_original_rgba119(d)or is_sensor_original_rgba121(d)or is_equal_gradient_gih125(d)or is_unequal_gradient_gih126(d)))or any(k in tip and(k!='material'or not(is_equal_lightness_gih123(d)or is_unequal_lightness_gih124(d)))for k in('material','profile','imageSampling','autoNoise','autoShape')) or any(k in d for k in('wet','texture','mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')) or behavior.get('dual') or behavior.get('erase') or behavior.get('timing') or behavior.get('sequentialRandom') or behavior.get('strokeInput',{}).get('fanCorners') or behavior.get('rendering',{}).get('blendMode')!='normal' or behavior.get('rendering',{}).get('accumulation')!='directOver' or behavior.get('rendering',{}).get('wetEdges',0)!=0 or behavior.get('rendering',{}).get('burntEdges',0)!=0):raise ValueError('Invalid portable tilt GIH scope/policy')
            elif animation['mode']!='dimensions'and 'roundingPolicy'in animation:raise ValueError('Unexpected portable GIH rounding policy')
            if animation['mode']=='angular':
                if (depth or d['version']<110 or animation.get('cursorPolicy')!='first-request-v1' or type(animation.get('rank'))is not int or not 2<=animation['rank']<=256 or 'geometry'in animation and d['version']<118 or d.get('model')!='stamp' or('color'in tip and not(is_sensor_original_rgba119(d)or is_sensor_original_rgba121(d)or is_equal_gradient_gih125(d)or is_unequal_gradient_gih126(d)))or any(k in tip and(k!='material'or not(is_equal_lightness_gih123(d)or is_unequal_lightness_gih124(d)))for k in('material','profile','imageSampling','autoNoise','autoShape')) or any(k in d for k in('wet','texture','mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')) or behavior.get('dual') or behavior.get('erase') or behavior.get('timing') or behavior.get('sequentialRandom') or behavior.get('rendering',{}).get('blendMode')!='normal' or behavior.get('rendering',{}).get('accumulation')!='directOver' or behavior.get('rendering',{}).get('wetEdges',0)!=0 or behavior.get('rendering',{}).get('burntEdges',0)!=0 or behavior.get('strokeInput')!={'version':1,'initialDirection':'cursorHistory'}):raise ValueError('Invalid portable angular GIH scope/cursor policy')
            elif animation['mode']!='dimensions'and 'cursorPolicy'in animation:raise ValueError('Unexpected portable GIH cursor policy')
            if animation['mode']in('pressure','velocity'):

                maximum=256 if animation['mode']=='velocity'else 2147483647
                if type(animation.get('rank')) is not int or not 1<=animation['rank']<=maximum:raise ValueError('Invalid portable GIH selector rank')
            elif animation['mode']not in('dimensions','angular','xtilt','ytilt')and 'rank'in animation:raise ValueError('Unexpected portable GIH rank')
            frames=animation['frames']
            if not isinstance(frames,list) or not (1 if animation['mode']in('angular','dimensions')else 2)<=len(frames)<=256 or frames[0]!=tip.get('mask') or any(not isinstance(frame,str) or frame not in ids for frame in frames): raise ValueError('Missing portable animation asset')
            if 'geometry'not in animation and len({asset_sizes[frame] for frame in frames})!=1: raise ValueError('Portable animation assets differ in size')
        if 'color' in tip:
            color=tip['color'];frames=tip.get('animation',{}).get('frames',[tip.get('mask')])
            def tuple_ids(value):return isinstance(value,list) and len(value)==3 and all(isinstance(a,str) and a in ids for a in value)
            spray_image=d.get('model')=='stamp'and d.get('version',0)>=76 and d.get('spray',{}).get('particle',{}).get('image')is True
            pixel_gradient=d.get('model')=='stamp'and 'spray'not in d and isinstance(color,dict)and 'gradient'in color
            if pixel_gradient and(depth or d['version']<97 or 'animation'in tip and not(is_equal_gradient_gih125(d)or is_unequal_gradient_gih126(d)) or asset_sizes.get(tip.get('mask'),100000)>512 or (behavior.get('rendering',{}).get('accumulation')!='directOver'and not pixel_gradient_wash138_scope(d))or behavior.get('rendering',{}).get('blendMode')!='normal'):raise ValueError('Invalid portable Pixel gradient combination')
            pixel_image=d.get('model')=='stamp'and 'spray'not in d and d.get('version',0)>=84 and isinstance(color,dict)and ('planes'in color or pixel_gradient)
            if pixel_original_dual151_scope(d):
                child=d['behavior']['dual']['brush'];ct=child['tip']
                if asset_sizes.get(tip.get('mask'),100000)>512 or ct.get('kind')=='bitmap'and asset_sizes.get(ct.get('mask'),100000)>512:raise ValueError('Original RGBA ALPHAMASK151 physical planes exceed512')
            if pixel_image and(any(k in tip for k in('profile','autoNoise','autoShape','imageSampling','material'))or ('dual'in behavior and not pixel_original_dual151_scope(d)or 'edgeBleed'in behavior or 'colorAdjustment'in behavior and not(pixel_original_hsv150_scope(d)or pixel_original_dual151_scope(d)))or any(behavior.get('dynamics',{}).get(k)or behavior.get('modulations',{}).get(k)for k in('hue','saturation','brightness'))):raise ValueError('Invalid portable Pixel original RGBA combination')
            if (not(d.get('model')=='mixer'and d.get('mixer',{}).get('algorithm')=='krita-stamp'or spray_image or pixel_image) or tip.get('kind')!='bitmap'
                    or 'material' in tip or 'imageSampling' in tip or not isinstance(color,dict)):
                raise ValueError('Invalid portable colour material')
            if 'gradient' in color:
                g=color['gradient']
                if spray_image or pixel_image and not pixel_gradient or set(color)!={'gradient'} or not isinstance(g,dict) or set(g)-{'gray','grayFrames','sampling'} or not isinstance(g.get('gray'),str) or g['gray'] not in ids:raise ValueError('Invalid portable gradient material')
                if 'sampling'in g and(not pixel_gradient or d['version']<100 or g['sampling']!='filteredGray-v1'):raise ValueError('Invalid filtered-gray gradient sampling policy')
                colors=g.get('grayFrames',[g['gray']])
                if not isinstance(colors,list) or any(not isinstance(a,str) or a not in ids for a in colors) or ('animation' in tip and ('grayFrames' not in g or len(colors)!=len(frames) or colors[0]!=g['gray'])) or ('animation' not in tip and 'grayFrames' in g):raise ValueError('Invalid portable gradient frames')
                paired=frames+colors
            else:
                if set(color)-{'planes','frames','adjustmentPolicy'} or not tuple_ids(color.get('planes')):raise ValueError('Invalid portable RGB material')
                colors=color.get('frames',[color['planes']])
                if (('animation' in tip and ('frames' not in color or not isinstance(colors,list) or len(colors)!=len(frames) or colors[0]!=color['planes']))
                        or ('animation' not in tip and 'frames' in color) or not all(tuple_ids(frame) for frame in colors)):
                    raise ValueError('Invalid portable RGB frames')
                paired=frames+[aid for frame in colors for aid in frame]
            if 'geometry'not in tip.get('animation',{}) and len({asset_sizes[aid] for aid in paired})!=1:raise ValueError('Portable colour plane sizes differ')
            if pixel_gradient and 'animation'in tip and(depth or not(is_equal_gradient_gih125(d)or is_unequal_gradient_gih126(d))or any(asset_sizes[aid]>512 for aid in paired)):raise ValueError('Equal Gradient sensor requires125 closed scope and side<=512')
            if 'gradient' in d.get('mixer',{}).get('foreground',{}):raise ValueError('Image stamp does not use a foreground gradient')
        if 'material' in tip:
            material=tip['material']
            if ((d['model']!='stamp' and not (d['model']=='mixer' and d.get('mixer',{}).get('algorithm')=='krita-mask' and d.get('mixer',{}).get('paintThickness'))) or tip.get('kind')!='bitmap' or not isinstance(material,dict)
                    or set(material)-{'kind','gray','grayFrames','strength'} or material.get('kind')!='lightness'
                    or not isinstance(material.get('gray'),str) or material['gray'] not in ids
                    or type(material.get('strength')) not in (int,float) or not math.isfinite(material['strength']) or not 0<=material['strength']<=1):
                raise ValueError('Invalid portable lightness material')
            alpha_frames=tip.get('animation',{}).get('frames',[tip.get('mask')])
            gray_frames=material.get('grayFrames',[material['gray']])
            if ('animation' in tip and ('grayFrames' not in material or not isinstance(gray_frames,list) or len(gray_frames)!=len(alpha_frames)
                    or gray_frames[0]!=material['gray'])) or ('animation' not in tip and 'grayFrames' in material):
                raise ValueError('Portable lightness animation mismatch')
            if any(not isinstance(frame,str) or frame not in ids for frame in gray_frames): raise ValueError('Missing portable lightness asset')
            if is_unequal_lightness_gih124(d):
                if any(asset_sizes[alpha]!=asset_sizes[gray_frames[index]]for index,alpha in enumerate(alpha_frames)):raise ValueError('Unequal Lightness124 paired dimensions differ')
            elif len({asset_sizes[frame] for frame in alpha_frames+gray_frames})!=1: raise ValueError('Portable lightness plane dimensions differ')
        if 'maskBounds' in tip:
            bounds=tip['maskBounds']
            if not isinstance(bounds,dict) or set(bounds)!={'x','y','width','height'} or any(type(v) not in (int,float) or not math.isfinite(v) for v in bounds.values()): raise ValueError('Invalid portable mask bounds')
            if bounds['x']<0 or bounds['y']<0 or bounds['width']<=0 or bounds['width']!=bounds['height'] or bounds['x']+bounds['width']>1 or bounds['y']+bounds['height']>1: raise ValueError('Portable mask bounds outside asset')
        if 'imageSampling' in tip:
            sampling=tip['imageSampling']
            if (tip.get('kind')!='bitmap' or 'material' in tip or not isinstance(sampling,dict)
                    or set(sampling)!={'kind','signal','sourceRect'} or sampling['kind']!='integer-pyramid'
                    or sampling['signal']!='inverse-gray' or not isinstance(sampling['sourceRect'],dict)):
                raise ValueError('Invalid portable integer image policy')
            rect=sampling['sourceRect']
            if (set(rect)!={'x','y','width','height'} or any(type(v)!=int for v in rect.values())
                    or not 0<=rect['x']<=2047 or not 0<=rect['y']<=2047
                    or not 1<=rect['width']<=2048 or not 1<=rect['height']<=2048):
                raise ValueError('Invalid portable integer image source rectangle')
            frames=tip.get('animation',{}).get('frames',[tip.get('mask')])
            if any(frame not in asset_sizes or rect['x']+rect['width']>asset_sizes[frame]
                   or rect['y']+rect['height']>asset_sizes[frame] for frame in frames):
                raise ValueError('Portable integer image source exceeds asset')
        if 'texture' in d and (not isinstance(d['texture'],dict) or d['texture'].get('id') not in ids or d['texture'].get('eraseId',d['texture'].get('id')) not in ids): raise ValueError('Missing portable grain asset')
        behavior=d.get('behavior',{})
        if not isinstance(behavior,dict): raise ValueError('Invalid portable behavior')
        texture=d.get('texture',{})
        if d.get('model')=='mixer'and isinstance(texture,dict)and'eraseId'in texture:
            if depth or not smudge_texture_erase131_scope(d)or asset_sizes.get(texture.get('id'))!=asset_sizes.get(texture.get('eraseId'))or any(asset_sizes.get(a,513)>512 for a in(tip.get('mask'),texture.get('id'),texture.get('eraseId'))):raise ValueError('Invalid portable Texture erase131')
        if isinstance(texture,dict)and 'material'in texture:
            from texture_lightness_wash171 import texture_lightness_wash171_scope
            from texture_gradient_wash180 import texture_gradient_wash180_scope
            m=texture['material'];size=asset_sizes.get(texture.get('id'));grid=texture.get('patternSize');render=behavior.get('rendering',{})
            if (depth or not isinstance(m,dict)or set(m)!={'kind','alpha'}or m.get('kind')not in('lightness','gradient')or d['version']<(111 if m.get('kind')=='gradient'else 108)or m.get('alpha')not in ids or size!=asset_sizes.get(m.get('alpha'))or 'application'in texture or 'eraseId'in texture or d.get('model')!='stamp'or tip.get('kind')!='bitmap'or any(k in tip for k in('animation','color','material','imageSampling','profile','autoNoise','autoShape'))or any(k in d for k in('mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal','wet'))or d.get('paperInteraction')!=0 or behavior.get('dual')or behavior.get('erase')or 'edgeBleed'in behavior or 'grain'in behavior or behavior.get('wetMix')or render.get('blendMode')!='normal'or(render.get('accumulation')!='directOver'and not texture_lightness_wash171_scope(d)and not texture_gradient_wash180_scope(d))or not isinstance(grid,dict)or set(grid)!={'width','height'}or any(type(grid[k])!=int or not 1<=grid[k]<=size for k in('width','height'))):
                raise ValueError('Invalid portable Texture Lightness108')
            for aid in(texture['id'],m['alpha']):
                plane=trusted_raw_assets[aid]
                if any(plane[y*size+x]for y in range(size)for x in range(size)if x>=grid['width']or y>=grid['height']):raise ValueError('Nonzero portable Lightness108 pattern padding')
        if isinstance(texture,dict) and isinstance(texture.get('application'),dict) and texture['application'].get('mode')in('colorDodge','colorBurn','hardMixPhotoshop','hardMixSofterPhotoshop'):
            application=texture['application']
            if set(application)!={'mode','soft'} or type(application.get('soft'))is not bool:raise ValueError('Invalid Texture105 application')
            if depth or d['version']<105 or behavior.get('dual'):raise ValueError('Texture105 is root-only at revision105')
            if d.get('model')=='stamp' and any(k in d for k in('mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')):raise ValueError('Texture105 requires Pixel or modern MASK')
        if d.get('model')=='mixer' and isinstance(texture,dict) and isinstance(texture.get('application'),dict) and texture['application'].get('mode')in('darken','overlay','linearDodge','linearBurn','colorDodge','colorBurn','hardMixPhotoshop','hardMixSofterPhotoshop'):
            m=d.get('mixer',{});application=texture['application']
            if (depth or type(d.get('version'))!=int or d['version']<103 or set(application)!={'mode','soft'} or type(application['soft'])!=bool or m.get('algorithm')!='krita-mask' or m.get('source')!='previousCanvas' or m.get('colorRateComposite')is not None or m.get('paintThickness')is not None or tip.get('kind')!='bitmap' or any(k in tip for k in('animation','color','material')) or behavior.get('dual') or behavior.get('erase') or behavior.get('rendering',{}).get('blendMode')!='normal' or texture.get('eraseId')):
                raise ValueError('Invalid portable modern texture103 Color Smudge')

        if 'spacing' in behavior:
            spacing=behavior['spacing']
            if (not isinstance(spacing,dict) or set(spacing)-{'mode','coefficient','dynamics','isotropic','axisScale','angleOffset'}
                    or spacing.get('mode') not in ('diameter','kritaAuto')
                    or type(spacing.get('coefficient')) not in (int,float) or not math.isfinite(spacing['coefficient'])
                    or not (0 if spacing['mode']=='diameter' else .001)<=spacing['coefficient']<=100
                    or ('isotropic' in spacing and type(spacing['isotropic']) is not bool)):
                raise ValueError('Invalid portable spacing profile')
            if 'axisScale' in spacing:
                axes=spacing['axisScale']
                if (not isinstance(axes,dict) or set(axes)!={'x','y'} or any(type(v) not in (int,float) or not math.isfinite(v) or not 0<v<=2 for v in axes.values())):
                    raise ValueError('Invalid portable spacing axis scale')
            if 'angleOffset' in spacing and (type(spacing['angleOffset']) not in (int,float) or not math.isfinite(spacing['angleOffset']) or not -math.pi<=spacing['angleOffset']<=math.pi):
                raise ValueError('Invalid portable spacing angle offset')
            if 'dynamics' in spacing: validate_portable_dynamics(spacing['dynamics'])
        if 'dual' in behavior:
            if not isinstance(behavior['dual'],dict): raise ValueError('Invalid portable dual component')
            child=behavior['dual'].get('brush')
            if isinstance(child,dict)and isinstance(child.get('behavior'),dict)and 'strokeInput'in child['behavior']and not independent_drawing_angle_pair(d):raise ValueError('Independent DrawingAngle requires matching120 root/child policies')
            validate_descriptor(child,depth+1,d)
    for brush in brushes:
        if not isinstance(brush,dict) or not isinstance(brush.get('name'),str) or len(brush['name'])>256 or not isinstance(brush.get('source'),str) or len(brush['source'])>256 or not isinstance(brush.get('warnings'),list) or len(brush['warnings'])>100 or any(not isinstance(w,str) or len(w)>2000 for w in brush['warnings']): raise ValueError('Invalid portable brush metadata')
        validate_descriptor(brush.get('descriptor'))
        bid=brush['descriptor']['id']
        if bid in seen: raise ValueError('Duplicate portable brush ID')
        seen.add(bid)
    # Validate everything before writing any raster or mutating the catalog.
    for asset,raw in validated:
        (catalog.output/asset['file']).write_bytes(raw);catalog.assets[asset['id']]=asset
    catalog.brushes.extend(brushes);catalog.skipped.extend(skipped)


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('sources',type=Path,nargs='+'); ap.add_argument('--output',type=Path,required=True)
    args=ap.parse_args(); catalog=Catalog(args.output)
    for path in args.sources:
        if path.name.endswith('.grafetto-brushes.json'): portable_bundle(path,catalog)
        elif path.suffix.lower()=='.myb':
            from mypaint_import import mypaint_preset
            preview=path.with_name(path.stem+'_prev.png')
            catalog.brushes.append(mypaint_preset(path.read_bytes(),path.name,catalog,preview.read_bytes()if preview.exists()else None))
        elif path.suffix.lower()=='.abr': photoshop(path,catalog)
        elif path.suffix.lower() in ('.brush','.brushset'): procreate(path,catalog)
        elif path.suffix.lower() in ('.kpp','.bundle'):
            from krita_import import convert_krita
            convert_krita(path,catalog)
        else: ap.error('Unsupported extension: '+path.suffix)
    result=catalog.write();print(json.dumps({'brushes':len(result['brushes']),'assets':len(result['assets']),'skipped':len(result['skipped'])}))

if __name__=='__main__': main()
