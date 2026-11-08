"""Revision86 original GIH geometry; no pixel rescale or implicit render fallback."""
import math

def frame_bounds(width,height,side):
    if type(side)is not int or not 2<=side<=2048 or side&(side-1) or any(type(n)not in(int,float)or not 1<=n<=side or not math.isfinite(n)or n!=int(n)for n in(width,height)):
        raise ValueError('Invalid variable GIH original dimensions')
    longest=max(width,height)
    bounds={'x':((side-width)//2+(width-longest)/2)/side,'y':((side-height)//2+(height-longest)/2)/side,'width':longest/side,'height':longest/side}
    if bounds['x']<0 or bounds['y']<0:raise ValueError('Variable GIH original requires additional padding')
    return bounds

def same_bounds(actual,expected):
    return isinstance(actual,dict) and set(actual)==set(expected) and all(type(actual[k])in(int,float) and math.isfinite(actual[k]) and actual[k]==v and not(v==0 and math.copysign(1,actual[k])<0) for k,v in expected.items())

def _is_sensor_original_rgba(d,equal,kind='rgba'):
    lightness=kind=='lightness';gradient=kind=='gradient'
    """Common metadata eligibility; canonical sizes/padding/selectors validate later."""
    if not isinstance(d,dict)or type(d.get('version'))is not int or d['version']<(125 if gradient else 123 if lightness and equal else 124 if lightness else 121 if equal else 119) or d.get('model')!='stamp'or d.get('paperInteraction')!=0:return False
    t=d.get('tip');b=d.get('behavior')
    if not isinstance(t,dict)or not isinstance(b,dict):return False
    a=t.get('animation');c=t.get('color')
    if t.get('kind')!='bitmap'or not isinstance(a,dict)or a.get('mode')not in('angular','xtilt','ytilt','dimensions')or not isinstance(a.get('frames'),list)or not 2<=len(a['frames'])<=256 or kind=='rgba' and(not isinstance(c,dict)or set(c)!={'planes','frames'}):return False
    if equal:
        if 'geometry'in a:return False
    elif not isinstance(a.get('geometry'),dict)or a['geometry'].get('version')!=1 or not isinstance(a['geometry'].get('frames'),list)or len(a['geometry']['frames'])!=len(a['frames']):return False
    def ref(v):return isinstance(v,str)and len(v)==70 and v.startswith('asset:')and all(x in'0123456789abcdef'for x in v[6:])
    def triple(v):return isinstance(v,list)and len(v)==3 and all(ref(x)for x in v)
    if lightness:
        material=t.get('material')
        if 'color'in t or not isinstance(material,dict)or set(material)!={'kind','gray','grayFrames','strength'}or material.get('kind')!='lightness'or not ref(material.get('gray'))or not isinstance(material.get('grayFrames'),list)or len(material['grayFrames'])!=len(a['frames'])or not all(ref(v)for v in material['grayFrames'])or material['grayFrames'][0]!=material['gray']or not all(ref(v)for v in a['frames'])or type(material.get('strength'))not in(int,float)or not math.isfinite(material['strength'])or not 0<=material['strength']<=1:return False
    elif gradient:
        g=c.get('gradient')if isinstance(c,dict)and set(c)=={'gradient'}else None
        if not isinstance(g,dict)or set(g)!={'gray','grayFrames','sampling'}or g.get('sampling')!='filteredGray-v1'or not ref(g.get('gray'))or not isinstance(g.get('grayFrames'),list)or len(g['grayFrames'])!=len(a['frames'])or not all(ref(v)for v in a['frames']+g['grayFrames'])or g['grayFrames'][0]!=g['gray']:return False
    else:
        rgb=c['frames']
        if not all(ref(v)for v in a['frames'])or not triple(c['planes'])or not isinstance(rgb,list)or len(rgb)!=len(a['frames'])or not all(triple(v)for v in rgb)or rgb[0]!=c['planes']:return False
    if not equal:
        rows=a['geometry']['frames']
        if not all(isinstance(v,dict)and all(type(v.get(k))is int and 1<=v[k]<=2048 for k in('sourceWidth','sourceHeight'))and isinstance(v.get('maskBounds'),dict)for v in rows):return False
        if not any((v['sourceWidth'],v['sourceHeight'])!=(rows[0]['sourceWidth'],rows[0]['sourceHeight'])for v in rows):return False
    if any(k in t for k in('profile','autoNoise','autoShape','imageSampling')+(()if lightness else('material',)))or any(k in d for k in('mixer','wet','texture','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'))or not isinstance(d.get('scatter',{}),dict)or d.get('scatter',{}).get('radius',0)>0:return False
    r=b.get('rendering');source=b.get('strokeInput')
    if b.get('version')!=2 or any(k in b for k in('dual','timing','sequentialRandom','wetMix','edgeBleed','colorAdjustment'))or b.get('erase')is True or isinstance(source,dict)and'fanCorners'in source or not isinstance(r,dict)or r.get('blendMode')!='normal'or r.get('accumulation')!='directOver'or r.get('wetEdges',0)!=0 or r.get('burntEdges',0)!=0:return False
    return not any(isinstance(b.get(section),dict)and any(k in b[section]for k in('hue','saturation','brightness','sharpness'))for section in('dynamics','modulations'))

def is_sensor_original_rgba119(d):
    return _is_sensor_original_rgba(d,False)

def is_sensor_original_rgba121(d):
    return _is_sensor_original_rgba(d,True)

def is_equal_lightness_gih123(d):
    return _is_sensor_original_rgba(d,True,'lightness')

def is_equal_gradient_gih125(d):
    return _is_sensor_original_rgba(d,True,'gradient')

def is_unequal_lightness_gih124(d):
    return _is_sensor_original_rgba(d,False,'lightness')

def validate_variable_gih_descriptor(d,asset_sizes):
    tip=d.get('tip',{});animation=tip.get('animation',{});b=d.get('behavior',{})
    dual=b.get('dual',{});child=dual.get('brush',{})if isinstance(dual,dict)else{}
    child_tip=child.get('tip',{})if isinstance(child,dict)else{}
    child_animation=child_tip.get('animation',{})if isinstance(child_tip,dict)else{}
    if isinstance(child_animation,dict)and 'geometry'in child_animation:raise ValueError('Variable GIH child is unsupported')
    if not isinstance(animation,dict)or 'geometry'not in animation:return
    if any(k in b and not isinstance(b[k],dict)for k in('rendering','dynamics','modulations')):raise ValueError('Invalid variable GIH behavior')
    g=animation['geometry'];frames=animation.get('frames');lightness=is_unequal_lightness_gih124(d)
    if animation.get('mode')in('angular','xtilt','ytilt','dimensions'):
        scatter=d.get('scatter',{})
        if d.get('version',0)<118 or not isinstance(scatter,dict)or scatter.get('radius',0)>0 or('color'in tip and not is_sensor_original_rgba119(d))or any(k in tip and(k!='material'or not lightness)for k in('material','imageSampling','profile','autoNoise','autoShape')):raise ValueError('Sensor GIH original geometry requires118 alpha without positional scatter')
    if type(d.get('version'))is not int or d['version']<86 or d.get('model')!='stamp' or any(k in d for k in('mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')) or tip.get('kind')!='bitmap' or any(k in tip and(k!='material'or not lightness)for k in('profile','autoNoise','autoShape','imageSampling','material')) or any(k in b for k in('dual','edgeBleed','colorAdjustment')) or b.get('rendering',{}).get('wetEdges') or any('sharpness'in b.get(k,{}) for k in('dynamics','modulations')):
        raise ValueError('Unsupported variable GIH geometry combination')
    if not isinstance(g,dict) or set(g)!={'version','frames'} or type(g['version'])is not int or g['version']!=1 or not isinstance(frames,list) or not 2<=len(frames)<=256 or any(not isinstance(a,str)or a not in asset_sizes for a in frames) or not isinstance(g['frames'],list) or len(g['frames'])!=len(frames):
        raise ValueError('Invalid variable GIH geometry inventory')
    for index,row in enumerate(g['frames']):
        if not isinstance(row,dict) or set(row)!={'sourceWidth','sourceHeight','maskBounds'}:raise ValueError('Invalid variable GIH geometry fields')
        side=asset_sizes.get(frames[index],0);expected=frame_bounds(row['sourceWidth'],row['sourceHeight'],side)
        if not same_bounds(row['maskBounds'],expected):raise ValueError('Variable GIH geometry differs from original padding')
        if index==0 and not same_bounds(tip.get('maskBounds'),expected):raise ValueError('Variable GIH reference bounds differ')
    if 'color'in tip:
        c=tip['color']
        if not isinstance(c,dict)or set(c)!={'planes','frames'} or not isinstance(c['frames'],list)or len(c['frames'])!=len(frames)or c['frames'][0]!=c['planes']:raise ValueError('Variable GIH colour frames are unsupported or incomplete')
        for index,planes in enumerate(c['frames']):
            if not isinstance(planes,list)or len(planes)!=3 or any(not isinstance(a,str)or asset_sizes.get(a)!=asset_sizes.get(frames[index])for a in planes):raise ValueError('Variable GIH colour plane dimensions differ')

    if lightness:
        gray=tip['material']['grayFrames']
        if any(asset_sizes.get(alpha)!=asset_sizes.get(gray[index])for index,alpha in enumerate(frames)):raise ValueError('Unequal Lightness124 paired dimensions differ')
