"""One immutable output contract shared by the format readers."""
import hashlib
import json
import math
from PIL import Image, ImageOps

MAX_PIXELS = 64 * 1024 * 1024
IMPORTER_SCHEMA_VERSION = 1
IMPORTER_RENDERING_VERSION = 3

def number(value, fallback=0):
    if isinstance(value,dict): value = value.get('value',fallback)
    return float(value) if isinstance(value,(int,float)) and math.isfinite(value) else fallback


def clamp(value,low=0,high=1): return min(high,max(low,number(value)))


def descriptor(seed, mask):
    return {'id':'imported-'+hashlib.sha256(seed).hexdigest()[:24], 'version':IMPORTER_RENDERING_VERSION,
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


def compatibility(feature, detail, status='approximate'):
    return {'feature': feature, 'status': status, 'detail': detail}
