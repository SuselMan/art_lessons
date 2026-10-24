#!/usr/bin/env python3
"""Offline, bounded brush archive reader. Pillow is used only for raster conversion."""
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
    for control in controls:
        if (not isinstance(control,dict) or set(control)-{'control','minimum','jitter','strength','fade','curve'}
                or control.get('control') not in ('off','pressure','tilt','speed','fade','direction','initialDirection','tiltElevation','tiltX','tiltY','azimuth','tiltDirection')
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
    def finite(value,low=0,high=1):
        return type(value) in (int,float) and math.isfinite(value) and low<=value<=high
    if (descriptor['model']!='mixer' or not isinstance(mixer,dict)
            or set(mixer)-{'load','pickup','strength','initialLoad','smearAlpha','source','pickupDynamics','sampling','foreground'}
            or any(not finite(mixer.get(key)) for key in ('load','pickup','strength'))
            or ('initialLoad' in mixer and not finite(mixer['initialLoad']))
            or ('smearAlpha' in mixer and type(mixer['smearAlpha']) is not bool)
            or ('source' in mixer and mixer['source']!='previousCanvas')):
        raise ValueError('Invalid portable mixer')
    if not isinstance(descriptor.get('behavior',{}),dict): raise ValueError('Invalid portable mixer behavior')
    if mixer.get('source')=='previousCanvas' and (mixer['load']!=0 or mixer.get('initialLoad')!=0 or descriptor.get('behavior',{}).get('wetMix') is not None):
        raise ValueError('Invalid portable previous-canvas source')
    if 'pickupDynamics' in mixer: validate_portable_dynamics(mixer['pickupDynamics'])
    if 'sampling' in mixer:
        sampling=mixer['sampling']
        if (not isinstance(sampling,dict) or set(sampling)-{'mode','radius','radiusDynamics'}
                or mixer.get('source')!='previousCanvas' or sampling.get('mode')!='uniformMean' or not finite(sampling.get('radius'),0,3)):
            raise ValueError('Invalid portable mixer sampling')
        if 'radiusDynamics' in sampling: validate_portable_dynamics(sampling['radiusDynamics'])
    if 'foreground' in mixer:
        foreground=mixer['foreground']
        if (not isinstance(foreground,dict) or set(foreground)-{'rate','dynamics'} or mixer.get('source')!='previousCanvas'
                or not finite(foreground.get('rate'))):
            raise ValueError('Invalid portable mixer foreground')
        if 'dynamics' in foreground: validate_portable_dynamics(foreground['dynamics'])


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
    asset_sizes={asset['id']:asset['size'] for asset,_ in validated}
    def validate_descriptor(d,depth=0):
        if not isinstance(d,dict) or depth>1 or not isinstance(d.get('id'),str) or not re.fullmatch(r'imported-[a-f0-9]{24}',d['id']): raise ValueError('Invalid portable descriptor')
        if type(d.get('version'))!=int or not 1<=d['version']<=1024 or d.get('model') not in ('stamp','mixer') or not isinstance(d.get('tip'),dict): raise ValueError('Unsupported portable descriptor')
        validate_portable_mixer(d)
        tip=d['tip']
        if tip.get('kind') not in ('bitmap','round') or (tip.get('kind')=='bitmap' and tip.get('mask') not in ids): raise ValueError('Missing portable tip asset')
        if 'animation' in tip:
            animation=tip['animation']
            if not isinstance(animation,dict) or set(animation)!={'mode','frames'} or animation['mode'] not in ('random','incremental'): raise ValueError('Invalid portable tip animation')
            frames=animation['frames']
            if not isinstance(frames,list) or not 2<=len(frames)<=256 or frames[0]!=tip.get('mask') or any(not isinstance(frame,str) or frame not in ids for frame in frames): raise ValueError('Missing portable animation asset')
            if len({asset_sizes[frame] for frame in frames})!=1: raise ValueError('Portable animation assets differ in size')
        if 'material' in tip:
            material=tip['material']
            if (d['model']!='stamp' or tip.get('kind')!='bitmap' or not isinstance(material,dict)
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
            if len({asset_sizes[frame] for frame in alpha_frames+gray_frames})!=1: raise ValueError('Portable lightness plane dimensions differ')
        if 'maskBounds' in tip:
            bounds=tip['maskBounds']
            if not isinstance(bounds,dict) or set(bounds)!={'x','y','width','height'} or any(type(v) not in (int,float) or not math.isfinite(v) for v in bounds.values()): raise ValueError('Invalid portable mask bounds')
            if bounds['x']<0 or bounds['y']<0 or bounds['width']<=0 or bounds['width']!=bounds['height'] or bounds['x']+bounds['width']>1 or bounds['y']+bounds['height']>1: raise ValueError('Portable mask bounds outside asset')
        if 'texture' in d and (not isinstance(d['texture'],dict) or d['texture'].get('id') not in ids): raise ValueError('Missing portable grain asset')
        behavior=d.get('behavior',{})
        if not isinstance(behavior,dict): raise ValueError('Invalid portable behavior')
        if 'spacing' in behavior:
            spacing=behavior['spacing']
            if (not isinstance(spacing,dict) or set(spacing)-{'mode','coefficient','dynamics','isotropic'}
                    or spacing.get('mode') not in ('diameter','kritaAuto')
                    or type(spacing.get('coefficient')) not in (int,float) or not math.isfinite(spacing['coefficient'])
                    or not (0 if spacing['mode']=='diameter' else .001)<=spacing['coefficient']<=100
                    or ('isotropic' in spacing and type(spacing['isotropic']) is not bool)):
                raise ValueError('Invalid portable spacing profile')
            if 'dynamics' in spacing: validate_portable_dynamics(spacing['dynamics'])
        if 'dual' in behavior:
            if not isinstance(behavior['dual'],dict): raise ValueError('Invalid portable dual component')
            validate_descriptor(behavior['dual'].get('brush'),depth+1)
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
        elif path.suffix.lower()=='.abr': photoshop(path,catalog)
        elif path.suffix.lower() in ('.brush','.brushset'): procreate(path,catalog)
        elif path.suffix.lower() in ('.kpp','.bundle'):
            from krita_import import convert_krita
            convert_krita(path,catalog)
        else: ap.error('Unsupported extension: '+path.suffix)
    result=catalog.write();print(json.dumps({'brushes':len(result['brushes']),'assets':len(result['assets']),'skipped':len(result['skipped'])}))

if __name__=='__main__': main()
