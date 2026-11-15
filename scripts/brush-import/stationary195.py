"""Strict195 root structure and independent portable primitives.

No descriptor projection: consumers see the literal195 object throughout.
Shared whole-library admission is the final installation boundary.
"""
import math,re
FAMILIES=('filter','sketch','spray','particle','deform','curveTrace','bristle','grid','hatching','experiment','clone','mypaint','tangentNormal')
def number(a=0,b=1):return lambda x:type(x)in(int,float)and math.isfinite(x)and a<=x<=b
def integer(a,b):return lambda x:type(x)is int and a<=x<=b
def boolean(x):return type(x)is bool
def enum(*values):return lambda x:type(x)in(str,int)and x in values
def exact(value):return lambda x:type(x)is type(value)and x==value
def sequence(count,check):return lambda x:isinstance(x,list)and len(x)==count and all(check(v)for v in x)
def obj(value,required,optional=None):
    optional=optional or{}
    if not isinstance(value,dict)or set(value)-required.keys()-optional.keys()or any(k not in value or not check(value[k])for k,check in required.items())or any(k in value and not check(value[k])for k,check in optional.items()):raise ValueError('Invalid native195 object fields')
    return True

def validate_timing195(t,dynamics):
    obj(t,{'version':exact(2),'rate':number(0,1000),'hostRate':number(0,1000),'ignoreDistanceSpacing':boolean,'updateSpacingBetweenDabs':boolean},{'rateDynamics':lambda x:isinstance(x,list)and 1<=len(x)<=4})
    from native_timing195 import validate_native_intervals
    validate_native_intervals(t)
    if 'rateDynamics'in t:dynamics(t['rateDynamics'])

def role195(d,parent=None):
    if parent is not None or not isinstance(d,dict)or type(d.get('version'))is not int or d['version']!=195 or not isinstance(d.get('behavior'),dict)or not isinstance(d.get('tip'),dict):raise ValueError('Native195 requires literal root195')
    b=d['behavior'];keys=[k for k in FAMILIES if k in d]
    if len(keys)>1 or 'clockRead'in b:raise ValueError('Conflicting native195 consumers')
    family=keys[0]if keys else'smudge'if d.get('model')=='mixer'else'pixel'
    if 'timing'not in b:raise ValueError('Native195 requires canonical host timing')
    if family!='pixel'and 'dual'in b:raise ValueError('Native195 child belongs only to Pixel')
    if family=='pixel'and'dual'in b:
        dual=b['dual'];child=dual.get('brush')if isinstance(dual,dict)else None
        if not isinstance(child,dict)or type(child.get('version'))is not int or child['version']not in(190,191):raise ValueError('Native195 child keeps literal190/191')
    return family


def validate_payload195(d,dynamics,sizes,raw_assets):
    family=role195(d);b=d['behavior'];t=d['tip'];r=b.get('rendering',{})
    if family=='smudge':
        from color_smudge193 import scope193,COMPOSITES
        if not scope193(d,clock195=True):
            m=d.get('mixer');render=b.get('rendering',{})
            if isinstance(m,dict)and 'colorRateComposite'in m and m['colorRateComposite']not in COMPOSITES:raise ValueError('Unknown native195 Smudge foreground composite')
            if not isinstance(m,dict)or d.get('model')!='mixer'or d.get('paperInteraction')!=0 or m.get('source')not in('previousCanvas','projectionCanvas')or m.get('load')!=0 or m.get('initialLoad')!=0 or any(k in b for k in('dual','wetMix','taper'))or render.get('accumulation')not in(None,'directOver','alphaDarken')or render.get('wetEdges',0)!=0 or render.get('burntEdges',0)!=0:raise ValueError('Invalid native195 Smudge whole role')
    elif family=='filter':
        from filter_mask192 import scope192
        if not scope192(d,clock195=True):validate_filter195(d)
    elif family in('sketch','spray'):
        from sketch_spray194 import scope194
        if not scope194(d,clock195=True):raise ValueError('Invalid native195 Sketch/Spray whole role')
        if family=='sketch':
            for c in d['sketch'].get('dynamics',{}).values():dynamics(c)
    elif family!='pixel':
        if d.get('paperInteraction')!=0 or b.get('version')!=2 or any(k in b for k in('dual','wetMix','taper')):raise ValueError('Invalid native195 family behavior')
        if family in('particle','curveTrace','bristle','hatching','experiment','mypaint','clone','tangentNormal')and d.get('model')!='stamp':raise ValueError('Native195 family requires stamp')
        if family in('deform','grid')and d.get('model')!='mixer':raise ValueError('Native195 family requires mixer')
        if family not in('tangentNormal','clone','hatching')and(t.get('kind')!='round'or t.get('aspect')!=1 or'profile'in t)or any(k in d for k in('wet','texture','scatter'))and family!='tangentNormal':raise ValueError('Invalid native195 family tip/material')
        if r.get('blendMode')!='normal'or r.get('accumulation')not in(('directOver','alphaDarken')if family in('particle','bristle','grid','tangentNormal')else('directOver',)):raise ValueError('Invalid native195 family composite')
        v=d[family]
        if family=='particle':
            obj(v,{'version':exact(1),'count':integer(1,500),'iterations':integer(1,200),'gravity':number(0,1),'weight':number(),'scaleX':number(0,2),'scaleY':number(0,2)})
            if v['count']*v['iterations']>16384:raise ValueError('Native195 Particle budget')
        elif family=='deform':obj(v,{'version':exact(1),'mode':integer(1,8),'amount':number(),'counter':boolean,'bilinear':boolean,'density':number(),'jitter':number(0,10),'baseScale':number(.01,10)},{'sourcePolicy':exact('canonical-begin-v1')})
        elif family=='curveTrace':
            obj(v,{'version':enum(1,2),'history':integer(2,128),'smoothing':boolean,'connect':boolean,'opacity':number()},{'dynamics':lambda x:isinstance(x,list)})
            if 'dynamics'in v:dynamics(v['dynamics'])
        elif family=='hatching':
            obj(v,{'version':exact(1),'angle':number(-360,360),'separation':number(.1,10000),'thickness':number(.1,1000),'origin':sequence(2,number(-1e9,1e9)),'style':enum('none','perpendicular','minusPlus','plusMinus','moire'),'intervals':integer(2,7),'antialias':boolean,'subpixel':boolean},{'dynamics':lambda x:isinstance(x,dict),'opaqueBackground':exact(True)})
            if 'dynamics'in v:
                if set(v['dynamics'])-{'angle','cross','separation','thickness'}:raise ValueError('Invalid native195 Hatching dynamics')
                for controls in v['dynamics'].values():dynamics(controls)
        elif family=='grid':obj(v,{'version':exact(1),'width':number(1,1024),'height':number(1,1024),'scale':number(.01,10),'offset':sequence(2,number(-1e9,1e9)),'division':integer(0,16),'pressureDivision':boolean,'border':sequence(2,number(0,1000)),'randomBorder':boolean,'shape':integer(0,4),'sampleInput':boolean,'colorPerCell':boolean,'randomOpacity':boolean},{'sourcePolicy':exact('canonical-begin-v1'),'fillBackground':exact(True),'mixBackground':exact(True),'hsv':lambda x:obj(x,{k:number(-1,1)for k in('hue','saturation','value')})})
        elif family=='experiment':
            if ('fill'in v)!=('patternPolicy'in v):raise ValueError('Incomplete native195 Experiment pattern policy')
            obj(v,{'version':exact(1),'displaceEnabled':boolean,'displace':number(0,100),'speedEnabled':boolean,'speed':number(0,100),'smoothingEnabled':boolean,'smoothing':number(0,1000),'winding':boolean,'hardEdge':boolean},{'fill':exact('canvasPattern'),'patternPolicy':exact('captured-world-repeat-v1')})
        elif family=='clone':
            obj(v,{'version':exact(1),'moveSourcePoint':boolean},{'source':exact('projectionCanvas'),'sourcePolicy':exact('canonical-begin-v1'),'healing':exact('lab-ratio-v1')})
            if ('source'in v or'healing'in v)!=('sourcePolicy'in v):raise ValueError('Invalid native195 Clone source pair')
            if ('source'in v or'healing'in v)and(b.get('erase')is True or any(k in t for k in('color','material','imageSampling','animation','autoNoise'))):raise ValueError('Invalid native195 Clone captured source role')
            if 'healing'in v and'autoShape'in t:raise ValueError('Invalid native195 Clone healing tip')
        elif family=='tangentNormal':obj(v,{'version':exact(1),'direction':enum('tilt','direction','mix'),'channels':sequence(3,integer(0,5)),'elevationSensitivity':number(0,1),'mix':number(),'sharpnessChecked':boolean})
        elif family=='mypaint':validate_mypaint195(v)
        elif family=='bristle':validate_bristle195(d,sizes,raw_assets)
    if family in('mypaint',)or family=='pixel'and t.get('profile',{}).get('kind')=='circleBand':
        if 'rateDynamics'in b['timing']:raise ValueError('Native195 consumer has no Rate option')
    return family


def validate_mypaint195(v):
    import json
    from pathlib import Path
    schema=json.loads(Path(__file__).with_name('mypaint_schema.json').read_text());settings=schema['settings']
    obj(v,{'version':exact(1),'kernel':exact('libmypaint-1.6.1'),'settings':lambda x:isinstance(x,list)and len(x)<=64,'baseRadius':number(.00000001,800),'erase':boolean},{'surfacePolicy':exact('krita-legacy-v1')})
    ids=set();count=0
    for setting in v['settings']:
        obj(setting,{'id':integer(0,len(settings)-1),'base':number(-1e6,1e6),'inputs':lambda x:isinstance(x,list)and len(x)<=16})
        if setting['id']in ids:raise ValueError('Duplicate native195 MyPaint setting')
        ids.add(setting['id']);inputs=set();meta=settings[setting['id']]
        if not number(meta['min'],meta['max'])(setting['base'])or len(setting['inputs'])>len(schema['inputs'])or meta['constant']and setting['inputs']:raise ValueError('Invalid native195 MyPaint setting range')
        for item in setting['inputs']:
            obj(item,{'id':integer(0,len(schema['inputs'])-1),'points':lambda x:isinstance(x,list)and len(x)!=1 and len(x)<=64 and all(sequence(2,number(-1e6,1e6))(p)for p in x)})
            if item['id']in inputs or any(a[0]>z[0]for a,z in zip(item['points'],item['points'][1:])):raise ValueError('Invalid native195 MyPaint input')
            inputs.add(item['id']);count+=len(item['points'])
    if count>4096:raise ValueError('Native195 MyPaint point budget')


def validate_bristle195(d,sizes,raw_assets):
    v=d['bristle']
    obj(v,{'version':enum(1,2),'hairs':lambda x:isinstance(x,list)and 1<=len(x)<=8192 and all(isinstance(h,list)and len(h)==3 and all(number(-.5,.5)(p)for p in h[:2])and number()(h[2])for h in x),'scale':number(-10,10),'shear':number(-10,10),'random':number(0,100),'mousePressure':boolean,'threshold':boolean,'connected':boolean,'antialias':boolean,'compositing':boolean},{'ink':lambda x:isinstance(x,dict),'saturationLookup':lambda x:isinstance(x,dict),'soak':lambda x:isinstance(x,dict),'initialization':lambda x:isinstance(x,dict)})
    if v['version']==1 and any(k in v for k in('ink','saturationLookup','soak'))or v['version']==2 and('ink'not in v or'initialization'in v or len(v['hairs'])>4096 or v['scale']<0):raise ValueError('Invalid native195 Bristle ink version')
    if 'ink'in v:
        obj(v['ink'],{'depletion':lambda x:isinstance(x,list)and 1<=len(x)<=65536 and all(number()(p)for p in x),**{k:boolean for k in('useOpacity','useSaturation','useWeights')},**{k:number()for k in('pressureWeight','bristleLengthWeight','bristleInkAmountWeight')},'inkDepletionWeight':number(0,100)})
    if 'initialization'in v:
        q=v['initialization']
        if q.get('resizePolicy')=='source-area143-v1':
            obj(q,{'resizePolicy':exact('source-area143-v1'),'sourceSide':integer(2,1024),'sourceMask':lambda x:isinstance(x,str)and x in sizes,'sourceBounds':lambda x:obj(x,{k:integer(0,1024)for k in('x','y','width','height')}),'rotation':sequence(2,integer(-65536,65536))})
            side=q['sourceSide'];bounds=q['sourceBounds'];rotation=q['rotation']
            if side&(side-1)or sizes[q['sourceMask']]!=side or bounds['width']<1 or bounds['height']<1 or bounds['x']+bounds['width']>side or bounds['y']+bounds['height']>side or abs(sum(x*x for x in rotation)/4294967296-1)>2e-4:raise ValueError('Native195 Bristle source CAS dimensions/geometry')
        else:obj(q,{'resizePolicy':exact('mask-population-v1'),'initialSide':integer(1,256)})
    if 'soak'in v:obj(v['soak'],{'sourcePolicy':exact('canonical-begin-v1'),'initialSide':integer(1,256)},{'resizePolicy':exact('mask-population-v1')})
    from captured_bristle import validate_portable_bristle
    validate_portable_bristle(d,raw_assets)


def validate_portable195(d,sizes,profile,dynamics,parent=None,raw_assets=None):
    family=role195(d,parent)
    if not isinstance(d.get('id'),str)or not re.fullmatch('imported-[a-f0-9]{24}',d['id']):raise ValueError('Invalid native195 identity')
    validate_timing195(d['behavior']['timing'],dynamics)
    validate_payload195(d,dynamics,sizes,raw_assets or{})
    from independent_mask190 import validate_mask190_portable,validate_independent_mask190
    def allowed(node,parent):
        if node is d:return parent is None
        return parent is d and d.get('behavior',{}).get('dual',{}).get('brush')is node and node.get('version')in(190,191)
    def check_profile(node,**options):
        if node is d:profile(node,native195=True)
        else:profile(node,parent=d,native195Root=d)
    validate_mask190_portable(d,sizes,check_profile,dynamics,role_validator=allowed,native195=True)
    from convert import validate_portable_mixer
    if 'mixer'in d:
        # Smudge whole-role checked above, generic mixer primitives below do
        # not rerun closed historical strategy/timer gates.
        validate_portable_mixer(d,native195=True)


def validate_filter195(d):
    from filter_mask192 import COMPOSITES
    f=d['filter'];m=d.get('mixer');b=d['behavior'];r=b.get('rendering',{})
    if d.get('model')!='mixer'or d.get('paperInteraction')!=0 or m!={'load':0,'initialLoad':0,'pickup':1,'strength':1,'source':'previousCanvas'}or any(k in d for k in('wet','scatter','texture'))or any(k in b for k in('dual','wetMix','taper'))or r.get('accumulation')!='directOver'or r.get('blendMode')!='normal':raise ValueError('Invalid native195 Filter family')
    kind=f.get('kind');extra={'smudgeMode':boolean,'sourcePolicy':exact('canonical-begin-v1'),'spatialPolicy':enum('gaussian-halo-v1','unsharp-lab-halo-v1'),'maskPolicy':enum('bitmap-alpha-v1','native-dab-v1'),'composite':enum(*COMPOSITES)}
    if kind in('invert','desaturate','posterize'):
        required={'version':exact(2),'kind':exact(kind)}
        if kind=='desaturate':required['type']=integer(0,5)
        if kind=='posterize':required['steps']=integer(2,128)
    else:required={'version':exact(1),'kind':enum('gaussian','unsharp'),'radiusX':number(0,16),'radiusY':number(0,16),'amount':number(0,5),'threshold':number(0,255),'lightnessOnly':boolean}
    obj(f,required,extra)
    if f.get('smudgeMode')is True and f.get('sourcePolicy')!='canonical-begin-v1':raise ValueError('Invalid native195 Filter feedback source')
