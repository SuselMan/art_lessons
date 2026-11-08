from variable_gih import is_sensor_original_rgba119,is_sensor_original_rgba121,is_equal_lightness_gih123,is_equal_gradient_gih125,is_unequal_gradient_gih126,is_unequal_lightness_gih124
"""113 deterministic sensor tensor. Existing flat GIH policies are unchanged."""
import math
MODES=('constant','pressure','velocity','angular','xtilt','ytilt','random','incremental')
def uses_mode(animation,mode):
    return isinstance(animation,dict)and(animation.get('mode')==mode or animation.get('mode')=='dimensions'and isinstance(animation.get('dimensions'),list)and any(isinstance(d,dict)and d.get('mode')==mode for d in animation['dimensions']))
def validate_dimensions(d,depth=0,native_pixel=True):
    tip=d.get('tip',{});a=tip.get('animation',{})if isinstance(tip,dict)else{}
    if not isinstance(a,dict)or a.get('mode')!='dimensions':return
    dims=a.get('dimensions')
    if(set(a)-{'mode','frames','dimensions','cursorPolicy','roundingPolicy','randomPolicy','geometry'}or not isinstance(dims,list)or not 2<=len(dims)<=4 or any(not isinstance(v,dict)or set(v)!={'mode','rank'}or v.get('mode')not in MODES or type(v.get('rank'))is not int or not 2<=v['rank']<=256 for v in dims)or all(v['mode']=='constant'for v in dims)):raise ValueError('Invalid GIH dimensions')
    if 'geometry'in a and d.get('version',0)<118:raise ValueError('Sensor GIH original geometry requires118')
    product=math.prod(v['rank']for v in dims);frames=a.get('frames');angular=uses_mode(a,'angular');tilt=uses_mode(a,'xtilt')or uses_mode(a,'ytilt')
    if(product>256 or not isinstance(frames,list)or not 1<=len(frames)<=product or(angular and a.get('cursorPolicy')!='first-request-v1')or(not angular and 'cursorPolicy'in a)or(tilt and a.get('roundingPolicy')!='qt5-half-up-v1')or(not tilt and 'roundingPolicy'in a)):raise ValueError('Invalid GIH dimension product/policies')
    random=uses_mode(a,'random');sequence=random or uses_mode(a,'incremental')
    if(sequence and d.get('version',0)<115 or random and a.get('randomPolicy')!='grafetto-dim-stream-v1' or not random and 'randomPolicy'in a):raise ValueError('Invalid GIH dimension random policy/revision')
    b=d.get('behavior',{});r=b.get('rendering',{})if isinstance(b,dict)else{};source=b.get('strokeInput')if isinstance(b,dict)else None
    if(depth or not native_pixel or d.get('version',0)<113 or d.get('model')!='stamp' or tip.get('kind')!='bitmap' or('color'in tip and not(is_sensor_original_rgba119(d)or is_sensor_original_rgba121(d)or is_equal_gradient_gih125(d)or is_unequal_gradient_gih126(d)))or any(k in tip and(k!='material'or not(is_equal_lightness_gih123(d)or is_unequal_lightness_gih124(d)))for k in('material','profile','imageSampling','autoNoise','autoShape'))or any(k in d for k in('wet','texture','mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'))or not isinstance(b,dict)or b.get('dual')is not None or b.get('erase')is True or b.get('timing')is not None or b.get('sequentialRandom')is not None or not isinstance(r,dict)or r.get('blendMode')!='normal'or r.get('accumulation')!='directOver'or r.get('wetEdges',0)!=0 or r.get('burntEdges',0)!=0 or isinstance(source,dict)and source.get('fanCorners')is not None or angular and source!={'version':1,'initialDirection':'cursorHistory'}):raise ValueError('GIH dimensions require native root static normal directOver Pixel')
    if uses_mode(a,'velocity'):
        speed=b.get('speedInput')
        if not isinstance(speed,dict)or speed!={'version':1,'space':'view','maximum':30,'estimator':'grafettoEMA30ms'}or type(speed.get('version'))is not int or type(speed.get('maximum'))not in(int,float):raise ValueError('GIH dimensions require captured speedInput30')
