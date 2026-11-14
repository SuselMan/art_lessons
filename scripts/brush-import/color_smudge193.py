"""Closed whole Color Smudge admission; no public component capability."""
from contextvars import ContextVar
import math
COMPONENT193=ContextVar('native_color_smudge193',default=False)
BLENDS=('normal','multiply','screen','overlay','darken','lighten','colorBurn','linearBurn','colorDodge','add','subtract','difference','exclusion','softLight','hardLight','divide','linearLight','vividLight','pinLight','hardMix','darkerColor','lighterColor','hue','saturation','color','luminosity','hardMixPhotoshop','kritaHardMix')
COMPOSITES=(*BLENDS,'dodge','burn','grainMerge','grainExtract','negation','erase')
NATIVE_MODES={'normal':'normal','multiply':'multiply','screen':'screen','overlay':'overlay','darken':'darken','lighten':'lighten','burn':'colorBurn','dodge':'colorDodge','linear_burn':'linearBurn','linear_dodge':'add','add':'add','subtract':'subtract','diff':'difference','exclusion':'exclusion','soft_light':'softLight','hard_light':'hardLight','divide':'divide','hue':'hue','saturation':'saturation','color':'color','luminosity':'luminosity','linear light':'linearLight','vivid_light':'vividLight','pin_light':'pinLight','hard mix':'kritaHardMix','hard_mix_photoshop':'hardMixPhotoshop','darker color':'darkerColor','lighter color':'lighterColor','grain_merge':'grainMerge','grain_extract':'grainExtract','negation':'negation','erase':'erase','destination-out':'erase'}
def scope193(d):
    obj=lambda v:isinstance(v,dict)
    unit=lambda v:type(v)in(int,float)and math.isfinite(v)and 0<=v<=1
    if not obj(d)or type(d.get('version'))is not int or d['version']!=193 or d.get('model')!='mixer'or d.get('paperInteraction')!=0 or not all(obj(d.get(k))for k in('mixer','tip','behavior')):return False
    if any(k in d for k in('wet','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')):return False
    t=d['tip'];m=d['mixer'];b=d['behavior'];r=b.get('rendering')
    if t.get('kind')not in('round','procedural','bitmap')or'alphaThreshold'in t or any(k in b for k in('dual','timing','wetMix','taper','edgeBleed','grain','softness')):return False
    if not obj(r)or r.get('mode')!='buildUp'or r.get('blendMode')!='normal'or r.get('wetEdges',0)!=0 or r.get('burntEdges',0)!=0 or r.get('accumulation')!='directOver'or r.get('gammaCorrect')is True or r.get('luminance')is True:return False
    if set(m)-{'load','pickup','strength','initialLoad','smearAlpha','source','pickupDynamics','sampling','foreground','colorRateComposite','algorithm','paintThickness'}or m.get('load')!=0 or m.get('initialLoad')!=0 or not unit(m.get('pickup'))or m.get('strength')!=1 or m.get('source')not in('previousCanvas','projectionCanvas')or type(m.get('smearAlpha'))is not bool or m.get('colorRateComposite')not in COMPOSITES:return False
    if 'algorithm'in m and m['algorithm']not in('krita-mask','krita-stamp'):return False
    if m.get('algorithm')=='krita-stamp'and'color'not in t or'color'in t and m.get('algorithm')!='krita-stamp':return False
    if 'material'in t and(not obj(t['material'])or t['material'].get('kind')!='lightness'or t['material'].get('strength')!=1 or m.get('algorithm')!='krita-mask'or m.get('source')!='previousCanvas'or'paintThickness'not in m):return False
    if 'paintThickness'in m and 'material'not in t:return False
    if 'sampling'in m:
        q=m['sampling'];modern='algorithm'in m
        if not obj(q)or q.get('mode')!=('maskMean'if modern else'adaptiveMean')or type(q.get('radius'))not in(int,float)or not math.isfinite(q['radius'])or not 0<=q['radius']<=(1 if modern else 3):return False
    if m.get('colorRateComposite')=='erase'and b.get('erase')is not True or b.get('erase')is True and m.get('colorRateComposite')!='erase':return False
    if 'texture'in d:
        from texture_combinations191 import APPLICATIONS
        x=d['texture'];a=x.get('application')if obj(x)else None
        if not obj(x)or'material'in x or not obj(a)or a.get('mode')not in APPLICATIONS or type(a.get('soft'))is not bool:return False
    if d.get('flow')!=1 or d.get('flowPer')!='stamp':return False
    flat=d.get('flowByPressure')
    if not isinstance(flat,list)or len(flat)<2 or any(not isinstance(p,list)or len(p)!=2 or not unit(p[0])or type(p[1])not in(int,float)or p[1]!=1 for p in flat):return False
    if any(obj(b.get(k))and any(target in b[k]for target in('flow','softness','sharpness'))for k in('dynamics','modulations')):return False
    return True

def validate_smudge193(d,parent=None):
    if parent is not None or not scope193(d):raise ValueError('Color Smudge193 requires closed whole native canvas strategy')

def validate_smudge193_portable(d,sizes,profile,dynamics,parent=None):
    validate_smudge193(d,parent)
    from independent_mask190 import validate_mask190_portable
    validate_mask190_portable(d,sizes,lambda node,**kw:profile(node,parent=parent,smudge193=True),dynamics,parent,role_validator=lambda node,p:node is d and p is None)
    from convert import validate_portable_mixer
    validate_portable_mixer(d,smudge193=True)
