"""Trusted offline saturation compiler. No table claims from portable inputs are trusted.

Existing parent prlimit/process-group owns this bounded subprocess. No paths,
URLs, or renderer state are accepted; absence of the compiler fails closed.
"""
import base64,hashlib,json,math,struct,subprocess
from pathlib import Path
LIMIT=524288
ENCODING='bristle-saturation-functional-v1-le'
class BristleSaturationUnsupported(ValueError):pass
KEYS={'depletion','useOpacity','useSaturation','useWeights','pressureWeight','bristleLengthWeight','bristleInkAmountWeight','inkDepletionWeight'}
def _validate(ink):
    if not isinstance(ink,dict)or set(ink)!=KEYS:raise ValueError('Invalid Bristle compiler profile')
    curve=ink['depletion']
    if not isinstance(curve,list)or not 1<=len(curve)<=65536 or any(type(x)not in(int,float)or not math.isfinite(x)or not 0<=x<=1 for x in curve):raise ValueError('Invalid Bristle compiler curve')
    if any(x!=struct.unpack('<f',struct.pack('<f',x))[0]for x in curve):raise ValueError('Bristle93 curve must be canonical F32')
    if any(type(ink[k])is not bool for k in ('useOpacity','useSaturation','useWeights'))or not ink['useSaturation']:raise ValueError('Invalid Bristle compiler flags')
    for key in ('pressureWeight','bristleLengthWeight','bristleInkAmountWeight','inkDepletionWeight'):
        value=ink[key]
        if type(value)not in(int,float)or not math.isfinite(value)or not 0<=value<=(100 if key=='inkDepletionWeight'else 1):raise ValueError('Invalid Bristle compiler weight')

def compile_bristle(ink):
    _validate(ink)
    data=json.dumps(ink,allow_nan=False,separators=(',',':')).encode()
    if len(data)>2*1024*1024:raise ValueError('Bristle compiler input limit')
    try:
        run=subprocess.run(['node','--jitless','--v8-pool-size=1','--max-old-space-size=96',str(Path(__file__).with_name('compile_bristle_saturation.mjs'))],input=data,capture_output=True,timeout=20,check=False)
    except(subprocess.TimeoutExpired,OSError)as error:raise ValueError('Bristle compiler unavailable or timed out')from error
    if run.returncode==2 and not run.stdout and len(run.stderr)<=4096:
        # Only this trusted CLI emits the bounded unsupported envelope. Node's
        # jitless warning precedes it; unknown parser/internal failures stay generic.
        try:
            diagnostic=json.loads(run.stderr.decode('utf-8').splitlines()[-1])
            reason=diagnostic.get('reason');quality=diagnostic.get('quality',{})
            valid=isinstance(diagnostic,dict)and set(diagnostic)<={'kind','reason','quality'}and diagnostic.get('kind')=='unsupported'and isinstance(reason,str)and 0<len(reason)<=256 and all(32<=ord(c)<127 for c in reason)
            valid=valid and isinstance(quality,dict)and set(quality)<={'maxAbsoluteError','limit','witnesses','coveredBins','requiredBins'}and all(type(v)in(int,float)and math.isfinite(v)for v in quality.values())
        except(ValueError,IndexError,UnicodeError,AttributeError):valid=False
        if valid:raise BristleSaturationUnsupported('Unsupported Bristle saturation profile: '+reason)
    if run.returncode or len(run.stdout)>1024*1024:raise ValueError('Bristle compilation rejected')
    try:
        result=json.loads(run.stdout);raw=base64.b64decode(result['bytes'],validate=True)
        if set(result)!={'version','profileSha256','byteLength','bytes','quality'}or result['version']!=1 or type(result['byteLength'])is not int or result['byteLength']!=len(raw)or not 64<=len(raw)<=LIMIT:raise ValueError()
        # Verify canonical BRP1 provenance without a second Python serializer.
        if not isinstance(result['profileSha256'],str)or len(result['profileSha256'])!=64 or any(c not in '0123456789abcdef'for c in result['profileSha256']):raise ValueError()
        if struct.unpack_from('<II',raw)!=(0x42525339,1)or struct.unpack_from('<I',raw,60)[0]!=len(raw):raise ValueError()
    except(ValueError,KeyError,TypeError,struct.error)as error:raise ValueError('Invalid trusted Bristle compiler response')from error
    side=2
    while side*side<len(raw):side*=2
    padded=raw+bytes(side*side-len(raw));sha=hashlib.sha256(padded).hexdigest()
    lookup={'version':1,'encoding':ENCODING,'asset':'asset:'+sha,'profileSha256':result['profileSha256'],'byteLength':len(raw)}
    asset={'id':lookup['asset'],'size':side,'file':sha+'.bin'}
    return lookup,asset,padded,result['quality']

def install_bristle(ink,catalog):
    lookup,asset,raw,quality=compile_bristle(ink)
    # Binary bytes are stored directly: no Pillow resampling, centering or inversion.
    (catalog.output/asset['file']).write_bytes(raw);catalog.assets[asset['id']]=asset
    return lookup,quality

def validate_portable_bristle(descriptor,assets):
    bristle=descriptor.get('bristle')
    if not isinstance(bristle,dict):return
    ink=bristle.get('ink');lookup=bristle.get('saturationLookup')
    saturation=isinstance(ink,dict)and ink.get('useSaturation')is True
    if not saturation:
        if lookup is not None:raise ValueError('Unexpected Bristle saturation lookup')
        return
    if type(descriptor.get('version'))is not int or descriptor['version']<93 or bristle.get('version')!=2:raise ValueError('Bristle saturation requires compiled revision93')
    # Always regenerate under the same caps, even if the claimed digest is valid.
    expected,asset,raw,_=compile_bristle(ink)
    if lookup!=expected or assets.get(asset['id'])!=raw:raise ValueError('Portable Bristle compiled table does not match profile')
