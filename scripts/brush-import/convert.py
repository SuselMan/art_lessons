#!/usr/bin/env python3
"""Offline, bounded brush archive reader. Pillow is used only for raster conversion."""
import argparse
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

MAX_PIXELS = 64 * 1024 * 1024
IMPORTER_SCHEMA_VERSION = 1
IMPORTER_RENDERING_VERSION = 1

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
    if depth != 8: raise ValueError('Only 8-bit sampled ABR is supported')
    if compression == 0: return r.take(width*height)
    if compression != 1: raise ValueError('Unsupported ABR compression')
    sizes = [r.num('H') for _ in range(height)]
    return b''.join(packbits(r.take(n), width) for n in sizes)


def abr_sample(data, minor):
    r = Reader(data); key = r.take(r.num('B')).decode('ascii')
    if minor == 1:
        r.take(10); bounds = [r.num('i') for _ in range(4)]
        depth, compression = r.num('H'), r.num('B')
        w,h = bounds[3]-bounds[1],bounds[2]-bounds[0]
        return key, Image.frombytes('L',(w,h), read_pixels(r,w,h,depth,compression))
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


def read_abr(path):
    r = Reader(path.read_bytes()); major,minor = r.num('H'),r.num('H')
    if major != 6 or minor not in (1,2): raise ValueError('Supported ABR versions: 6.1, 6.2')
    samples, presets, errors = {}, [], []
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
        elif key == b'desc':
            d = Reader(body)
            if d.u32() != 16: raise ValueError('Unsupported ABR descriptor version')
            presets.extend(d.descriptor().get('Brsh',[]))
            if d.pos != len(body): raise ValueError('ABR descriptor trailing bytes')
        if r.pos < len(r.data): r.take((-size)%4)
    return samples,presets,errors


def number(value, fallback=0):
    if isinstance(value,dict): value = value.get('value',fallback)
    return float(value) if isinstance(value,(int,float)) and math.isfinite(value) else fallback


def clamp(value,low=0,high=1): return min(high,max(low,number(value)))


def descriptor(seed, mask):
    return {'id':'imported-'+hashlib.sha256(seed).hexdigest()[:24], 'version':1,
            'model':'stamp','category':'paint',
            'tip':{'kind':'bitmap','mask':mask,'hardness':0.7,'aspect':1,'rotation':'fixed','angle':0},
            'paperInteraction':0,'spacing':0.1,'flow':1,'flowPer':'stamp',
            'sizeByPressure':[[0,1],[1,1]],'flowByPressure':[[0,1],[1,1]],
            'opacityByPressure':[[0,1],[1,1]],'pressureSmoothingPx':0,'opacity':1}


def finalize_identity(d, seed):
    """Freeze identity only after every rendering field and asset hash is known."""
    rendering = {k: v for k, v in d.items() if k != 'id'}
    identity = {
        'schemaVersion': IMPORTER_SCHEMA_VERSION,
        'importerRenderingVersion': IMPORTER_RENDERING_VERSION,
        'sourceSettingsSha256': hashlib.sha256(seed).hexdigest(),
        'rendering': rendering,
    }
    canonical = json.dumps(identity, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')
    d['id'] = 'imported-' + hashlib.sha256(canonical).hexdigest()[:24]
    return d


class Catalog:
    def __init__(self, output):
        self.output = output; output.mkdir(parents=True,exist_ok=True)
        self.brushes, self.assets, self.skipped = [],{},[]
    def asset(self, image, warnings, invert=False, grain=False):
        if image.width*image.height > MAX_PIXELS: raise ValueError('Raster exceeds pixel limit')
        image.load()
        # Procreate shapes and grain are luminance maps, with white = coverage.
        # Alpha masks multiply luminance instead of replacing it.
        gray = image.convert('L')
        if 'A' in image.getbands():
            from PIL import ImageChops
            gray = ImageChops.multiply(gray,image.getchannel('A'))
        if invert: gray = ImageOps.invert(gray)
        longest = max(gray.size); size = max(2,min(2048,1 << (longest-1).bit_length()))
        if longest > 2048: warnings.append(f'Downsampled {gray.width}x{gray.height} to fit 2048')
        if grain:
            if gray.size != (size,size): warnings.append('Grain resampled to square power-of-two texture')
            gray = gray.resize((size,size),Image.Resampling.LANCZOS)
        else:
            ratio = min(1,size/longest)
            resized = gray.resize((max(1,round(gray.width*ratio)),max(1,round(gray.height*ratio))),Image.Resampling.LANCZOS)
            if resized.size != (size,size): warnings.append('Tip padded to square power-of-two; footprint includes transparent margin')
            gray = Image.new('L',(size,size)); gray.paste(resized,((size-resized.width)//2,(size-resized.height)//2))
        raw = gray.tobytes(); sha = hashlib.sha256(raw).hexdigest(); aid='asset:'+sha
        (self.output/(sha+'.bin')).write_bytes(raw)
        self.assets[aid]={'id':aid,'size':size,'file':sha+'.bin'}
        return aid
    def write(self):
        if sum(a['size']**2 for a in self.assets.values()) > 256*1024*1024:
            raise ValueError('Catalog raw assets exceed 256 MiB; convert a smaller selection')
        result={'schemaVersion':1,'brushes':self.brushes,'assets':list(self.assets.values()),'skipped':self.skipped}
        (self.output/'manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        return result


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


def procreate(path,catalog):
    with zipfile.ZipFile(path) as z:
        if sum(x.file_size for x in z.infolist()) > 1024*1024*1024: raise ValueError('Archive expands beyond 1 GiB')
        names=set(z.namelist())
        for entry in sorted(n for n in names if n.endswith('Brush.archive') and '/Sub' not in n):
            raw=z.read(entry); settings=resolve_archive(raw); prefix=entry[:-len('Brush.archive')]
            name=settings.get('name') or prefix.rstrip('/') or path.stem
            reasons=[]; warnings=['Procreate rendering is approximated; not pixel-identical. Wet Mix, tilt, taper, blend modes and moving grain are unsupported.']
            if prefix+'Shape.png' not in names: reasons.append('Missing embedded Shape.png; bundled resource: '+str(settings.get('bundledShapePath')))
            if settings.get('bundledGrainPath') and prefix+'Grain.png' not in names: reasons.append('Missing embedded grain: '+str(settings['bundledGrainPath']))
            if reasons: catalog.skipped.append({'name':name,'reasons':reasons}); continue
            if any(n.startswith(prefix+'Sub') for n in names): warnings.append('Dual brush secondary component omitted')
            if number(settings.get('shapeCount')): warnings.append('Shape count/count jitter not mapped; one primary stamp per dab')
            mask=catalog.asset(Image.open(io.BytesIO(z.read(prefix+'Shape.png'))),warnings, bool(settings.get('shapeInverted')))
            d=descriptor(raw,mask)
            d['spacing']=clamp(settings.get('plotSpacing',0.1),0.01,2)
            d['opacity']=clamp(settings.get('maxOpacity',1))
            d['flow']=clamp(settings.get('dynamicsGlazedFlow',1),0.01,1)
            warnings.append('Glazed flow and pressure response mapped approximately to Grafetto stamp model')
            d['tip']['angle']=number(settings.get('shapeAngle'))*math.pi
            d['tip']['rotation']='path' if settings.get('shapeAzimuth') else 'fixed'
            d['scatter']={'count':1,'radius':clamp(settings.get('plotJitter')),'scale':1,
                'sizeJitter':clamp(settings.get('dynamicsJitterSize')),
                'angleJitter':1 if settings.get('shapeRandomise') else clamp(settings.get('shapeScatter')),
                'flowJitter':clamp(settings.get('dynamicsJitterOpacity'))}
            for param,key in [('sizeByPressure','dynamicsPressureSize'),('opacityByPressure','dynamicsPressureOpacity')]:
                amount=clamp(settings.get(key)); floor=max(0.02,1-amount)
                curve=settings.get(key+'Curve',{}).get('points',[])
                points=[list(map(float,re.findall(r'-?\d+(?:\.\d+)?',p))) for p in curve if isinstance(p,str)]
                d[param]=[[clamp(x), floor+(1-floor)*clamp(y)] for x,y in points] if len(points)>=2 else [[0,floor],[1,1]]
            if prefix+'Grain.png' in names:
                aid=catalog.asset(Image.open(io.BytesIO(z.read(prefix+'Grain.png'))),warnings,bool(settings.get('textureInverted')),grain=True)
                d['texture']={'id':aid,'strength':clamp(settings.get('grainDepth',1)),'periodPx':clamp(256*number(settings.get('textureScale'),1),1,4096)}
                warnings.append('Grain scale, depth and application approximate; contrast/brightness not mapped')
            catalog.brushes.append({'descriptor':finalize_identity(d,raw),'name':name,'source':path.name,'warnings':warnings})


def photoshop(path,catalog):
    samples,presets,errors=read_abr(path); catalog.skipped.extend(errors)
    for index,p in enumerate(presets):
        name=p.get('Nm  ',f'Brush {index+1}'); shape=p.get('Brsh',{}); sid=shape.get('sampledData')
        if sid not in samples:
            catalog.skipped.append({'name':name,'reasons':['Unsupported procedural tip or missing sampledData '+str(sid)]});continue
        warnings=['Photoshop rendering approximated; wet edges, texture patterns, dual brush, color/tilt dynamics and tool blending unsupported.']
        image=samples[sid]
        if shape.get('flipX'): image=ImageOps.mirror(image)
        if shape.get('flipY'): image=ImageOps.flip(image)
        mask=catalog.asset(image,warnings)
        seed=json.dumps(p,sort_keys=True).encode()
        d=descriptor(seed,mask)
        d['spacing']=clamp(number(shape.get('Spcn'),10)/100,0.01,2)
        d['tip']['angle']=math.remainder(number(shape.get('Angl'))*math.pi/180,2*math.pi)
        roundness=clamp(number(shape.get('Rndn'),100)/100,0.0625,1)
        d['tip']['aspect']=1/roundness
        if p.get('useTipDynamics'):
            size=p.get('szVr',{})
            if size.get('bVTy')==2:
                d['sizeByPressure']=[[0,max(0.02,number(p.get('minimumDiameter'))/100)],[1,1]]
            if size.get('bVTy',0) not in (0,2): warnings.append('Size control other than pen pressure omitted')
        d['flow']=clamp(number(p.get('toolOptions',{}).get('flow'),100)/100,0.01,1)
        d['opacity']=clamp(number(p.get('toolOptions',{}).get('Opct'),100)/100)
        if p.get('usePaintDynamics'):
            for field,key in [('opacityByPressure','opVr'),('flowByPressure','prVr')]:
                v=p.get(key,{})
                if v.get('bVTy')==2: d[field]=[[0,max(0.02,number(v.get('Mnm '))/100)],[1,1]]
            warnings.append('Pressure dynamics approximated; flow pressure is not active in stamp renderer')
        catalog.brushes.append({'descriptor':finalize_identity(d,seed),'name':name,'source':path.name,'warnings':warnings})


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('sources',type=Path,nargs='+'); ap.add_argument('--output',type=Path,required=True)
    args=ap.parse_args(); catalog=Catalog(args.output)
    for path in args.sources:
        if path.suffix.lower()=='.abr': photoshop(path,catalog)
        elif path.suffix.lower() in ('.brush','.brushset'): procreate(path,catalog)
        else: ap.error('Unsupported extension: '+path.suffix)
    result=catalog.write();print(json.dumps({'brushes':len(result['brushes']),'assets':len(result['assets']),'skipped':len(result['skipped'])}))

if __name__=='__main__': main()
