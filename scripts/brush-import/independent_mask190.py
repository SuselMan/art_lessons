"""Native Pixel independent-mask190 admission; no orphan component capability.
PressureIn is the component's own maximum input pressure. Perspective uses native
base paintInfo default1 when no perspective assistant scene is supplied.
"""
from contextvars import ContextVar
import math
COMPONENT190=ContextVar('native_pixel_mask_component190',default=False)
MASK_RADIAL190=ContextVar('native_pixel_mask_radial_aa190',default=False)
CLONE_RADIAL200=ContextVar('native_clone_radial_aa200',default=False)
MODES={'multiply':'multiply','darken':'darken','overlay':'overlay','dodge':'colorDodge','burn':'colorBurn','linear_burn':'linearBurn','linear_dodge':'add','hard_mix_photoshop':'hardMixPhotoshopAlpha','hard_mix_softer_photoshop':'hardMixSofterPhotoshop','subtract':'subtract'}
OTHER_ENGINES=('mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')
def uses_native_mask190_controls(v):
    if isinstance(v,dict):return v.get('control')=='pressureIn'or any(uses_native_mask190_controls(x)for k,x in v.items()if k!='dual')
    return isinstance(v,list)and any(uses_native_mask190_controls(x)for x in v)
def component190(d,root=False,revision=190):
    if not isinstance(d,dict)or type(d.get('version'))is not int or d['version']!=revision or d.get('model')!='stamp'or any(k in d for k in OTHER_ENGINES):return False
    tip=d.get('tip');b=d.get('behavior')
    if not isinstance(tip,dict)or tip.get('kind')not in('round','procedural','bitmap')or isinstance(tip.get('profile'),dict)and tip['profile'].get('kind')=='circleBand'or not isinstance(b,dict)or b.get('version')!=2:return False
    if revision==190 and root and isinstance(d.get('texture'),dict)and 'material'in d['texture']:return False
    if not root:
        if any(k in d for k in('texture','wet'))or d.get('paperInteraction')!=0:return False
        if set(b)-{'version','rendering','spacing','rotation','strokeInput','speedInput','sequentialRandom','clockRead','dynamics','modulations','mirror','scatter','softness','falloff','erase'}or b.get('erase')is True:return False
        for section in('dynamics','modulations'):
            if section in b and(not isinstance(b[section],dict)or set(b[section])-{'size','angle','roundness','scatter','flow','opacity'}):return False
    def strict(v):
        if isinstance(v,dict):return ('control'not in v or isinstance(v['control'],str))and all(strict(x)for k,x in v.items()if k!='dual')
        return not isinstance(v,list)or all(strict(x)for x in v)
    return strict(b)
def independent_mask190_scope(d):
    if not component190(d,True):return False
    dual=d['behavior'].get('dual')
    if not isinstance(dual,dict)or set(dual)-{'brush','blendMode','sampling','sizePolicy'}or dual.get('sampling')!='independent'or dual.get('blendMode')not in MODES.values()or not component190(dual.get('brush')):return False
    size=dual.get('sizePolicy')
    return size is None or isinstance(size,dict)and set(size)=={'kind','diameter'}and size.get('kind')=='resource'and type(size.get('diameter'))in(int,float)and math.isfinite(size['diameter'])and .01<=size['diameter']<=10000
def validate_independent_mask190(d,parent=None):
    whole=parent if parent is not None else d
    active=isinstance(whole,dict)and whole.get('version')==190
    behavior=d.get('behavior');dual=behavior.get('dual')if isinstance(behavior,dict)else None
    if d.get('version')==190 or uses_native_mask190_controls(behavior)or isinstance(dual,dict)and 'sizePolicy'in dual:
        if not active or not independent_mask190_scope(whole)or parent is not None and whole['behavior']['dual']['brush']is not d:raise ValueError('Invalid native independent mask190 role')
    return active and independent_mask190_scope(whole)

def validate_mask190_portable(d,asset_sizes,profile_validator,dynamics_validator,parent=None,*,role_validator=None,native195=False):
    """Complete190 assembly plus existing primitive profile/curve validators.
    Physical planes/geometry remain actual CAS metadata, never a descriptor proxy.
    """
    from variable_gih import frame_bounds,same_bounds
    if not (role_validator(d,parent)if role_validator else validate_independent_mask190(d,parent)):raise ValueError('Missing whole component authority')
    finite=lambda x,a,b:type(x)in(int,float)and math.isfinite(x)and a<=x<=b
    ref=lambda x:isinstance(x,str)and x in asset_sizes
    allowed={'id','version','model','category','tip','paperInteraction','spacing','flow','flowPer','flowSpan','sizeByPressure','flowByPressure','opacityByPressure','pressureSmoothingPx','opacity','scatter','texture','wet','behavior'}
    if role_validator and d.get('model')=='mixer':allowed.add('mixer')
    if role_validator and d.get('version')==194:allowed.update(('sketch','spray'))
    if native195:allowed.update(('mixer','filter','sketch','spray','particle','deform','curveTrace','bristle','grid','hatching','experiment','clone','mypaint','tangentNormal'))
    if set(d)-allowed or not isinstance(d.get('id'),str)or not d['id'].startswith('imported-')or d.get('category')not in('line','paint','wet','soft','texture','scatter')or not finite(d.get('paperInteraction'),0,1)or not finite(d.get('spacing'),.000001,2)or not finite(d.get('flow'),0,1)or not finite(d.get('opacity'),0,1)or d.get('flowPer')not in('pass','stamp')or not finite(d.get('pressureSmoothingPx'),0,100):raise ValueError('Invalid190 descriptor fields')
    tip=d['tip'];b=d['behavior']
    if any(k in tip and tip[k]is None for k in('profile','maskBounds','animation','imageSampling','material','color','autoShape','autoNoise','alphaThreshold')):raise ValueError('Null190 tip metadata')
    if set(tip)-({'kind','mask','hardness','aspect','angle','rotation','profile','maskBounds','animation','imageSampling','material','color','autoShape','autoNoise','alphaThreshold'}|({'sourceGeometry'}if d.get('version')in(193,194,195) and role_validator else set()))or not finite(tip.get('hardness'),0,1)or not finite(tip.get('aspect'),1,16)or not finite(tip.get('angle'),-2*math.pi,2*math.pi)or tip.get('rotation')not in('fixed','path','travel'):raise ValueError('Invalid190 tip')
    if set(b)-{'version','clockRead','sequentialRandom','strokeInput','timing','speedInput','colorAdjustment','spacing','edgeBleed','erase','falloff','softness','mirror','rotation','scatter','dynamics','modulations','grain','rendering','wetMix','taper','dual'}:raise ValueError('Unknown190 behavior field')
    # Generic leaf/compound validator retains native curve/constant ordering.
    if any(key not in d for key in('sizeByPressure','flowByPressure','opacityByPressure')):raise ValueError('Missing190 pressure curve')
    for key in('sizeByPressure','flowByPressure','opacityByPressure'):
        maximum=8 if key=='sizeByPressure'else 1
        value=d[key]
        if isinstance(value,list):normalized=[[point[0],point[1]/maximum]for point in value]if all(isinstance(point,list)and len(point)==2 and type(point[1])in(int,float)for point in value)else value
        elif isinstance(value,dict)and isinstance(value.get('samples'),list):normalized={**value,'samples':[v/maximum if type(v)in(int,float)else v for v in value['samples']]}
        else:normalized=value
        dynamics_validator([{'control':'pressure','minimum':0,'jitter':0,'curve':normalized}])
    def controls(v):
        if isinstance(v,dict):
            if 'control'in v:dynamics_validator([v]);return
            for key,x in v.items():
                if key!='dual':controls(x)
        elif isinstance(v,list):
            for x in v:controls(x)
    controls(b)
    validate_behavior190(b,dynamics_validator,native195=native195)
    if role_validator:profile_validator(d,parent=parent,texture191=True)
    else:profile_validator(d,parent=parent)
    validate_descriptor190_primitives(d,asset_sizes,texture191=role_validator is not None,native195=native195)
    animation=tip.get('animation');frames=[tip.get('mask')]
    if animation is not None:
        if not isinstance(animation,dict)or set(animation)-{'mode','frames','rank','cursorPolicy','roundingPolicy','randomPolicy','dimensions','geometry'}or animation.get('mode')not in('constant','pressure','velocity','angular','xtilt','ytilt','random','incremental','dimensions'):raise ValueError('Invalid190 animation')
        frames=animation.get('frames');mode=animation['mode']
        if not isinstance(frames,list)or not 1<=len(frames)<=(1024 if animation.get('mode')=='dimensions' else 256) or not all(ref(a)for a in frames)or frames[0]!=tip.get('mask'):raise ValueError('Invalid190 frame inventory')
        dims=animation.get('dimensions');modes=[mode]
        if mode=='dimensions':
            if not isinstance(dims,list)or not 2<=len(dims)<=4 or any(not isinstance(x,dict)or set(x)!={'mode','rank'}or x['mode']not in('constant','pressure','velocity','angular','xtilt','ytilt','random','incremental')or type(x['rank'])is not int or not 2<=x['rank']<=256 for x in dims)or math.prod(x['rank']for x in dims)>1024 or len(frames)>math.prod(x['rank']for x in dims):raise ValueError('Invalid190 tensor')
            modes=[x['mode']for x in dims]
            if 'rank'in animation:raise ValueError('Unexpected190 tensor rank')
            if ('random'in modes and animation.get('randomPolicy')!='grafetto-dim-stream-v1')or('random'not in modes and'randomPolicy'in animation):raise ValueError('Invalid190 tensor RNG policy')
        else:
            if dims is not None or'randomPolicy'in animation:raise ValueError('Unexpected190 flat tensor metadata')
            rank=animation.get('rank')
            if mode in('pressure','velocity','angular','xtilt','ytilt'):
                if type(rank)is not int or not(2 if mode in('angular','xtilt','ytilt')else 1)<=rank<=(2147483647 if mode=='pressure'else 256):raise ValueError('Invalid190 rank')
            elif rank is not None:raise ValueError('Unexpected190 rank')
        if ('angular'in modes and animation.get('cursorPolicy')!='first-request-v1')or('angular'not in modes and'cursorPolicy'in animation):raise ValueError('Invalid190 angular cursor')
        if (any(x in modes for x in('xtilt','ytilt'))and animation.get('roundingPolicy')!='qt5-half-up-v1')or(not any(x in modes for x in('xtilt','ytilt'))and'roundingPolicy'in animation):raise ValueError('Invalid190 tilt rounding')
        geometry=animation.get('geometry')
        if geometry is None:
            if len({asset_sizes[a]for a in frames})!=1:raise ValueError('190 equal frames differ')
        else:
            if not isinstance(geometry,dict)or set(geometry)!={'version','frames'}or geometry.get('version')!=1 or not isinstance(geometry['frames'],list)or len(geometry['frames'])!=len(frames):raise ValueError('Invalid190 original geometry')
            for i,row in enumerate(geometry['frames']):
                if not isinstance(row,dict)or set(row)!={'sourceWidth','sourceHeight','maskBounds'}or not same_bounds(row['maskBounds'],frame_bounds(row['sourceWidth'],row['sourceHeight'],asset_sizes[frames[i]]))or i==0 and not same_bounds(tip.get('maskBounds'),row['maskBounds']):raise ValueError('Invalid190 frame dimensions')
    if tip['kind']=='bitmap'and not all(ref(a)for a in frames):raise ValueError('Missing190 bitmap CAS')
    for section in('material','color'):
        v=tip.get(section)
        if v is None:continue
        if not isinstance(v,dict):raise ValueError('Invalid190 pigment metadata')
        if any(key in v and(not isinstance(v[key],list)or not v[key])for key in('grayFrames','frames')):raise ValueError('Invalid190 pigment frame list')
        if section=='material':
            if set(v)-{'kind','gray','grayFrames','strength'}or v.get('kind')!='lightness'or not finite(v.get('strength'),0,1):raise ValueError('Invalid190 Lightness')
            planes=[[a]for a in v.get('grayFrames',[v.get('gray')])]
            if planes[0]!=[v.get('gray')]:raise ValueError('190 first gray differs')
        elif 'gradient'in v:
            g=v['gradient']
            if set(v)!={'gradient'}or not isinstance(g,dict)or set(g)-{'gray','grayFrames','sampling'}or g.get('sampling','filteredGray-v1')!='filteredGray-v1':raise ValueError('Invalid190 gradient')
            if 'grayFrames'in g and(not isinstance(g['grayFrames'],list)or not g['grayFrames']):raise ValueError('Invalid190 gradient frame list')
            planes=[[a]for a in g.get('grayFrames',[g.get('gray')])]
            if planes[0]!=[g.get('gray')]:raise ValueError('190 first gradient differs')
        else:
            if set(v)-{'planes','frames','adjustmentPolicy'}or v.get('adjustmentPolicy','native-image-stamp-v1')!='native-image-stamp-v1':raise ValueError('Invalid190 original pigment')
            planes=v.get('frames',[v.get('planes')])
            if not isinstance(planes,list)or planes[0]!=v.get('planes')or any(not isinstance(row,list)or len(row)!=3 for row in planes):raise ValueError('Invalid190 RGB planes')
        if len(planes)!=len(frames)or any(not ref(a)or asset_sizes[a]!=asset_sizes[frames[i]]for i,row in enumerate(planes)for a in row):raise ValueError('190 paired CAS sizes differ')
    if 'dual'in b:
        validate_mask190_portable(b['dual']['brush'],asset_sizes,profile_validator,dynamics_validator,d,role_validator=role_validator)


def validate_behavior190(b,dynamics_validator,*,native195=False):
    """Primitive schema, independent of versioned execution combinations.
    Curves and compound controls reuse the existing portable validator.
    """
    from math import pi
    def fail():raise ValueError('Invalid190 primitive behavior')
    def finite(x,a=0,z=1):return type(x)in(int,float)and math.isfinite(x)and a<=x<=z
    def boolean(x):return type(x)is bool
    def enum(*values):return lambda x:isinstance(x,str)and x in values
    def integer(x,a,z):return type(x)is int and a<=x<=z
    def obj(v,required,optional=None):
        optional=optional or{}
        if not isinstance(v,dict)or set(v)-required.keys()-optional.keys()or any(k not in v or not test(v[k])for k,test in required.items())or any(k in v and not test(v[k])for k,test in optional.items()):fail()
        return True
    def controls(v,count=4):
        if not isinstance(v,list)or len(v)>count:fail()
        for c in v:dynamics_validator([c])
        return True
    def curve(v):dynamics_validator([{'control':'off','minimum':0,'jitter':0,'curve':v}]);return True
    blend=enum('normal','multiply','screen','overlay','darken','lighten','colorBurn','linearBurn','colorDodge','add','subtract','difference','exclusion','softLight','hardLight','divide','linearLight','vividLight','pinLight','hardMix','darkerColor','lighterColor','hue','saturation','color','luminosity','hardMixPhotoshop','kritaHardMix')
    for key in('falloff','softness'):
        if key in b and not finite(b[key]):fail()
    if 'erase'in b and not boolean(b['erase']):fail()
    if 'sequentialRandom'in b:obj(b['sequentialRandom'],{'version':lambda x:type(x)is int and x==1,'kind':enum('qt5Taus88'),'policy':enum('scatterXY')})
    if 'clockRead'in b:obj(b['clockRead'],{'version':lambda x:type(x)is int and x==1,'source':enum('primary')})
    if 'strokeInput'in b:obj(b['strokeInput'],{'version':lambda x:type(x)is int and x==1,'initialDirection':enum('cursorHistory')},{'fanCorners':lambda v:obj(v,{'stepDegrees':lambda x:integer(x,5,90)})})
    if 'speedInput'in b:obj(b['speedInput'],{'version':lambda x:type(x)is int and x==1,'space':enum('view'),'maximum':lambda x:finite(x,.001,1000),'estimator':enum('grafettoEMA30ms')})
    if 'timing'in b and native195:
        from stationary195 import validate_timing195
        validate_timing195(b['timing'],dynamics_validator)
    if 'timing'in b and not native195:
        t=b['timing'];obj(t,{'version':lambda x:type(x)is int and x==1,'rate':lambda x:finite(x,0,1000),'ignoreDistanceSpacing':boolean},{'rateDynamics':lambda v:controls(v)and 1<=len(v)<=4})
        for response in t.get('rateDynamics',[]):
            leaves=response['combine']['scaling']+response['combine']['additive']if'combine'in response else[response]
            if 'combine'in response and'absolute'in response['combine']or any(c['jitter']!=0 or c['control']not in('pressure','off','random')or c['control']=='random'and c.get('randomSource',{}).get('kind')!='grafettoSourceTime-v1'for c in leaves):fail()
    if 'spacing'in b:
        sp=b['spacing'];obj(sp,{'mode':enum('diameter','kritaAuto'),'coefficient':lambda x:finite(x,0 if sp.get('mode')=='diameter'else .001,100)},{'isotropic':boolean,'dynamics':controls,'axisScale':lambda v:obj(v,{'x':lambda x:finite(x,0,2)and x>0,'y':lambda x:finite(x,0,2)and x>0}),'angleOffset':lambda x:finite(x,-pi,pi)})
    if 'colorAdjustment'in b:obj(b['colorAdjustment'],{},dict.fromkeys(('hue','saturation','value'),lambda v:controls([v])))
    if 'edgeBleed'in b:obj(b['edgeBleed'],{'pressure':lambda x:finite(x,-1,1),'tilt':lambda x:finite(x,-1,1)},{'pressureCurve':curve})
    if 'mirror'in b:
        m=b['mirror'];obj(m,{'horizontal':boolean,'vertical':boolean,'value':finite},{'dynamics':controls})
        if not m['horizontal']and not m['vertical']:fail()
    if 'rotation'in b:
        r=b['rotation'];obj(r,{'follow':lambda x:finite(x,-1,1),'random':enum('none','stroke','stamp')},dict.fromkeys(('flipX','flipY','azimuth','projection'),boolean)|{'composition':lambda x:isinstance(x,dict)})
        if 'composition'in r:
            c=r['composition'];obj(c,{'strength':lambda x:finite(x,-1,1),'additive':lambda v:controls(v,16)},{'scaling':lambda v:controls(v,16),'scalingMode':enum('product','sum','max','min','difference'),'absolute':lambda v:obj(v,{'locked':boolean,'angleOffset':lambda x:finite(x,-360,360),'curve':curve})})
            count=len(c['additive'])+len(c.get('scaling',[]))
            if count>16 or count==0 and'absolute'not in c or'absolute'in c and'strokeInput'not in b:fail()
    if 'scatter'in b:
        s=b['scatter'];obj(s,{'countJitter':finite,'bothAxes':boolean},{'roundnessJitter':finite,'placement':enum('pathUniform','normalUniform','xyUniform')})
        if 'placement'in s and s['bothAxes']!=(s['placement']=='xyUniform'):fail()
    targets={'size','angle','roundness','scatter','count','flow','opacity','hue','saturation','brightness','grainDepth','sharpness','softness','lightnessStrength'}
    for key in('dynamics','modulations'):
        if key in b:
            if not isinstance(b[key],dict)or set(b[key])-targets:fail()
            for response in b[key].values():controls(response if key=='modulations'else[response])
    if 'grain'in b:obj(b['grain'],{'mode':enum('canvas','moving'),'movement':finite,'zoom':finite,'rotation':lambda x:finite(x,-1,1),'offsetJitter':boolean,'brightness':lambda x:finite(x,-1,1),'contrast':lambda x:finite(x,-1,1),'depthMinimum':finite,'depthJitter':finite,'blendMode':blend})
    if 'rendering'in b:
        r=b['rendering'];obj(r,{'mode':enum('lightGlaze','uniformGlaze','intenseGlaze','heavyGlaze','uniformBlend','intenseBlend','buildUp'),'blendMode':blend,'wetEdges':finite,'burntEdges':finite,'burntEdgesMode':blend},{'opacityCeiling':enum('shape','uniform'),'accumulation':enum('over','directOver','alphaDarken','maxAlpha'),'luminance':boolean,'gammaCorrect':boolean})
        if 'accumulation'in r and(r['mode']!='buildUp'or'taper'in b):fail()
    if 'wetMix'in b:obj(b['wetMix'],dict.fromkeys(('dilution','charge','attack','pull','blur','blurJitter','wetnessJitter'),finite)|{'grade':lambda x:finite(x,-1,1)},{'dynamics':lambda v:obj(v,{},dict.fromkeys(('dilution','attack','pull','grade','blur'),controls))})
    if 'taper'in b:obj(b['taper'],dict.fromkeys(('start','end','size','opacity'),finite)|{'pressure':boolean})


def validate_descriptor190_primitives(d,asset_sizes,*,texture191=False,native195=False):
    def fail():raise ValueError('Invalid190 primitive descriptor')
    def finite(x,a=0,z=1):return type(x)in(int,float)and math.isfinite(x)and a<=x<=z
    def integer(x,a,z):return type(x)is int and a<=x<=z
    def ref(x):return isinstance(x,str)and x in asset_sizes
    def obj(v,required,optional=None):
        optional=optional or{}
        if not isinstance(v,dict)or set(v)-required.keys()-optional.keys()or any(k not in v or not test(v[k])for k,test in required.items())or any(k in v and not test(v[k])for k,test in optional.items()):fail()
        return True
    if 'flowSpan'in d and not finite(d['flowSpan'],.01,1):fail()
    if 'scatter'in d:obj(d['scatter'],{'count':lambda x:integer(x,1,32),'radius':lambda x:finite(x,0,4),'scale':lambda x:finite(x,.01,2),'sizeJitter':finite,'angleJitter':finite,'flowJitter':finite})
    if 'wet'in d:obj(d['wet'],{'edge':finite,'mottle':finite,'granulation':finite,'glaze':lambda x:type(x)is bool},{'model':lambda x:type(x)is int and x in(1,2),'bloom':finite,'feather':finite})
    tip=d['tip'];bounds=tip.get('maskBounds')
    if bounds is not None:
        obj(bounds,{'x':finite,'y':finite,'width':lambda x:finite(x,1/2048,1),'height':lambda x:finite(x,1/2048,1)})
        if tip['kind']!='bitmap'or bounds['x']+bounds['width']>1 or bounds['y']+bounds['height']>1:fail()
    if 'sourceGeometry'in tip:
        from color_smudge193 import scope193
        from sketch_spray194 import scope194
        from variable_gih import frame_bounds,same_bounds
        g=tip['sourceGeometry']
        if not(scope193(d)or scope194(d)or native195)or not isinstance(g,dict)or set(g)!={'version','width','height'}or type(g.get('version'))is not int or g['version']!=1 or any(type(g.get(k))is not int or not 1<=g[k]<=2048 for k in('width','height'))or not ref(tip.get('mask')):fail()
        if not same_bounds(tip.get('maskBounds'),frame_bounds(g['width'],g['height'],asset_sizes[tip['mask']])):fail()
    if 'imageSampling'in tip:
        sampling=tip['imageSampling'];obj(sampling,{'kind':lambda x:x=='integer-pyramid','signal':lambda x:x=='inverse-gray','sourceRect':lambda x:isinstance(x,dict)})
        rect=sampling['sourceRect'];obj(rect,{'x':lambda x:integer(x,0,2047),'y':lambda x:integer(x,0,2047),'width':lambda x:integer(x,1,2048),'height':lambda x:integer(x,1,2048)})
        if tip['kind']!='bitmap'or 'material'in tip:fail()
        for aid in tip.get('animation',{}).get('frames',[tip.get('mask')]):
            if not ref(aid)or rect['x']+rect['width']>asset_sizes[aid]or rect['y']+rect['height']>asset_sizes[aid]:fail()
    if 'alphaThreshold'in tip:obj(tip['alphaThreshold'],{'value':finite,'softness':finite})
    profile=tip.get('profile',{})
    if 'lookup'in profile:
        a=profile['lookup'];factor=8 if profile['kind']in('radialCurveSoftness','curveRectangleSoftness')else 4
        if not ref(a)or asset_sizes[a]<4 or asset_sizes[a]**2<factor*(profile['resolution']+2):fail()
    if 'texture'in d and texture191:
        from texture_combinations191 import validate_texture191_primitives
        validate_texture191_primitives(d['texture'],asset_sizes)
    if 'texture'in d and not texture191:
        t=d['texture'];obj(t,{'id':ref,'periodPx':lambda x:finite(x,1,8192),'strength':finite},{'eraseId':ref,'application':lambda v:obj(v,{'mode':lambda x:isinstance(x,str)and x in('multiply','subtract','darken','overlay','linearDodge','linearBurn','colorDodge','colorBurn','hardMixPhotoshop','hardMixSofterPhotoshop'),'soft':lambda x:type(x)is bool}),'patternSize':lambda v:obj(v,{'width':lambda x:integer(x,1,asset_sizes[t['id']]),'height':lambda x:integer(x,1,asset_sizes[t['id']])}),'offset':lambda v:obj(v,{'x':lambda x:finite(x,-8192,8192),'y':lambda x:finite(x,-8192,8192),'randomX':lambda x:type(x)is bool,'randomY':lambda x:type(x)is bool})})
        if 'eraseId'in t and('application'not in t or asset_sizes[t['eraseId']]!=asset_sizes[t['id']]):fail()
