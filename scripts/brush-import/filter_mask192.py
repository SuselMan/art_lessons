"""Whole native FilterOp coverage. Private origin, never a public Pixel opt-in."""
from contextvars import ContextVar
import math
from PIL import Image
FILTER192=ContextVar('native_filter_mask192',default=False)
MODES={'normal':'normal','multiply':'multiply','screen':'screen','overlay':'overlay','darken':'darken','lighten':'lighten','burn':'colorBurn','dodge':'colorDodge','linear_burn':'linearBurn','linear_dodge':'add','add':'add','subtract':'subtract','diff':'difference','exclusion':'exclusion','soft_light':'softLight','hard_light':'hardLight','divide':'divide','hue':'hue','saturation':'saturation','color':'color','luminosity':'luminosity','linear light':'linearLight','vivid_light':'vividLight','pin_light':'pinLight','hard mix':'kritaHardMix','hard_mix_photoshop':'hardMixPhotoshop','darker color':'darkerColor','lighter color':'lighterColor'}
COMPOSITES=('copy','erase',*dict.fromkeys((*MODES.values(),'hardMix')))
APPLICATIONS=('multiply','subtract','darken','overlay','linearDodge','linearBurn','colorDodge','colorBurn','hardMixPhotoshop','hardMixSofterPhotoshop','height','linearHeight','heightPhotoshop','linearHeightPhotoshop')
def image_coverage192(image):
    """Functional default-sRGB GrayA conversion; arbitrary ICC is not identical."""
    def decode(x):
        x=x/255
        return x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4
    linear=[decode(i)for i in range(256)]
    def encode(y):return 12.92*y if y<=.0031308 else 1.055*y**(1/2.4)-.055
    return Image.frombytes('L',image.size,bytes(min(255,max(0,round(encode(.2126*linear[r]+.7152*linear[g]+.0722*linear[b])*a)))for r,g,b,a in image.convert('RGBA').get_flattened_data()))
def scope192(d,*,clock195=False):
    from canonical_effect_scopes import _number
    obj=lambda x:isinstance(x,dict)
    if not obj(d)or type(d.get('version'))is not int or d['version']!=(195 if clock195 else 192) or d.get('model')!='mixer'or d.get('category')!='wet'or type(d.get('paperInteraction'))not in(int,float)or d.get('paperInteraction')!=0:return False
    f=d.get('filter');b=d.get('behavior');t=d.get('tip');m=d.get('mixer')
    if not all(obj(x)for x in(f,b,t,m)):return False
    if any(k in d for k in('wet','scatter','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','clone','mypaint','tangentNormal')):return False
    common={'version','kind','maskPolicy','sourcePolicy','smudgeMode','composite'}
    if f.get('maskPolicy')!='native-dab-v1'or f.get('sourcePolicy')!='canonical-begin-v1'or type(f.get('smudgeMode'))is not bool or f.get('composite')not in COMPOSITES:return False
    kind=f.get('kind')
    if kind=='hsvSaturation':
        if type(f.get('version'))is not int or f['version']!=3 or set(f)!=common|{'amount'} or not _number(f.get('amount'),-1,1):return False
    elif kind=='colorBalance':
        if type(f.get('version'))is not int or f['version']!=3 or set(f)!=common|{'shadows','midtones','highlights','preserveLuminosity'} or type(f.get('preserveLuminosity'))is not bool:return False
        if any(not isinstance(f.get(k),list)or len(f[k])!=3 or any(not _number(v,-1,1)for v in f[k])for k in ('shadows','midtones','highlights')):return False
    elif kind in('invert','desaturate','posterize'):
        if type(f.get('version'))is not int or f['version']!=2 or set(f)!=common|({'type'}if kind=='desaturate'else{'steps'}if kind=='posterize'else set()):return False
        if kind=='desaturate'and(type(f.get('type'))is not int or not 0<=f['type']<=5):return False
        if kind=='posterize'and(type(f.get('steps'))is not int or not 2<=f['steps']<=128):return False
    elif kind in('gaussian','unsharp'):
        if type(f.get('version'))not in(int,float)or f.get('version')!=1 or set(f)!=common|{'radiusX','radiusY','amount','threshold','lightnessOnly','spatialPolicy'}or any(not _number(f.get(k),0,16)for k in('radiusX','radiusY')):return False
        if kind=='gaussian'and(f.get('spatialPolicy')!='gaussian-halo-v1'or f.get('amount')!=.5 or type(f.get('threshold'))not in(int,float)or f.get('threshold')!=0 or f.get('lightnessOnly')is not True):return False
        if kind=='unsharp'and(f.get('spatialPolicy')!='unsharp-lab-halo-v1'or f['radiusY']!=f['radiusX']or not _number(f.get('amount'),0,5)or type(f.get('threshold'))is not int or not 0<=f['threshold']<=255 or type(f.get('lightnessOnly'))is not bool):return False
    else:return False
    if t.get('kind')not in('round','procedural','bitmap')or set(t)-{'kind','mask','maskBounds','hardness','aspect','rotation','angle','profile','animation','imageSampling','autoNoise','autoShape','alphaThreshold'}:return False
    if set(b)-({'timing'}if clock195 else set())-{'version','rendering','spacing','rotation','strokeInput','speedInput','sequentialRandom','clockRead','dynamics','modulations','mirror'}:return False
    for key in('dynamics','modulations'):
        if key in b and(not obj(b[key])or set(b[key])-{'size','angle','grainDepth'}):return False
    r=b.get('rendering')
    if not obj(r)or set(r)-{'mode','accumulation','blendMode','wetEdges','burntEdges','burntEdgesMode','opacityCeiling'}or any(r.get(k)!=v for k,v in {'mode':'buildUp','accumulation':'directOver','blendMode':'normal','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}.items()):return False
    if any(type(m.get(k))not in(int,float)for k in('load','initialLoad','pickup','strength'))or m!={'load':0,'initialLoad':0,'pickup':1,'strength':1,'source':'previousCanvas'}or d.get('flow')!=1 or d.get('flowPer')!='stamp':return False
    for key in('flowByPressure','opacityByPressure'):
        a=d.get(key)
        if not isinstance(a,list)or len(a)<2 or any(not isinstance(p,list)or len(p)!=2 or not _number(p[0],0,1)or type(p[1])not in(int,float)or p[1]!=1 for p in a):return False
    if 'texture'in d:
        x=d['texture'];a=x.get('application')if obj(x)else None
        if not obj(x)or 'material'in x or'eraseId'in x or not obj(a)or set(a)-{'mode','soft'}or a.get('mode')not in APPLICATIONS or type(a.get('soft'))is not bool:return False
    return True

def validate_filter192(d,depth=0):
    if depth or not scope192(d):raise ValueError('Filter192 requires closed native dab coverage scope')
    # Complete physical asset/frame/profile checks run at the portable boundary.
    return d


def validate_filter192_portable(d,sizes,profile,dynamics,parent=None):
    validate_filter192(d,1 if parent is not None else 0)
    from independent_mask190 import validate_mask190_portable
    proxy={k:v for k,v in d.items()if k not in('filter','mixer')}
    proxy.update(version=191,model='stamp',category='paint')
    validate_mask190_portable(proxy,sizes,lambda candidate,**kw:profile(candidate,parent=parent,filter192=d),dynamics,role_validator=lambda candidate,parent: candidate is proxy and parent is None)
